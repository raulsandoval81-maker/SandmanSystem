// functions/src/modules/paraComms/postAnnouncements.ts
import { logger } from "firebase-functions/logger";
import { onCall } from "firebase-functions/v2/https";
import { admin, db } from "../infra/admin"; // <-- adjust path to your real infra/admin

export const postAnnouncement = onCall(async (req) => {
  try {
    const { subject, text_en, text_es, coachName } = req.data || {};

    if (!subject || !text_en) {
      logger.warn("❌ Missing subject or English body.");
      return { ok: false, error: "Missing data" };
    }

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const entry = {
      subject,
      text_en,
      text_es: text_es || "",
      coachName: coachName || "Coach",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("bulletin").doc(monthKey).collection("entries").add(entry);

    logger.info("📢 Announcement posted", entry);

    if (process.env.SANDMAN_EMAIL_ENABLED !== "true") {
      logger.info("📪 Email Notification: OFF (Pilot Mode)");
      return { ok: true, mode: "internal" };
    }

    return { ok: true, mode: "email" };
  } catch (err: any) {
    logger.error("🔥 Error posting announcement", err);
    return { ok: false, error: err.message };
  }
});
