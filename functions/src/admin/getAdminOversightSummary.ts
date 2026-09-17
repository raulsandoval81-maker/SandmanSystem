import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireActiveStaff } from "../services/staffAuthorization";
import { AdminOversightSources, buildAdminOversightSummary, OversightRecord } from "./adminOversightPolicy";

const COLLECTIONS: Array<[keyof AdminOversightSources, string]> = [
  ["messages", "general_messages"],
  ["leads", "interest_leads"],
  ["admissionsRequests", "admissions_requests"],
  ["appointments", "admissions_appointments"],
  ["proposals", "proposals"],
  ["intakes", "intakes"],
  ["athletes", "athletes"],
  ["practices", "practiceSessions"],
  ["attendance", "attendance_sessions"],
  ["schedules", "paraSchedule"],
  ["scheduleDrafts", "paraScheduleDrafts"],
  ["staff", "staff"],
];

export const getAdminOversightSummary = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  await requireActiveStaff(request.auth.uid, ["admin"], "Active Admin access required.");

  const db = getFirestore();
  const snapshots = await Promise.all(COLLECTIONS.map(([, collection]) => db.collection(collection).get()));
  const sources = {} as AdminOversightSources;
  COLLECTIONS.forEach(([key], index) => {
    sources[key] = snapshots[index].docs.map((doc): OversightRecord => ({ id: doc.id, data: doc.data() || {} }));
  });
  return buildAdminOversightSummary(sources);
});
