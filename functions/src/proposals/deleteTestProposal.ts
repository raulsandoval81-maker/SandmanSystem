import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  requireProposalStaffAccess,
} from "./proposalAccess";

function cleanString(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function isAdminRole(
  role: string
): boolean {
  return (
    role === "admin" ||
    role === "system_admin"
  );
}

export const deleteTestProposal =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    if (!isAdminRole(staffAccess.role)) {
      throw new HttpsError(
        "permission-denied",
        "System Admin access is required to delete a proposal."
      );
    }

    const proposalId =
      cleanString(
        req.data?.proposalId
      );

    if (
      !proposalId ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(
        proposalId
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid proposalId is required."
      );
    }

    const db =
      getFirestore();

    const proposalRef =
      db
        .collection("proposals")
        .doc(proposalId);

    const proposalSnap =
      await proposalRef.get();

    if (!proposalSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Proposal ${proposalId} was not found.`
      );
    }

    const proposal =
      proposalSnap.data() || {};

    const status =
      cleanString(
        proposal.status
      ).toUpperCase();

    if (status === "PAID") {
      throw new HttpsError(
        "failed-precondition",
        "Paid proposals cannot be permanently deleted."
      );
    }

    const historySnap =
      await proposalRef
        .collection("history")
        .get();

    const batch =
      db.batch();

    for (const historyDoc of historySnap.docs) {
      batch.delete(
        historyDoc.ref
      );
    }

    batch.delete(
      proposalRef
    );

    await batch.commit();

    return {
      ok: true,
      proposalId,
      status,
    };
  });
