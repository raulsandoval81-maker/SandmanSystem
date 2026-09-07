import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertConsumableAthleteInvitation, assertConsumableParentInvitation } from "./accessInvitationPolicy";

const db = getFirestore();

function invitationError(error: unknown): never {
  const reason = String((error as Error)?.message || "");
  if (reason === "INVITATION_NOT_FOUND") throw new HttpsError("not-found", "Invitation not found.");
  if (reason === "INVITATION_USED") throw new HttpsError("failed-precondition", "Invitation already used.");
  if (reason === "INVITATION_EXPIRED") throw new HttpsError("failed-precondition", "Invitation expired.");
  if (reason === "EMAIL_MISMATCH") throw new HttpsError("permission-denied", "Invitation email does not match this Parent account.");
  if (reason === "DIFFERENT_ATHLETE_UID" || reason === "CALLER_ALREADY_BOUND") {
    throw new HttpsError("failed-precondition", "This Athlete access conflicts with an existing account binding.");
  }
  if (reason === "DIFFERENT_PARENT_UID") {
    throw new HttpsError("failed-precondition", "This athlete relationship is already connected to another Parent account.");
  }
  throw new HttpsError("permission-denied", "Invitation does not match an approved Parent relationship.");
}

export const consumeAccessInvitation = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const callerUid = req.auth.uid;
  const authEmail = String(req.auth.token.email || "").trim().toLowerCase();
  if (!authEmail || req.auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "An email-backed account is required.");
  }
  const tokenId = String(req.data?.tokenId || "").trim();
  if (!tokenId) throw new HttpsError("invalid-argument", "Invitation token required.");

  return db.runTransaction(async (tx) => {
    const invitationRef = db.doc(`accessInvitations/${tokenId}`);
    const invitationSnap = await tx.get(invitationRef);
    if (!invitationSnap.exists) invitationError(new Error("INVITATION_NOT_FOUND"));
    const invitation = invitationSnap.data() || {};
    if (String(invitation.role || "") === "athlete") {
      const athleteUid = String(invitation.athleteUid || invitation.subjectId || "").trim().toUpperCase();
      const athleteRef = db.doc(`athletes/${athleteUid}`);
      const athleteSnap = await tx.get(athleteRef);
      if (!athleteSnap.exists) throw new HttpsError("failed-precondition", "Athlete record is unavailable.");
      const athlete = athleteSnap.data() || {};
      const existingBindings = await tx.get(
        db.collection("athletes").where("authUid", "==", callerUid).limit(2)
      );
      let decision;
      try {
        decision = assertConsumableAthleteInvitation({
          exists: true,
          role: invitation.role,
          used: invitation.used === true || Boolean(invitation.usedAt),
          exp: Number(invitation.exp || 0),
          now: Date.now(),
          invitationEmail: invitation.email,
          authEmail,
          invitationAthleteUid: athleteUid,
          actualAthleteUid: athleteSnap.id,
          accessMode: invitation.accessMode,
          parentApproved: invitation.parentApproved,
          existingAthleteAuthUid: athlete.authUid,
          callerUid,
          callerAthleteIds: existingBindings.docs.map((doc) => doc.id),
        });
      } catch (error) {
        invitationError(error);
      }

      const stamp = FieldValue.serverTimestamp();
      tx.update(athleteRef, {
        authUid: callerUid,
        access: {
          ...(athlete.access && typeof athlete.access === "object" ? athlete.access : {}),
          mode: decision.accessMode,
          parentApproved: decision.parentApproved,
          activatedAt: stamp,
          invitationId: tokenId,
        },
        updatedAt: stamp,
      });
      tx.update(invitationRef, { used: true, usedAt: stamp, usedBy: callerUid });
      return { ok: true, role: "athlete", athleteUid: decision.athleteUid, accessMode: decision.accessMode };
    }

    const relationshipId = String(invitation.relationshipId || invitation.subjectId || "").trim();
    const athleteUid = String(invitation.athleteUid || "").trim().toUpperCase();
    const relationshipRef = db.doc(`parentAthleteLinks/${relationshipId}`);
    const athleteRef = db.doc(`athletes/${athleteUid}`);
    const relationshipSnap = await tx.get(relationshipRef);
    const athleteSnap = await tx.get(athleteRef);
    if (!relationshipSnap.exists || !athleteSnap.exists) {
      throw new HttpsError("failed-precondition", "Approved Parent relationship is unavailable.");
    }
    const relationship = relationshipSnap.data() || {};
    const athlete = athleteSnap.data() || {};

    let decision;
    try {
      decision = assertConsumableParentInvitation({
        exists: true,
        role: invitation.role,
        used: invitation.used === true || Boolean(invitation.usedAt),
        exp: Number(invitation.exp || 0),
        now: Date.now(),
        invitationEmail: invitation.email,
        authEmail,
        invitationAthleteUid: athleteUid,
        relationshipAthleteUid: relationship.athleteUid,
        invitationRelationshipId: relationshipId,
        actualRelationshipId: relationshipSnap.id,
        relationshipEmail: relationship.parentEmail,
        relationshipStatus: relationship.status,
        existingRelationshipParentUid: relationship.parentUid,
        existingAthleteParentUid: athlete.parentUid,
        callerUid,
      });
    } catch (error) {
      invitationError(error);
    }

    const stamp = FieldValue.serverTimestamp();
    tx.update(relationshipRef, {
      parentUid: callerUid,
      status: "active",
      activatedAt: relationship.activatedAt || stamp,
      updatedAt: stamp,
    });
    tx.update(athleteRef, { parentUid: callerUid, updatedAt: stamp });
    tx.set(db.doc(`parents/${callerUid}`), {
      uid: callerUid,
      email: decision.email,
      athleteUid: decision.athleteUid,
      primaryAthleteUid: decision.athleteUid,
      updatedAt: stamp,
    }, { merge: true });
    tx.update(invitationRef, { used: true, usedAt: stamp, usedBy: callerUid });
    return { ok: true, role: "parent", athleteUid: decision.athleteUid };
  });
});
