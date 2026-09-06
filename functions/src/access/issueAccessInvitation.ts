import * as crypto from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { ACCESS_INVITATION_TTL_MS, assertParentInvitationContext, normalizeAccessEmail } from "./accessInvitationPolicy";

const db = getFirestore();

export const issueAccessInvitation = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const issuer = await requireActiveStaff(req.auth.uid, MANAGEMENT_STAFF_ROLES, "Active Management access required.");

  if (String(req.data?.role || "") !== "parent") {
    throw new HttpsError("invalid-argument", "Only Parent invitations are enabled in this phase.");
  }

  const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
  const email = normalizeAccessEmail(req.data?.email);
  const links = await db.collection("parentAthleteLinks").where("athleteUid", "==", athleteUid).get();
  const relationship = links.docs.find((candidate) => {
    const data = candidate.data() || {};
    return normalizeAccessEmail(data.parentEmail) === email
      && ["pending", "active"].includes(String(data.status || "").toLowerCase());
  });

  if (!relationship) {
    throw new HttpsError("failed-precondition", "Approved Parent relationship not found.");
  }

  const context = assertParentInvitationContext({
    role: "parent", email, athleteUid, relationshipId: relationship.id,
  });
  const tokenId = crypto.randomBytes(32).toString("hex");
  const exp = Date.now() + ACCESS_INVITATION_TTL_MS;

  await db.collection("accessInvitations").doc(tokenId).create({
    role: context.role,
    subjectId: context.relationshipId,
    relationshipId: context.relationshipId,
    athleteUid: context.athleteUid,
    email: context.email,
    exp,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: issuer.uid,
    createdByRole: issuer.role,
    source: "management_parent_access",
  });

  return { ok: true, role: "parent", tokenId, exp, email, athleteUid };
});
