import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MANAGEMENT_STAFF_ROLES,
  requireActiveStaff,
  requireStaffLocation
} from "../services/staffAuthorization";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function millis(value: any): number {
  return value?.toMillis?.() || 0;
}

export const getAccessSetupStatus = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Management sign-in required.");
  }

  const actor = await requireActiveStaff(
    req.auth.uid,
    MANAGEMENT_STAFF_ROLES,
    "Active Management access required."
  );

  const requested = Array.isArray(req.data?.athleteUids)
    ? req.data.athleteUids
    : [];

  const athleteUids: string[] = [...new Set<string>(
    (requested as unknown[])
      .map((value: unknown) => clean(value).toUpperCase())
      .filter((value): value is string => Boolean(value))
  )].slice(0, 10);

  if (!athleteUids.length) {
    return { ok: true, statuses: {} };
  }

  const statuses: Record<string, any> = {};

  for (const athleteUid of athleteUids) {
    const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();

    if (!athleteSnap.exists) continue;

    const athlete = athleteSnap.data() || {};
    requireStaffLocation(
      actor,
      athlete.locationId,
      "This athlete is outside your Management location scope."
    );

    const parentEmail = normalizeEmail(athlete.parentEmail);

    const [linksSnap, invitesSnap] = await Promise.all([
      db.collection("parentAthleteLinks")
        .where("athleteUid", "==", athleteUid)
        .get(),
      db.collection("accessInvitations")
        .where("athleteUid", "==", athleteUid)
        .get()
    ]);

    const parentLink = linksSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .find((link: any) =>
        normalizeEmail(link.parentEmail) === parentEmail &&
        ["pending", "active"].includes(clean(link.status).toLowerCase())
      );

    const invitations = invitesSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }));

    function latestInvite(role: "parent" | "athlete") {
      return invitations
        .filter((invite: any) => clean(invite.role).toLowerCase() === role)
        .sort((a: any, b: any) =>
          Math.max(millis(b.createdAt), millis(b.deliveredAt)) -
          Math.max(millis(a.createdAt), millis(a.deliveredAt))
        )[0] || null;
    }

    const parentInvite: any = latestInvite("parent");
    const athleteInvite: any = latestInvite("athlete");

    const parentStatus =
      clean((parentLink as any)?.status).toLowerCase() === "active"
        ? "active"
        : parentInvite?.used === true
          ? "active"
          : clean(parentInvite?.deliveryStatus).toUpperCase() === "SENT"
            ? "sent"
            : parentInvite
              ? "invitation_created"
              : "not_started";

    const athleteStatus =
      clean(athlete.authUid)
        ? "active"
        : athleteInvite?.used === true
          ? "active"
          : clean(athleteInvite?.deliveryStatus).toUpperCase() === "SENT"
            ? "sent"
            : athleteInvite
              ? "invitation_created"
              : "not_started";

    statuses[athleteUid] = {
      parentStatus,
      athleteStatus
    };
  }

  return {
    ok: true,
    statuses
  };
});
