import * as crypto from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import {
  ACCESS_INVITATION_TTL_MS,
  assertAthleteInvitationContext,
  assertParentInvitationContext,
  normalizeAccessEmail,
} from "./accessInvitationPolicy";

const db = getFirestore();

export const issueAccessInvitation = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const issuer = await requireActiveStaff(req.auth.uid, MANAGEMENT_STAFF_ROLES, "Active Management access required.");

  const role = String(req.data?.role || "").trim().toLowerCase();
  const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
  const email = normalizeAccessEmail(req.data?.email);
  if (role === "athlete") {
    const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();
    if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
    if (String(athleteSnap.data()?.authUid || "").trim()) {
      throw new HttpsError("failed-precondition", "Athlete access is already activated.");
    }
    let context;
    try {
      context = assertAthleteInvitationContext({
        role, email, athleteUid,
        accessMode: req.data?.accessMode,
        parentApproved: req.data?.parentApproved,
      });
    } catch (error) {
      const reason = String((error as Error)?.message || "");
      if (reason === "PARENT_APPROVAL_REQUIRED") {
        throw new HttpsError("failed-precondition", "Hybrid Athlete access requires recorded Parent approval.");
      }
      throw new HttpsError("invalid-argument", "Valid Athlete access details are required.");
    }
    const tokenId = crypto.randomBytes(32).toString("hex");
    const exp = Date.now() + ACCESS_INVITATION_TTL_MS;
    await db.collection("accessInvitations").doc(tokenId).create({
      role: context.role,
      subjectId: context.athleteUid,
      athleteUid: context.athleteUid,
      email: context.email,
      accessMode: context.accessMode,
      parentApproved: context.parentApproved,
      parentApprovalRecordedBy: context.parentApproved ? issuer.uid : null,
      parentApprovalRecordedAt: context.parentApproved ? FieldValue.serverTimestamp() : null,
      exp,
      used: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: issuer.uid,
      createdByRole: issuer.role,
      source: "management_athlete_access",
    });
    return { ok: true, role: "athlete", tokenId, exp, email, athleteUid, accessMode: context.accessMode };
  }

  if (role !== "parent") {
    throw new HttpsError("invalid-argument", "Only Parent and Athlete invitations are enabled.");
  }

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
