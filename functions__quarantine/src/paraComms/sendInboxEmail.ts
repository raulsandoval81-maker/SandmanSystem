// functions/src/paraComms/sendInboxEmail.ts

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/logger";

/**
 * 📬 sendInboxEmail
 * Triggered when a parent sends a message to the coach inbox.
 *
 * PILOT MODE:
 * - Logs message internally only
 * - No external email is sent
 *
 * FUTURE MODE:
 * - External email can be enabled later (SendGrid, etc.)
 */
export const sendInboxEmail = onDocumentCreated(
  "parentInbox/{month}/entries/{msgId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) {
        logger.warn("❌ sendInboxEmail: No snapshot found.");
        return;
      }

      const data = snap.data();
      logger.info("📬 New Parent → Coach Inbox Message", {
        month: event.params.month,
        msgId: event.params.msgId,
        data,
      });

      // 🟧 PILOT MODE — external email disabled
      logger.info("📪 Inbox Email: PILOT MODE (internal log only)");

      /*
      // 🟦 FUTURE MODE — External Email (kept OFF)
      const SENDGRID_KEY = SENDGRID_API_KEY.value();
      await axios.post("https://api.sendgrid.com/v3/mail/send", {...});
      logger.info("📧 Inbox email sent to coach");
      */

      return;
    } catch (err: any) {
      logger.error("🔥 Error in sendInboxEmail trigger", err);
    }
  }
);
