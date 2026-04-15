"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postAnnouncement = void 0;
// functions/src/modules/paraComms/postAnnouncements.ts
const logger_1 = require("firebase-functions/logger");
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("../infra/admin"); // <-- adjust path to your real infra/admin
exports.postAnnouncement = (0, https_1.onCall)(async (req) => {
    try {
        const { subject, text_en, text_es, coachName } = req.data || {};
        if (!subject || !text_en) {
            logger_1.logger.warn("❌ Missing subject or English body.");
            return { ok: false, error: "Missing data" };
        }
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const entry = {
            subject,
            text_en,
            text_es: text_es || "",
            coachName: coachName || "Coach",
            createdAt: admin_1.admin.firestore.FieldValue.serverTimestamp(),
        };
        await admin_1.db.collection("bulletin").doc(monthKey).collection("entries").add(entry);
        logger_1.logger.info("📢 Announcement posted", entry);
        if (process.env.SANDMAN_EMAIL_ENABLED !== "true") {
            logger_1.logger.info("📪 Email Notification: OFF (Pilot Mode)");
            return { ok: true, mode: "internal" };
        }
        return { ok: true, mode: "email" };
    }
    catch (err) {
        logger_1.logger.error("🔥 Error posting announcement", err);
        return { ok: false, error: err.message };
    }
});
