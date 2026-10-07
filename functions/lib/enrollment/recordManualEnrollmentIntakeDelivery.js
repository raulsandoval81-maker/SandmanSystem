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
exports.recordManualEnrollmentIntakeDelivery = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const staffAuthorization_1 = require("../services/staffAuthorization");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
function isOperationalPaidProposal(proposal) {
    const status = clean(proposal.status).toUpperCase();
    const paymentStatus = clean(proposal.paymentStatus).toLowerCase();
    const paymentMethod = clean(proposal.paymentMethod).toLowerCase();
    const checkoutSessionId = clean(proposal.stripeCheckoutSessionId);
    const isLiveSession = proposal.stripeLivemode === true ||
        checkoutSessionId.startsWith("cs_live_");
    const isRecordedCashPayment = paymentMethod === "cash_prepaid" &&
        Boolean(proposal.cashPrepayment) &&
        Number(proposal.cashPrepayment?.amountCents || 0) > 0;
    return (status === "PAID" &&
        paymentStatus === "paid" &&
        Boolean(proposal.paidAt) &&
        (isRecordedCashPayment ||
            (Boolean(checkoutSessionId) &&
                !checkoutSessionId.startsWith("cs_test_") &&
                isLiveSession)));
}
const ALLOWED_METHODS = new Set(["text", "in_person"]);
exports.recordManualEnrollmentIntakeDelivery = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Management sign-in is required.");
    }
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(context.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management access is required.");
    const tokenId = clean(data?.tokenId);
    const method = clean(data?.method).toLowerCase();
    const note = clean(data?.note).slice(0, 500);
    if (!tokenId) {
        throw new functions.https.HttpsError("invalid-argument", "Intake token is required.");
    }
    if (!ALLOWED_METHODS.has(method)) {
        throw new functions.https.HttpsError("invalid-argument", "Delivery method must be text or in_person.");
    }
    const tokenRef = db.doc(`intakeTokens/${tokenId}`);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Intake handoff not found.");
    }
    const token = tokenSnap.data() || {};
    if (token.used === true) {
        throw new functions.https.HttpsError("failed-precondition", "This intake has already been submitted.");
    }
    const existingExp = Number(token.exp || 0);
    const alreadySent = clean(token.deliveryStatus).toUpperCase() === "SENT";
    if (alreadySent &&
        existingExp &&
        existingExp <= Date.now()) {
        throw new functions.https.HttpsError("failed-precondition", "This sent intake link has expired. Create a new handoff before recording delivery again.");
    }
    const proposalId = clean(token.proposalId);
    if (!proposalId) {
        throw new functions.https.HttpsError("failed-precondition", "Enrollment proposal is missing.");
    }
    const proposalSnap = await db.doc(`proposals/${proposalId}`).get();
    if (!proposalSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Enrollment proposal not found.");
    }
    const proposal = proposalSnap.data() || {};
    const currentWorkflow = clean(token.source).toLowerCase() === "management_enrollment" &&
        clean(token.mode || "new_athlete").toLowerCase() === "new_athlete";
    let legacyEnrollmentHandoff = false;
    if (!currentWorkflow) {
        const historySnapshot = await db
            .collection(`proposals/${proposalId}/history`)
            .get();
        legacyEnrollmentHandoff =
            historySnapshot.docs.some((snap) => {
                const event = snap.data() || {};
                return (clean(event.intakeTokenId) === tokenId &&
                    [
                        "INTAKE_INVITE_CREATED",
                        "INTAKE_INVITE_SENT",
                        "INTAKE_INVITE_MANUALLY_SENT"
                    ].includes(clean(event.event).toUpperCase()));
            });
    }
    if (!currentWorkflow && !legacyEnrollmentHandoff) {
        throw new functions.https.HttpsError("failed-precondition", "This is not a verified Management enrollment intake handoff.");
    }
    (0, staffAuthorization_1.requireStaffLocation)(actor, clean(token.locationId || proposal.locationId), "This enrollment is outside your Management location scope.");
    if (!isOperationalPaidProposal(proposal)) {
        throw new functions.https.HttpsError("failed-precondition", "Manual intake delivery can only be recorded for a live paid enrollment.");
    }
    const intakeAudience = clean(token.intakeAudience).toLowerCase() === "adult_athlete"
        ? "adult_athlete"
        : "parent_guardian";
    const deliveredTo = method === "text"
        ? clean(token.prefill?.phone)
        : "";
    const deliveredAtMs = Date.now();
    const exp = deliveredAtMs + (48 * 60 * 60 * 1000);
    const now = firestore_1.FieldValue.serverTimestamp();
    await tokenRef.set({
        deliveryStatus: "SENT",
        deliveryMethod: method,
        exp,
        deliveredAt: now,
        deliveredTo,
        deliveredByUid: context.auth.uid,
        manualDelivery: true,
        manualDeliveryNote: note || null,
        updatedAt: now,
    }, { merge: true });
    const eventRef = db
        .collection(`proposals/${proposalId}/history`)
        .doc();
    await eventRef.set({
        proposalId,
        event: "INTAKE_INVITE_MANUALLY_SENT",
        fromStatus: "PAID",
        toStatus: "PAID",
        createdBy: context.auth.uid,
        createdByName: "Management",
        intakeTokenId: tokenId,
        intakeAudience,
        deliveryMethod: method,
        recipient: deliveredTo || null,
        note: note || null,
        source: "management_enrollment_manual_delivery",
        occurredAt: firestore_1.FieldValue.serverTimestamp(),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        ok: true,
        proposalId,
        tokenId,
        intakeAudience,
        deliveryMethod: method,
        deliveredTo,
        note,
        exp,
    };
});
