// functions/src/paraComms/inboxReplyEmail.ts

import { firestore } from "firebase-functions/v2";
import { logger } from "firebase-functions/logger";

export const sendCoachReplyEmail = firestore.onDocumentCreated(
  "parentInbox/{month}/entries/{msgId}/thread/{replyId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) {
        logger.warn("❌ No snapshot in sendCoachReplyEmail trigger.");
        return;
      }

      const data = snap.data();
      logger.info("📨 New Coach → Parent Reply:", data);

      // 🟧 PILOT MODE – INTERNAL ONLY
      logger.info("🟫 Coach reply stored internally. No external email sent.");

      // 🟦 BLAZE MODE – FUTURE EMAIL (commented)
      /*
      await axios.post("https://api.sendgrid.com/v3/mail/send", {...});
      logger.info("📧 Reply email sent to parent");
      */

      return;
    } catch (err: any) {
      logger.error("🔥 Error in sendCoachReplyEmail:", err);
    }
  }
);
