import * as crypto from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff, requireStaffLocation } from "../services/staffAuthorization";
import {
  ACCESS_INVITATION_TTL_MS,
  assertAthleteInvitationContext,
  assertParentInvitationContext,
  normalizeAccessEmail,
} from "./accessInvitationPolicy";

const db = getFirestore();

function ageFromDob(value: unknown): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  const dayDiff = now.getDate() - day;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

function athleteDob(athlete: Record<string, any>): string {
  return String(
    athlete.dob ||
    athlete.profile?.dob ||
    athlete.athlete?.dob ||
    ""
  ).trim();
}

function pendingParentRelationshipId(athleteUid: string, email: string): string {
  const emailKey = crypto
    .createHash("sha256")
    .update(email)
    .digest("hex")
    .slice(0, 16);
  return `pending_${athleteUid}_${emailKey}`;
}

export const issueAccessInvitation = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const issuer = await requireActiveStaff(req.auth.uid, MANAGEMENT_STAFF_ROLES, "Active Management access required.");

  const role = String(req.data?.role || "").trim().toLowerCase();
  const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
  const email = normalizeAccessEmail(req.data?.email);

  if (role === "athlete") {
    const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();
    if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");

    const athlete = athleteSnap.data() || {};
    requireStaffLocation(issuer, athlete.locationId, "This athlete is outside your authorized location scope.");

    if (String(athlete.authUid || "").trim()) {
      throw new HttpsError("failed-precondition", "Athlete access is already activated.");
    }

    const age = ageFromDob(athleteDob(athlete));
    const requiresParentApproval = age === null || age < 14;
    const parentApproved = req.data?.parentApproved === true;

    if (requiresParentApproval && !parentApproved) {
      throw new HttpsError(
        "failed-precondition",
        "Athletes under age 14 require recorded Parent or guardian approval for direct Athlete access."
      );
    }

    const accessMode = requiresParentApproval ? "hybrid" : "self_managed";

    let context;
    try {
      context = assertAthleteInvitationContext({
        role,
        email,
        athleteUid,
        accessMode,
        parentApproved: requiresParentApproval ? true : false,
      });
    } catch (error) {
      const reason = String((error as Error)?.message || "");
      if (reason === "PARENT_APPROVAL_REQUIRED") {
        throw new HttpsError("failed-precondition", "Parent or guardian approval is required.");
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
      ageAtIssue: age,
      exp,
      used: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: issuer.uid,
      createdByRole: issuer.role,
      source: "management_athlete_access",
    });

    return {
      ok: true,
      role: "athlete",
      tokenId,
      exp,
      email,
      athleteUid,
      accessMode: context.accessMode,
      requiresParentApproval,
    };
  }

  if (role !== "parent") {
    throw new HttpsError("invalid-argument", "Only Parent and Athlete invitations are enabled.");
  }

  const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();
  if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");

  const athlete = athleteSnap.data() || {};
  requireStaffLocation(issuer, athlete.locationId, "This athlete is outside your authorized location scope.");

  const links = await db.collection("parentAthleteLinks").where("athleteUid", "==", athleteUid).get();
  let relationship = links.docs.find((candidate) => {
    const data = candidate.data() || {};
    return normalizeAccessEmail(data.parentEmail) === email
      && ["pending", "active"].includes(String(data.status || "").toLowerCase());
  });

  /*
   * A new Parent may not have a Firebase Auth account yet. Older activation
   * logic only created parentAthleteLinks when parentUid already existed,
   * which made first-time Parent registration impossible. When Management
   * issues the invitation, the activated Athlete record is authoritative for
   * the approved Parent email, so create the pending relationship here if it
   * is missing. The invitation consumer will bind parentUid after registration.
   */
  if (!relationship) {
    const approvedParentEmail = normalizeAccessEmail(athlete.parentEmail);
    if (!approvedParentEmail || approvedParentEmail !== email) {
      throw new HttpsError("failed-precondition", "Approved Parent relationship not found.");
    }

    const relationshipRef = db.doc(
      `parentAthleteLinks/${pendingParentRelationshipId(athleteUid, email)}`
    );

    await relationshipRef.set(
      {
        parentUid: null,
        athleteUid,
        parentEmail: email,
        status: "pending",
        source: "management_parent_access",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const pendingSnap = await relationshipRef.get();
    if (!pendingSnap.exists) {
      throw new HttpsError("internal", "Unable to create the approved Parent relationship.");
    }
    relationship = pendingSnap;
  }

  const context = assertParentInvitationContext({
    role: "parent",
    email,
    athleteUid,
    relationshipId: relationship.id,
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
