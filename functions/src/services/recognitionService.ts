import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { normalizeAthlete } from "../engines/athlete-engine/athleteNormalizer";
import {
  buildCertificatePayload,
  hasIssuedStripeCertificate,
} from "../engines/certificate-engine/certificatePayloadEngine";
import { requireCoachAthleteAccess } from "./staffAuthorization";
import {
  awardRecognition,
  AwardRecognitionRequest
} from "../engines/recognition-engine/awardRecognition";

export interface PersistRecognitionRequest extends AwardRecognitionRequest {
  athleteUid: string;
}

export async function persistRecognitionAward(
  request: PersistRecognitionRequest
) {
  if (!request.athleteUid) {
    throw new Error("Missing athleteUid.");
  }

  const db = getFirestore();
  const athleteRef = db.collection("athletes").doc(request.athleteUid);

  const event = awardRecognition(request);

  await athleteRef.update({
    recognitionHistory: FieldValue.arrayUnion(event),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    athleteUid: request.athleteUid,
    event
  };
}

export interface StripeCertificateActor {
  uid: string;
  role: string;
  staff: Record<string, unknown>;
}

export interface MarkStripeCertificateIssuedRequest {
  athleteId: string;
  expectedTier: number;
  expectedStripe: number;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new HttpsError("invalid-argument", `${field} must be a non-negative integer.`);
  }
  return number;
}

export async function markStripeCertificateIssuedTransaction(
  actor: StripeCertificateActor,
  request: MarkStripeCertificateIssuedRequest,
  db = getFirestore()
) {
  const athleteId = String(request.athleteId ?? "").trim();
  if (!athleteId) {
    throw new HttpsError("invalid-argument", "A valid athlete ID is required.");
  }

  const expectedTier = requireNonNegativeInteger(request.expectedTier, "expectedTier");
  const expectedStripe = requireNonNegativeInteger(request.expectedStripe, "expectedStripe");
  if (expectedStripe < 1 || expectedStripe > 4) {
    throw new HttpsError("invalid-argument", "expectedStripe must be between 1 and 4.");
  }

  const athleteRef = db.collection("athletes").doc(athleteId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Athlete not found: ${athleteId}`);
    }

    const source = snap.data() || {};
    requireCoachAthleteAccess(actor, source);
    const athlete = normalizeAthlete({ ...source, uid: athleteId });

    if (hasIssuedStripeCertificate(athlete, expectedTier, expectedStripe)) {
      return {
        ok: true,
        idempotent: true,
        athleteId,
        tier: expectedTier,
        stripe: expectedStripe,
      };
    }

    const payload = buildCertificatePayload(athlete);
    if (
      payload?.printReady !== true ||
      !("tier" in payload) ||
      !("stripe" in payload)
    ) {
      throw new HttpsError(
        "failed-precondition",
        payload?.message || "This athlete does not have a stripe certificate ready to issue."
      );
    }
    const derivedTier = Number(payload.tier);
    const derivedStripe = Number(payload.stripe);
    if (derivedTier !== expectedTier || derivedStripe !== expectedStripe) {
      throw new HttpsError(
        "failed-precondition",
        "The certificate changed after it was loaded. Reload and verify the current certificate."
      );
    }

    const event = awardRecognition({
      athleteUid: athleteId,
      coachUid: actor.uid,
      type: "STRIPE_AWARD",
      tier: derivedTier,
      stripe: derivedStripe,
    });
    const history = Array.isArray(source.recognitionHistory)
      ? source.recognitionHistory
      : [];

    tx.update(athleteRef, {
      recognitionHistory: [...history, event],
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      idempotent: false,
      athleteId,
      tier: derivedTier,
      stripe: derivedStripe,
      event,
    };
  });
}
