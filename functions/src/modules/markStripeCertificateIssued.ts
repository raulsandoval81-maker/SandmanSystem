import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  COACH_STAFF_ROLES,
  requireActiveStaff,
} from "../services/staffAuthorization";
import { markStripeCertificateIssuedTransaction } from "../services/recognitionService";

interface MarkIssuedInput {
  authUid?: string;
  data?: Record<string, unknown>;
}

interface MarkIssuedDependencies {
  loadActor: typeof requireActiveStaff;
  markIssued: typeof markStripeCertificateIssuedTransaction;
}

export async function runMarkStripeCertificateIssued(
  input: MarkIssuedInput,
  dependencies: MarkIssuedDependencies = {
    loadActor: requireActiveStaff,
    markIssued: markStripeCertificateIssuedTransaction,
  }
) {
  if (!input.authUid) {
    throw new HttpsError("unauthenticated", "Coach sign-in required.");
  }

  const actor = await dependencies.loadActor(
    input.authUid,
    COACH_STAFF_ROLES,
    "Active Coach or Admin access required."
  );

  return dependencies.markIssued(actor, {
    athleteId: String(input.data?.athleteId ?? ""),
    expectedTier: input.data?.expectedTier as number,
    expectedStripe: input.data?.expectedStripe as number,
  });
}

export const markStripeCertificateIssued = onCall(async (request) => {
  return runMarkStripeCertificateIssued({
    authUid: request.auth?.uid,
    data: request.data,
  });
});
