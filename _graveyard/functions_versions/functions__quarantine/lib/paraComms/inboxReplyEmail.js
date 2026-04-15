"use strict";
// functions/src/paraComms/inboxReplyEmail.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCoachReplyEmail = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const logger_1 = require("firebase-functions/logger");
/**
 * 📨 sendCoachReplyEmail
 * Triggered when coach replies inside a parent inbox thread.
 *
 * PILOT MODE:
 * - Logs reply internally only
 * - No external email is sent
 *
 * FUTURE MODE:
 * - External email can be enabled later (SendGrid, etc.)
 */
exports.sendCoachReplyEmail = (0, firestore_1.onDocumentCreated)("parentInbox/{month}/entries/{msgId}/thread/{replyId}", async (event) => {
    try {
        const snap = event.data;
        if (!snap) {
            logger_1.logger.warn("❌ sendCoachReplyEmail: No snapshot found.");
            return;
        }
        const data = snap.data();
        logger_1.logger.info("📨 New Coach → Parent Reply", {
            month: event.params.month,
            msgId: event.params.msgId,
            replyId: event.params.replyId,
            data,
        });
        // 🟧 PILOT MODE — external email disabled
        logger_1.logger.info("🟫 Coach reply stored internally (PILOT MODE)");
        /*
        // 🟦 FUTURE MODE — External Email (kept OFF)
        await axios.post("https://api.sendgrid.com/v3/mail/send", {...});
        logger.info("📧 Reply email sent to parent");
        */
        return;
    }
    catch (err) {
        logger_1.logger.error("🔥 Error in sendCoachReplyEmail trigger", err);
    }
});
