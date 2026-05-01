// ⚠️ LEGACY HANDLER (ACTIVE)
// Handles contact + volunteer submissions
// Not yet migrated to /functions v2 or dedicated service layer
// Do NOT delete until migration is complete

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import cors from "cors";
import { Readable } from "node:stream";
import Busboy from "busboy";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const allowCors = cors({ origin: true });

// ---------------------------------
// Helpers
// ---------------------------------

function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req: functions.https.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    return safeTrim(forwarded[0]?.split(",")[0]);
  }
  return safeTrim(String(forwarded || "").split(",")[0]);
}

// Parse x-www-form-urlencoded or multipart/form-data (HTML forms)
// Falls back to req.body for JSON/debugging requests.
function parseForm(req: functions.https.Request): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");

    if (
      !contentType.includes("multipart/form-data") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(body)) {
        normalized[key] = safeTrim(value);
      }
      return resolve(normalized);
    }

    try {
      const busboy = Busboy({ headers: req.headers });
      const fields: Record<string, string> = {};

      busboy.on("field", (name: string, val: string) => {
        fields[name] = safeTrim(val);
      });

      busboy.on("error", reject);
      busboy.on("finish", () => resolve(fields));

      const raw =
        req.rawBody instanceof Buffer
          ? req.rawBody
          : Buffer.from(req.rawBody || "");

      Readable.from(raw).pipe(busboy);
    } catch (error) {
      reject(error);
    }
  });
}

// Shared minimal server-side guardrails
function basicGuards(fields: Record<string, string>, minMs = 1000): { ok: boolean; reason?: string } {
  // Honeypot
  if (safeTrim(fields.nickname)) {
    return { ok: false, reason: "honeypot" };
  }

  // Speed / antibot
  // Light nuisance filter only; client timestamp is not trusted security.
  const ts = Number(fields.__pageload_ts || 0);
  if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < minMs) {
    return { ok: false, reason: "too_fast" };
  }

  return { ok: true };
}

async function saveSubmission(
  collectionName: string,
  data: Record<string, unknown>,
  req: functions.https.Request
): Promise<void> {
  const ip = getClientIp(req);
  const ua = safeTrim(req.headers["user-agent"]);
  const referer = safeTrim(req.headers.referer);

  const doc = {
    ...data,
    _meta: {
      ip,
      ua,
      referer,
      at: admin.firestore.FieldValue.serverTimestamp(),
    },
  };

  await db.collection(collectionName).add(doc);
}

function redirect(res: functions.Response, location: string): void {
  // 303 ensures browser follows with GET
  res.setHeader("Location", location);
  res.status(303).send("");
}

// ---------------------------------
// Handlers
// ---------------------------------

export const submitContact = functions.https.onRequest(async (req, res) => {
  allowCors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const fields = await parseForm(req);
      const guards = basicGuards(fields, 1500);
      if (!guards.ok) {
        functions.logger.warn("submitContact blocked by guard", { reason: guards.reason });
        return redirect(res, "/thanks/contact.html");
      }

      const name = safeTrim(fields.name);
      const email = safeTrim(fields.email);
      const subject = safeTrim(fields.subject);
      const message = safeTrim(fields.message);

      if (!name || !email || !message || !isValidEmail(email)) {
        functions.logger.warn("submitContact invalid payload", {
          hasName: !!name,
          hasEmail: !!email,
          emailValid: isValidEmail(email),
          hasMessage: !!message,
        });
        return redirect(res, "/thanks/contact.html");
      }

      await saveSubmission(
        "contact_submissions",
        { name, email, subject, message },
        req
      );

      return redirect(res, "/thanks/contact.html");
    } catch (error) {
      functions.logger.error("submitContact failed", error);
      return redirect(res, "/thanks/contact.html");
    }
  });
});

export const submitVolunteer = functions.https.onRequest(async (req, res) => {
  allowCors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const fields = await parseForm(req);
      const guards = basicGuards(fields, 1500);
      if (!guards.ok) {
        functions.logger.warn("submitVolunteer blocked by guard", { reason: guards.reason });
        return redirect(res, "/thanks/volunteer.html");
      }

      const name = safeTrim(fields.name);
      const email = safeTrim(fields.email);
      const phone = safeTrim(fields.phone);
      const role = safeTrim(fields.role);
      const availability = safeTrim(fields.availability);
      const affiliation = safeTrim(fields.affiliation);
      const message = safeTrim(fields.message);

      if (!name || !email || !isValidEmail(email)) {
        functions.logger.warn("submitVolunteer invalid payload", {
          hasName: !!name,
          hasEmail: !!email,
          emailValid: isValidEmail(email),
        });
        return redirect(res, "/thanks/volunteer.html");
      }

      await saveSubmission(
        "volunteer_submissions",
        {
          name,
          email,
          phone,
          role,
          availability,
          affiliation,
          message,
        },
        req
      );

      return redirect(res, "/thanks/volunteer.html");
    } catch (error) {
      functions.logger.error("submitVolunteer failed", error);
      return redirect(res, "/thanks/volunteer.html");
    }
  });
});