import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { cleanMemberValue, managementLocationScope, mapManagementMember, memberMatchesSearch } from "./managementMemberPolicy";

const db = getFirestore();

export const searchManagementMembers = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const authorized = await requireActiveStaff(req.auth.uid, MANAGEMENT_STAFF_ROLES, "Active Management access required.");
  const search = cleanMemberValue(req.data?.search);
  if (search.length < 2 || search.length > 100) {
    throw new HttpsError("invalid-argument", "Enter at least two characters of an Athlete ID or name.");
  }

  const scope = managementLocationScope(authorized.staff, authorized.role);
  if (Array.isArray(scope) && !scope.length) return { ok: true, members: [] };
  const candidates = new Map<string, Record<string, any>>();
  const direct = await db.doc(`athletes/${search.toUpperCase()}`).get();
  if (direct.exists) candidates.set(direct.id, direct.data() || {});

  if (scope === null) {
    const snapshot = await db.collection("athletes").limit(500).get();
    for (const doc of snapshot.docs) candidates.set(doc.id, doc.data() || {});
  } else {
    for (const locationId of scope) {
      const snapshot = await db.collection("athletes").where("locationId", "==", locationId).limit(250).get();
      for (const doc of snapshot.docs) candidates.set(doc.id, doc.data() || {});
    }
  }

  const allowed = [...candidates.entries()].filter(([, athlete]) =>
    scope === null || scope.includes(cleanMemberValue(athlete.locationId || athlete.team?.locationId))
  );
  const members = [];
  for (const [athleteId, athlete] of allowed) {
    const links = await db.collection("parentAthleteLinks").where("athleteUid", "==", athleteId).limit(10).get();
    const member = mapManagementMember(athleteId, athlete, links.docs.map((doc) => doc.data() || {}));
    if (memberMatchesSearch(member, search)) members.push(member);
    if (members.length >= 10) break;
  }
  return { ok: true, members };
});
