"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markConfirmationFailed = markConfirmationFailed;
exports.markConfirmationSent = markConfirmationSent;
async function markConfirmationFailed(ref, message) {
    await ref.update({
        appointmentConfirmationStatus: "failed",
        appointmentConfirmationError: message,
        appointmentConfirmationFailedAt: new Date()
    });
}
async function markConfirmationSent(ref, emailId) {
    await ref.update({
        appointmentConfirmationStatus: "sent",
        appointmentConfirmationSentAt: new Date(),
        appointmentConfirmationError: "",
        appointmentEmailId: emailId
    });
}
