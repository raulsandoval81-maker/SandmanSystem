import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { requireProposalStaffAccess, requireProposalLocationAccess } from "./proposalAccess";

export const recordProposalMembershipChoice = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Management sign-in required.");
  const staff = await requireProposalStaffAccess(req.auth.uid);
  const proposalId = String(req.data?.proposalId || "").trim();
  const optionId = String(req.data?.optionId || "").trim();
  const evidence = String(req.data?.evidence || "").trim();
  if (!proposalId || proposalId.includes("/") || !["month_to_month", "twelve_month"].includes(optionId)) {
    throw new HttpsError("invalid-argument", "Valid proposal and issued membership option required.");
  }
  if (evidence.length < 12 || evidence.length > 1000) {
    throw new HttpsError("invalid-argument", "Record the source and date of the family's selection.");
  }
  const ref = getFirestore().collection("proposals").doc(proposalId);
  const result = await getFirestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Proposal not found.");
    const proposal = snap.data() || {};
    requireProposalLocationAccess(staff, proposal.locationId);
    if (proposal.status !== "AWAITING_CLIENT_SIGNATURE" || proposal.membershipChoiceRequest?.active !== true) {
      throw new HttpsError("failed-precondition", "There is no pending issued membership choice.");
    }
    const selected = (proposal.membershipChoiceRequest.options || []).find((x: any) => x.id === optionId);
    if (!selected) throw new HttpsError("failed-precondition", "That option was not issued to this family.");
    const response = {
      optionId, selectedOption: selected,
      selectedAt: FieldValue.serverTimestamp(),
      recordedBy: req.auth!.uid, recordedByName: staff.fullName,
      evidence, source: "management_family_reply",
    };
    tx.update(ref, {
      status: "CLIENT_CHANGES_REQUESTED",
      membershipChoiceResponse: response,
      "membershipChoiceRequest.active": false,
      updatedBy: req.auth!.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(ref.collection("history").doc(), {
      proposalId, event: "MEMBERSHIP_OPTION_SELECTED",
      source: "management_family_reply",
      optionId, selectedOption: selected, evidence,
      createdBy: req.auth!.uid, createdByName: staff.fullName,
      fromStatus: "AWAITING_CLIENT_SIGNATURE",
      toStatus: "CLIENT_CHANGES_REQUESTED",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { selectedOption: selected, status: "CLIENT_CHANGES_REQUESTED" };
  });
  return { ok: true, proposalId, ...result };
});
