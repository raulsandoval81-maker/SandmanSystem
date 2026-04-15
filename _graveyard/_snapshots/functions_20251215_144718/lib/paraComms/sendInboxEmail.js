"use strict";
// functions/src/paraComms/sendInboxEmail.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInboxEmail = void 0;
const v2_1 = require("firebase-functions/v2");
const firebase_functions_1 = require("firebase-functions");
exports.sendInboxEmail = v2_1.firestore.onDocumentCreated("parentInbox/{month}/entries/{msgId}", async (event) => {
    try {
        const snap = event.data;
        if (!snap) {
            firebase_functions_1.logger.warn("❌ No snapshot found in sendInboxEmail trigger.");
            return;
        }
        const data = snap.data();
        firebase_functions_1.logger.info("📬 New Parent → Coach Inbox Message:", data);
        // 🟧 PILOT MODE – EXTERNAL EMAIL DISABLED
        firebase_functions_1.logger.info("📪 Inbox Email: Pilot Mode (internal only). No external send.");
        // 🟦 BLAZE MODE – FUTURE EMAIL LOGIC (kept, commented)
        /*
        const SENDGRID_KEY = SENDGRID_API_KEY.value();
        await axios.post("https://api.sendgrid.com/v3/mail/send", {...});
        logger.info("📧 Inbox email sent to coach");
        */
        return;
    }
    catch (err) {
        firebase_functions_1.logger.error("🔥 Error in sendInboxEmail:", err);
    }
});
