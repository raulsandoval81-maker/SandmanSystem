// functions/src/modules/waiver/saveWaiver.ts
/* eslint-disable @typescript-eslint/no-var-requires */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

if (!admin.apps.length) admin.initializeApp();

type SaveWaiverBody = {
  intakeId: string;
  athleteUid?: string | null;
  fileName?: string | null;
  pdfBase64?: string;       // required unless ackOnly === true
  actorUid?: string | null;
  ackOnly?: boolean;
};

type WriteWaiverMirror = (x: {
  intakeId: string;
  athleteUid: string | null;
  actorUid: string | null;
  storagePath: string | null;
  bytesWritten: number;
  ackOnly: boolean;
  at: string;
}) => Promise<void>;

// Optional mirror: safe no-op if module/file not present
let writeWaiverMirror: WriteWaiverMirror = async () => {};
try {
  // @ts-ignore: module may not exist in dev; optional dependency
  writeWaiverMirror =
    require("../../infra/waiverMirror").writeWaiverMirror as WriteWaiverMirror;
} catch {
  /* keep no-op */
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const nowIso = () => new Date().toISOString();

export const saveWaiver = functions.https.onRequest(async (req, res): Promise<void> => {
  try {
    // --- CORS / method guards ---
    if (req.method === "OPTIONS") {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

    // --- Parse body (handle raw string defensively) ---
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      intakeId,
      athleteUid: athleteUidRaw,
      fileName,
      pdfBase64,
      actorUid: actorUidRaw,
      ackOnly: ackOnlyRaw,
    } = raw as SaveWaiverBody;

    if (!intakeId) {
      res.status(400).json({ ok: false, error: "missing_intakeId" });
      return;
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    const athleteUid = athleteUidRaw ?? null;
    const actorUid = actorUidRaw ?? null;
    const ackOnly = !!ackOnlyRaw;

    let storagePath: string | null = null;
    let bytesWritten = 0;

    // --- If not ack-only, require PDF and upload ---
    if (!ackOnly) {
      if (!fileName) {
        res.status(400).json({ ok: false, error: "missing_fileName" });
        return;
      }
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        res.status(400).json({ ok: false, error: "missing_pdfBase64" });
        return;
      }

      // strip potential data URL prefix
      const b64 = pdfBase64.includes(",") ? pdfBase64.split(",").pop()! : pdfBase64;
      const buf = Buffer.from(b64, "base64");
      if (!buf.length) {
        res.status(400).json({ ok: false, error: "invalid_base64" });
        return;
      }

      const d = new Date();
      const yyyy = String(d.getUTCFullYear());
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const ts = d.toISOString().replace(/[:.]/g, "-");

      storagePath = `waivers/${intakeId}/${yyyy}/${mm}/${ts}-${fileName}`;

      await bucket.file(storagePath).save(buf, {
        contentType: "application/pdf",
        resumable: false,
        validation: "md5",
        metadata: {
          cacheControl: "private, max-age=3600",
          metadata: {
            intakeId,
            athleteUid: athleteUid ?? "",
            actorUid: actorUid ?? "",
            uploadedAt: nowIso(),
          },
        },
      });

      bytesWritten = buf.length;
    }

    // --- Firestore: mark waiver accepted (merge-safe) ---
    const waiverUpdate: Record<string, any> = {
      waiver: {
        status: "accepted",     // critical for approve gate
        accepted: true,         // keep boolean for legacy checks
        seen: true,
        updatedAt: nowIso(),
        actorUid: actorUid ?? null,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (storagePath) {
      waiverUpdate.waiver.path = storagePath;
      waiverUpdate.waiver.fileName = fileName ?? null;
      waiverUpdate.waiver.size = bytesWritten;
    }

    await db.collection("intakes").doc(intakeId).set(waiverUpdate, { merge: true });

    // --- Optional mirror (best-effort) ---
    try {
      await writeWaiverMirror({
        intakeId,
        athleteUid,
        actorUid,
        storagePath,
        bytesWritten,
        ackOnly,
        at: nowIso(),
      });
    } catch (mirrorErr) {
      console.warn("[saveWaiver] mirror warn:", mirrorErr);
    }

    res.status(200).json({
      ok: true,
      intakeId,
      path: storagePath,
      bytes: bytesWritten,
      ackOnly,
    });
  } catch (err: any) {
    console.error("[saveWaiver] crash:", err);
    try {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    } catch {}
    res.status(500).json({ ok: false, error: err?.message || "internal" });
  }
});
