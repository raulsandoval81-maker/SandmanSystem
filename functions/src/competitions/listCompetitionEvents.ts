import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { OPERATIONAL_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { normalizeCompetitionDiscipline } from "./competitionPolicy";

const db = getFirestore();

export const listCompetitionEvents = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  await requireActiveStaff(req.auth.uid, OPERATIONAL_STAFF_ROLES, "Active staff access required.");
  const discipline = normalizeCompetitionDiscipline(req.data?.disciplineId);
  const snap = await db.collection("events").where("eventType", "==", "competition").get();
  const events = snap.docs
    .map((doc): Record<string, any> => ({ eventId: doc.id, ...doc.data() }))
    .filter((event) => event.visibility === "internal")
    .filter((event) => !discipline || event.disciplineId === discipline || (Array.isArray(event.programScopes) && event.programScopes.includes(discipline)))
    .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")) || String(a.name || "").localeCompare(String(b.name || "")));
  return { ok: true, events };
});
