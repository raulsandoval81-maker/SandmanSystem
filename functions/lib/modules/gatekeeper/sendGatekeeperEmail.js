"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendGatekeeperEmailV2 = exports.sendGatekeeperEmail = exports.RESEND_API_KEY = void 0;
exports.gatekeeperTransitionIdentity = gatekeeperTransitionIdentity;
exports.gatekeeperTransitionHash = gatekeeperTransitionHash;
exports.gatekeeperProviderIdempotencyKey = gatekeeperProviderIdempotencyKey;
exports.handleGatekeeperUpdate = handleGatekeeperUpdate;
const node_crypto_1 = require("node:crypto");
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-admin/firestore");
const resend_1 = require("resend");
const appointmentFormatting_1 = require("./appointment/appointmentFormatting");
const buildAppointmentEmail_1 = require("./appointment/buildAppointmentEmail");
const appointmentStatus_1 = require("./appointment/appointmentStatus");
exports.RESEND_API_KEY = (0, params_1.defineSecret)("RESEND_API_KEY");
const CLAIM_LEASE_MS = 5 * 60 * 1000;
const TRANSITION_MARKER = "appointment-confirmation-pending";
function gatekeeperTransitionIdentity(leadId, afterUpdateTime) {
    return [leadId, afterUpdateTime, TRANSITION_MARKER].join(":");
}
function gatekeeperTransitionHash(identity) {
    return (0, node_crypto_1.createHash)("sha256").update(identity).digest("hex");
}
function gatekeeperProviderIdempotencyKey(transitionHash) {
    return `gatekeeper-${transitionHash}`;
}
async function claimSend(deliveryRef, transitionIdentity, transitionHash, leadId) {
    const db = (0, firestore_2.getFirestore)();
    const claimId = (0, node_crypto_1.randomUUID)();
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(deliveryRef);
        const existing = snap.data() || {};
        if (existing.status === "completed") {
            return {
                state: "completed",
                emailId: (0, appointmentFormatting_1.clean)(existing.emailId),
            };
        }
        const leaseUntil = existing.leaseUntil?.toDate?.();
        if (existing.status === "processing" &&
            leaseUntil instanceof Date &&
            leaseUntil.getTime() > Date.now()) {
            return { state: "busy" };
        }
        tx.set(deliveryRef, {
            transitionIdentity,
            transitionHash,
            transitionMarker: TRANSITION_MARKER,
            leadId,
            status: "processing",
            claimId,
            leaseUntil: firestore_2.Timestamp.fromMillis(Date.now() + CLAIM_LEASE_MS),
            attemptCount: firestore_2.FieldValue.increment(1),
            providerIdempotencyKey: gatekeeperProviderIdempotencyKey(transitionHash),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            createdAt: existing.createdAt || firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { state: "claimed", claimId };
    });
}
async function markDeliveryFailed(deliveryRef, claimId, message) {
    const db = (0, firestore_2.getFirestore)();
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(deliveryRef);
        const delivery = snap.data() || {};
        if (delivery.status !== "processing" ||
            delivery.claimId !== claimId) {
            return;
        }
        tx.set(deliveryRef, {
            status: "failed",
            lastError: message,
            leaseUntil: null,
            failedAt: firestore_2.FieldValue.serverTimestamp(),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
async function markDeliveryCompleted(deliveryRef, claimId, emailId) {
    const db = (0, firestore_2.getFirestore)();
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(deliveryRef);
        const delivery = snap.data() || {};
        if (delivery.status === "completed") {
            return;
        }
        if (delivery.status !== "processing" ||
            delivery.claimId !== claimId) {
            throw new Error("Gatekeeper delivery claim was lost before completion.");
        }
        tx.set(deliveryRef, {
            status: "completed",
            emailId,
            completedAt: firestore_2.FieldValue.serverTimestamp(),
            leaseUntil: null,
            lastError: "",
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
async function syncConfirmationSent(leadRef, appointmentRef, emailId) {
    await (0, appointmentStatus_1.markConfirmationSent)(leadRef, emailId);
    await (0, appointmentStatus_1.markConfirmationSent)(appointmentRef, emailId);
}
function snapshotUpdateTime(snapshot) {
    const updateTime = snapshot.updateTime;
    if (!updateTime) {
        throw new Error("Gatekeeper snapshot update time is missing.");
    }
    return `${updateTime.seconds}.${String(updateTime.nanoseconds).padStart(9, "0")}`;
}
async function handleGatekeeperUpdate(change, leadIdInput, resendKey) {
    const before = change.before.data();
    const after = change.after.data();
    const beforeStatus = (0, appointmentFormatting_1.clean)(before
        .appointmentConfirmationStatus);
    const afterStatus = (0, appointmentFormatting_1.clean)(after
        .appointmentConfirmationStatus);
    /*
     * Gatekeeper only sends when the
     * confirmation state enters "pending".
     */
    if (afterStatus !== "pending") {
        return;
    }
    /*
     * Prevent duplicate sends.
     *
     * If the document was already pending
     * before this update, Gatekeeper does
     * nothing.
     */
    if (beforeStatus === "pending") {
        return;
    }
    const leadId = (0, appointmentFormatting_1.clean)(leadIdInput);
    if (!leadId) {
        throw new Error("Gatekeeper lead identity is missing.");
    }
    const transitionIdentity = gatekeeperTransitionIdentity(leadId, snapshotUpdateTime(change.after));
    const transitionHash = gatekeeperTransitionHash(transitionIdentity);
    const db = (0, firestore_2.getFirestore)();
    const appointmentRef = db
        .collection("admissions_appointments")
        .doc(leadId);
    const deliveryRef = db
        .collection("gatekeeperEmailDeliveries")
        .doc(transitionHash);
    const parentEmail = (0, appointmentFormatting_1.clean)(after.email).toLowerCase();
    /*
     * Missing recipient email
     */
    if (!parentEmail) {
        const message = "Missing parent email address.";
        console.error("[gatekeeper] Missing parent email:", leadId);
        await (0, appointmentStatus_1.markConfirmationFailed)(change.after.ref, message);
        await (0, appointmentStatus_1.markConfirmationFailed)(appointmentRef, message);
        return;
    }
    /*
     * Missing Resend configuration
     */
    if (!resendKey) {
        const message = "Missing Resend API key.";
        console.error("[gatekeeper] Missing Resend API key");
        await (0, appointmentStatus_1.markConfirmationFailed)(change.after.ref, message);
        await (0, appointmentStatus_1.markConfirmationFailed)(appointmentRef, message);
        return;
    }
    const claim = await claimSend(deliveryRef, transitionIdentity, transitionHash, leadId);
    if (claim.state === "completed") {
        await syncConfirmationSent(change.after.ref, appointmentRef, claim.emailId);
        return;
    }
    if (claim.state === "busy") {
        throw new Error("Gatekeeper email event is already being processed.");
    }
    let providerCompleted = false;
    try {
        const email = (0, buildAppointmentEmail_1.buildAppointmentEmail)(after);
        const resend = new resend_1.Resend(resendKey);
        const result = await resend
            .emails
            .send({
            from: "Sandman Combat <join@sandmancombat.com>",
            replyTo: "joinsandmancombat@gmail.com",
            to: parentEmail,
            subject: email.subject,
            text: email.text,
            html: email.html
        }, {
            idempotencyKey: gatekeeperProviderIdempotencyKey(transitionHash),
        });
        if (result.error) {
            throw new Error(result.error.message ||
                "Resend rejected the appointment email.");
        }
        const emailId = result.data?.id || "";
        providerCompleted = true;
        /*
         * Record provider completion first.
         * A retry can recover this email ID and
         * finish either interrupted status write.
         */
        await markDeliveryCompleted(deliveryRef, claim.claimId, emailId);
        /*
         * Synchronize BOTH records.
         *
         * interest_leads drives Gatekeeper.
         * admissions_appointments drives the
         * Management appointment workspace.
         */
        await syncConfirmationSent(change.after.ref, appointmentRef, emailId);
        console.log("[gatekeeper] Appointment confirmation sent:", {
            leadId,
            parentEmail,
            appointmentDate: after.appointmentDate,
            appointmentTime: after.appointmentTime,
            appointmentLocation: after.appointmentLocation,
            appointmentCoach: after.appointmentCoach,
            emailId
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Unable to send appointment confirmation.";
        console.error("[gatekeeper] Appointment email failed:", leadId, error);
        if (!providerCompleted) {
            await markDeliveryFailed(deliveryRef, claim.claimId, message);
            /*
             * Preserve the existing failed status
             * only when Resend has not completed.
             */
            await (0, appointmentStatus_1.markConfirmationFailed)(change.after.ref, message);
            await (0, appointmentStatus_1.markConfirmationFailed)(appointmentRef, message);
        }
        /*
         * retry:true redelivers the same event.
         * The durable event record and Resend
         * idempotency key prevent a new send.
         */
        throw error;
    }
}
exports.sendGatekeeperEmail = functions
    .runWith({
    secrets: [exports.RESEND_API_KEY],
    failurePolicy: true,
})
    .firestore.document("interest_leads/{leadId}")
    .onUpdate(async (change, context) => {
    await handleGatekeeperUpdate(change, (0, appointmentFormatting_1.clean)(context.params.leadId), exports.RESEND_API_KEY.value());
});
exports.sendGatekeeperEmailV2 = (0, firestore_1.onDocumentUpdated)({
    document: "interest_leads/{leadId}",
    secrets: [exports.RESEND_API_KEY],
    retry: true,
}, async (event) => {
    const change = event.data;
    if (!change)
        return;
    await handleGatekeeperUpdate(change, (0, appointmentFormatting_1.clean)(event.params.leadId), exports.RESEND_API_KEY.value());
});
