// ⚠️ LEGACY HANDLER (ACTIVE)
// Handles contact + volunteer submissions
// Not yet migrated to /functions
// Do NOT delete until migration is complete


import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import cors from "cors";
import {Readable} from "node:stream";
import Busboy from "busboy";

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const allowCors = cors({ origin: true });

// Parse x-www-form-urlencoded or multipart/form-data (HTML forms)
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      // Accept JSON too for debugging
      return resolve(req.body || {});
    }
    try {
      const busboy = Busboy({ headers: req.headers });
      const fields = {};
      busboy.on("field", (name, val) => { fields[name] = val; });
      busboy.on("error", reject);
      busboy.on("finish", () => resolve(fields));
      const buf = typeof req.rawBody === "object" ? req.rawBody : Buffer.from(req.rawBody || "");
      Readable.from(buf).pipe(busboy);
    } catch (e) { reject(e); }
  });
}

// Shared minimal server-side guardrails
function basicGuards(fields, minMs = 1000) {
  // Honeypot
  if ((fields.nickname || "").trim()) return { ok: false, reason: "honeypot" };
  // Speed/antibot: if client sent ts, check it; otherwise pass
  const ts = Number(fields.__pageload_ts || 0);
  if (ts && Date.now() - ts < minMs) return { ok: false, reason: "too_fast" };
  return { ok: true };
}

// Generic saver
async function saveSubmission(col, data, req) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ua = req.headers["user-agent"] || "";
  const doc = {
    ...data,
    _meta: {
      ip,
      ua,
      at: admin.firestore.FieldValue.serverTimestamp(),
      referer: req.headers.referer || "",
    },
  };
  await db.collection(col).add(doc);
}

function redirect(res, location) {
  // 303 ensures a GET to the thanks page
  res.setHeader("Location", location);
  res.status(303).send();
}

export const submitContact = functions.https.onRequest(async (req, res) => {
  allowCors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    try {
      const fields = await parseForm(req);
      const guards = basicGuards(fields, 1500); // 1.5s tolerance
      if (!guards.ok) return redirect(res, "/thanks/contact.html"); // silent

      // Minimal required fields
      const { name, email, subject, message } = fields;
      if (!name || !email || !message) return redirect(res, "/thanks/contact.html"); // silent

      await saveSubmission("contact_submissions", { name, email, subject: subject || "", message }, req);
      return redirect(res, "/thanks/contact.html");
    } catch (e) {
      // Silent: still redirect to thanks
      return redirect(res, "/thanks/contact.html");
    }
  });
});

export const submitVolunteer = functions.https.onRequest(async (req, res) => {
  allowCors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    try {
      const fields = await parseForm(req);
      const guards = basicGuards(fields, 1500);
      if (!guards.ok) return redirect(res, "/thanks/volunteer.html");

      const {
        name, email, phone, role, availability, affiliation, message
      } = fields;
      if (!name || !email) return redirect(res, "/thanks/volunteer.html");

      await saveSubmission("volunteer_submissions", {
        name, email, phone: phone || "", role: role || "",
        availability: availability || "", affiliation: affiliation || "",
        message: message || ""
      }, req);
      return redirect(res, "/thanks/volunteer.html");
    } catch (e) {
      return redirect(res, "/thanks/volunteer.html");
    }
  });
});
