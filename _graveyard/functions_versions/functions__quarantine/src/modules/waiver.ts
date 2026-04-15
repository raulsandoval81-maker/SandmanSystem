// functions/src/modules/waiver/saveWaiver.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { IS_EMULATOR } from "../env";

// Firestore ref
const db = getFirestore();

/**
 * saveWaiver – records a waiver acknowledgment.
 * Parent stage: { intakeId }
 * Post-approval: { uid }
 */
export const saveWaiver = onCall(async (request) => {
  const ctx = request.auth;
  const data = request.data || {};

  if (!ctx) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const { uid, intakeId } = data;

  if (!uid && !intakeId) {
    throw new HttpsError(
      "invalid-argument",
      "Provide uid (post-approval) or intakeId (parent stage)."
    );
  }

  // Stable docId helps avoid duplicates when tapped twice
  const baseId = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const docId = (data.docId || baseId) + (uid ? "-uid" : "-intake");

  // Choose path
  const basePath = uid
    ? `waivers/${uid}/files`
    : `waiversByIntake/${intakeId}/files`;

  // Emulator: Record placeholder only
  const payload = {
    placeholder: IS_EMULATOR,
    filePath: IS_EMULATOR
      ? null
      : `${uid ? `waivers/${uid}` : `waiversByIntake/${intakeId}`}/${docId}.pdf`,
    brand: "Sandman System™ · Sandman Combat™",
    createdAt: FieldValue.serverTimestamp(),
    linkIntake: intakeId || null,
    linkUid: uid || null,
  };

  await db.doc(`${basePath}/${docId}`).set(payload, { merge: true });

  return {
    ok: true,
    stored: !IS_EMULATOR,
    deferred: IS_EMULATOR,
    path: `${basePath}/${docId}`,
  };
});
