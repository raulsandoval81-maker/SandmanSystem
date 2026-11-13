import { randomBytes } from "node:crypto";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isDeepStrictEqual } from "node:util";
import { hasConflictingStripeActivity, isPreparedForPrepaidReconciliation } from "../billing/prepaidReconciliationPolicy";
import { isStagingEnrollmentRuntime, STAGING_PROJECT_ID } from "./operationalPaidProposal";

// Source-only Gen2 updates can preserve the staging markers without injecting
// any of the project-ID aliases used by the Firebase CLI.
export async function resolveEarlyIntakeStagingRuntime(
  environment = process.env,
  readMetadata = fetch,
): Promise<boolean> {
  if (environment.GCLOUD_PROJECT || environment.GCP_PROJECT || environment.GOOGLE_CLOUD_PROJECT) {
    return isStagingEnrollmentRuntime(environment);
  }
  if (!environment.K_SERVICE ||
      environment.SANDMAN_STAGING_ACK !== STAGING_PROJECT_ID ||
      environment.SANDMAN_STAGING_PROJECT_ID !== STAGING_PROJECT_ID) return false;
  try {
    const response = await readMetadata("http://metadata.google.internal/computeMetadata/v1/project/project-id", {
      headers: { "Metadata-Flavor": "Google" }, redirect: "error", signal: AbortSignal.timeout(1500),
    });
    return response.ok && response.headers.get("Metadata-Flavor") === "Google" &&
      (await response.text()).trim() === STAGING_PROJECT_ID;
  } catch {
    return false;
  }
}

export function canStartEarlyCashCheckIntake(proposal: Record<string, any>, staging = isStagingEnrollmentRuntime()): boolean {
  const acceptance = proposal.clientAcceptance;
  const confirmation = proposal.enrollmentConfirmation;
  return staging &&
    proposal.status === "READY_FOR_CHECKOUT" &&
    proposal.lockedSnapshot?.pricing?.paymentArrangement === "prepaid_cash_check" &&
    isPreparedForPrepaidReconciliation(proposal) &&
    !proposal.cashPrepayment && !proposal.paidAt && proposal.paymentStatus !== "paid" &&
    !hasConflictingStripeActivity(proposal) &&
    acceptance?.consentAccepted === true && Boolean(acceptance.signedAt) &&
    isDeepStrictEqual(acceptance.signedSnapshot, proposal.lockedSnapshot) &&
    confirmation?.termsConfirmed === true && Boolean(confirmation.confirmedAt) &&
    ["parent_guardian", "adult_athlete"].includes(acceptance.signerRole);
}

export async function issueEarlyCashCheckIntake(
  tx: Transaction, proposalRef: DocumentReference, proposal: Record<string, any>, uid: string | undefined,
  staging = isStagingEnrollmentRuntime(),
  requestedEarlyIntake = false,
) {
  if ((!requestedEarlyIntake && !proposal.earlyCashCheckIntakeTokenId) ||
      !canStartEarlyCashCheckIntake(proposal, staging)) return {};
  if (!uid) throw new HttpsError("unauthenticated", "Secure Intake session required.");
  const db = proposalRef.firestore;
  const audience = proposal.clientAcceptance.signerRole;
  const previousId = proposal.earlyCashCheckIntakeTokenId;
  if (!proposal.locationId) throw new HttpsError("failed-precondition", "Enrollment location is missing.");
  const now = Date.now();
  let tokenId = previousId;
  if (previousId) {
    const token = await tx.get(db.doc(`intakeTokens/${previousId}`));
    const intake = await tx.get(db.doc(`intakes/${previousId}`));
    const prior = token.data();
    if (!prior || prior.proposalId !== proposalRef.id || prior.intakeAudience !== audience ||
        prior.locationId !== proposal.locationId || prior.earlyCashCheckOwnerUid !== uid) {
      throw new HttpsError("permission-denied", "Resume Intake in the original secure session.");
    }
    if (intake.exists) {
      const submitted = intake.data() || {};
      if (submitted.proposalId === proposalRef.id && submitted.ownerUid === uid &&
          ["submitted", "approved"].includes(submitted.status)) return { intakeComplete: true };
      throw new HttpsError("failed-precondition", "Existing Intake does not match this proposal.");
    }
    if (prior.used === true) throw new HttpsError("failed-precondition", "This Intake invite has been consumed.");
    if (prior.exp <= now) {
      tx.update(token.ref, { exp: now + 48 * 60 * 60 * 1000, updatedAt: FieldValue.serverTimestamp() });
    }
  } else {
    tokenId = randomBytes(16).toString("hex");
    tx.create(db.doc(`intakeTokens/${tokenId}`), {
      proposalId: proposalRef.id, locationId: proposal.locationId,
      source: "management_enrollment", mode: "new_athlete", status: "invited", used: false,
      intakeAudience: audience, intakeRoute: audience === "adult_athlete" ? "athlete" : "parent",
      earlyCashCheckOwnerUid: uid, workflowVersion: "intake-v2",
      exp: now + 48 * 60 * 60 * 1000, createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(proposalRef, { earlyCashCheckIntakeTokenId: tokenId });
  }
  const route = audience === "adult_athlete" ? "athlete" : "parent";
  return { intakePath: `/intake-${route}/?invite=${tokenId}` };
}
