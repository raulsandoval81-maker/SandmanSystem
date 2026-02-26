// functions/src/paraComms/sendInboxEmail.ts

import { firestore } from "firebase-functions/v2";
import { logger } from "firebase-functions/logger";

export const sendInboxEmail = firestore.onDocumentCreated(
  "parentInbox/{month}/entries/{msgId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) {
        logger.warn("❌ No snapshot found in sendInboxEmail trigger.");
        return;
      }

      const data = snap.data();
      logger.info("📬 New Parent → Coach Inbox Message:", data);

      // 🟧 PILOT MODE – EXTERNAL EMAIL DISABLED
      logger.info("📪 Inbox Email: Pilot Mode (internal only). No external send.");

      // 🟦 BLAZE MODE – FUTURE EMAIL LOGIC (kept, commented)
      /*
      const SENDGRID_KEY = SENDGRID_API_KEY.value();
      await axios.post("https://api.sendgrid.com/v3/mail/send", {...});
      logger.info("📧 Inbox email sent to coach");
      */

      return;
    } catch (err: any) {
      logger.error("🔥 Error in sendInboxEmail:", err);
    }
  }
);
