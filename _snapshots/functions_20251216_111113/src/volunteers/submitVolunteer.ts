import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const submitVolunteer = onRequest(async (req, res): Promise<void> => {
  // --- CORS ---
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  try {
    const {
      seasonYear,
      eventId,
      parentName,
      athleteName,
      phone,
      email,
      language,
      helps,
      notes,
      timestamp,
    } = req.body || {};

    if (!seasonYear || !eventId) {
      res.status(400).json({ ok: false, error: "Missing seasonYear or eventId" });
      return;
    }

    if (!parentName || !athleteName) {
      res.status(400).json({ ok: false, error: "Missing parent or athlete name" });
      return;
    }

    const path = `volunteers/${seasonYear}/events/${eventId}/signups`;

    const docRef = await db.collection(path).add({
      seasonYear,
      eventId,
      parentName,
      athleteName,
      phone: phone || "",
      email: email || "",
      language: language || "",
      helps: Array.isArray(helps) ? helps : [],
      notes: notes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      clientTimestamp: timestamp || null,
    });

    res.status(200).json({
      ok: true,
      signupId: docRef.id,
      message: "Volunteer submission saved.",
    });
  } catch (err: any) {
    console.error("submitVolunteer ERROR:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Server error",
    });
  }
});
