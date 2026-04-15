// functions/src/paraComms/inboxReplyEmail.ts

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/logger";

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
export const sendCoachReplyEmail = onDocumentCreated(
  "parentInbox/{month}/entries/{msgId}/thread/{replyId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) {
        logger.warn("❌ sendCoachReplyEmail: No snapshot found.");
        return;
      }

      const data = snap.data();
      logger.info("📨 New Coach → Parent Reply", {
        month: event.params.month,
        msgId: event.params.msgId,
        replyId: event.params.replyId,
        data,
      });

      // 🟧 PILOT MODE — external email disabled
      logger.info("🟫 Coach reply stored internally (PILOT MODE)");

      /*
      // 🟦 FUTURE MODE — External Email (kept OFF)
      await axios.post("https://api.sendgrid.com/v3/mail/send", {...});
      logger.info("📧 Reply email sent to parent");
      */

      return;
    } catch (err: any) {
      logger.error("🔥 Error in sendCoachReplyEmail trigger", err);
    }
  }
);
