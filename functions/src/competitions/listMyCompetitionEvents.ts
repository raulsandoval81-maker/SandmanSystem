import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { athleteHomeLocationId, athleteScheduleDisciplineIds } from "../schedules/crossTrainingPolicy";

const db = getFirestore();
const clean = (value: unknown) => String(value ?? "").trim();
const list = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];

export const listMyCompetitionEvents = onCall(async (req) => {
  const callerUid = clean(req.auth?.uid);
  const athleteId = clean(req.data?.athleteId).toUpperCase();
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign-in required.");
  if (!athleteId) throw new HttpsError("invalid-argument", "athleteId required.");
  const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
  if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
  const athlete = athleteSnap.data() || {};
  if (clean(athlete.authUid) !== callerUid) {
    const link = await db.collection("parentAthleteLinks")
      .where("parentUid", "==", callerUid)
      .where("athleteUid", "==", athleteId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    const legacyParentMatch =
      clean(athlete.parentUid) === callerUid;

    if (link.empty && !legacyParentMatch) {
      throw new HttpsError(
        "permission-denied",
        "Competition schedule access denied."
      );
    }
  }
  const disciplines = new Set(athleteScheduleDisciplineIds(athlete));
  const locations = new Set([athleteHomeLocationId(athlete)].filter(Boolean));
  const now = Timestamp.now();
  const assignments = await db.collection("athleteCrossTrainingAssignments").where("athleteId", "==", athleteId).where("status", "==", "active").get();
  for (const doc of assignments.docs) {
    const assignment = doc.data();
    if (assignment.activeFrom?.toMillis?.() > now.toMillis() || assignment.activeTo?.toMillis?.() < now.toMillis()) continue;
    locations.add(clean(assignment.hostLocationId));
    list(assignment.disciplineIds).forEach((id) => disciplines.add(id === "kickboxing" ? "muay-thai" : id));
  }
  const teams = new Set(list(athlete.teamIds).concat(list(athlete.teams), clean(athlete.teamId)).filter(Boolean));
  const snapshot = await db.collection("events").where("eventType", "==", "competition").get();
  const events = snapshot.docs.map((doc) => ({ eventId: doc.id, ...doc.data() })).filter((event: Record<string, any>) => {
    if (event.visibility !== "internal" || event.publicationStatus !== "published" || event.status !== "active") return false;
    const programs = list(event.programScopes);
    if (!programs.some((id) => disciplines.has(id))) return false;
    const eventLocations = list(event.locationIds);
    const eventTeams = list(event.teamIds);
    return (!eventLocations.length || eventLocations.some((id) => locations.has(id))) && (!eventTeams.length || eventTeams.some((id) => teams.has(id)));
  }).sort((a: Record<string, any>, b: Record<string, any>) => clean(a.startDate).localeCompare(clean(b.startDate)));
  return { ok: true, athleteId, events };
});
