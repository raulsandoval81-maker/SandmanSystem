"use strict";
// functions/src/modules/paraComms/postAnnouncements.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.postAnnouncement = void 0;
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
// 🔧 Future Email Support (OFF in Pilot Mode)
// import axios from "axios";
// import { defineSecret } from "firebase-functions/params";
// const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const db = (0, firestore_1.getFirestore)();
/**
 * 🚀 postAnnouncements
 * Coach → Parent (Announcements Page)
 *
 * Pilot Mode: Writes to Firestore only.
 * Future Mode: Email notification can be activated.
 */
exports.postAnnouncement = (0, https_1.onCall)(async (req) => {
    try {
        const { subject, text_en, text_es, coachName } = req.data || {};
        if (!subject || !text_en) {
            firebase_functions_1.logger.warn("❌ Missing subject or English body.");
            return { ok: false, error: "Missing data" };
        }
        // Create month bucket
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        // Write to Firestore
        const entry = {
            subject,
            text_en,
            text_es: text_es || "",
            coachName: coachName || "Coach",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await db
            .collection("bulletin")
            .doc(monthKey)
            .collection("entries")
            .add(entry);
        firebase_functions_1.logger.info("📢 Announcement posted", entry);
        // 🟧 Pilot Mode: email disabled
        if (process.env.SANDMAN_EMAIL_ENABLED !== "true") {
            firebase_functions_1.logger.info("📪 Email Notification: OFF (Pilot Mode)");
            return { ok: true, mode: "internal" };
        }
        // 🟦 FUTURE MODE (Email ON)
        /*
        const SENDGRID_KEY = SENDGRID_API_KEY.value();
    
        await axios.post(
          "https://api.sendgrid.com/v3/mail/send",
          {
            personalizations: [
              {
                to: [{ email: "parent@example.com" }],
                subject: `Announcement: ${subject}`,
              },
            ],
            from: { email: "no-reply@sandmansystem.com" },
            content: [{ type: "text/plain", value: text_en }],
          },
          {
            headers: {
              Authorization: `Bearer ${SENDGRID_KEY}`,
            },
          }
        );
    
        logger.info("📧 Announcement email sent");
        */
        return { ok: true, mode: "email" };
    }
    catch (err) {
        firebase_functions_1.logger.error("🔥 Error posting announcement", err);
        return { ok: false, error: err.message };
    }
});
