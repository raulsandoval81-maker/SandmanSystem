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
exports.sendGatekeeperEmail = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const resend_1 = require("resend");
const appointmentFormatting_1 = require("./appointment/appointmentFormatting");
const buildAppointmentEmail_1 = require("./appointment/buildAppointmentEmail");
const appointmentStatus_1 = require("./appointment/appointmentStatus");
exports.sendGatekeeperEmail = functions.firestore
    .document("interest_leads/{leadId}")
    .onUpdate(async (change, context) => {
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
    const leadId = (0, appointmentFormatting_1.clean)(context.params.leadId);
    const appointmentRef = (0, firestore_1.getFirestore)()
        .collection("admissions_appointments")
        .doc(leadId);
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
    const resendKey = functions
        .config()
        .resend?.key;
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
        });
        if (result.error) {
            throw new Error(result.error.message ||
                "Resend rejected the appointment email.");
        }
        const emailId = result.data?.id || "";
        /*
         * Synchronize BOTH records.
         *
         * interest_leads drives Gatekeeper.
         * admissions_appointments drives the
         * Management appointment workspace.
         */
        await (0, appointmentStatus_1.markConfirmationSent)(change.after.ref, emailId);
        await (0, appointmentStatus_1.markConfirmationSent)(appointmentRef, emailId);
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
        /*
         * Keep Management and the lead
         * record synchronized on failure too.
         */
        await (0, appointmentStatus_1.markConfirmationFailed)(change.after.ref, message);
        await (0, appointmentStatus_1.markConfirmationFailed)(appointmentRef, message);
    }
});
