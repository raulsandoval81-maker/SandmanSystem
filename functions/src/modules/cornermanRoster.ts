import { createHash, timingSafeEqual } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";

function clean(value: unknown): string { return String(value ?? "").trim(); }
function sameSecret(supplied: string, expected: string): boolean {
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest());
}

export function normalizeCornermanRosterAthlete(id: string, data: Record<string, any>) {
  const sourceAthleteId = clean(data.uid || data.athleteId || id);
  const sourceTeamId = clean(data.teamId || data.locationId);
  const displayName = clean(data.publicName || data.fullName || data.name || [data.first, data.last].filter(Boolean).join(" "));
  if (!sourceAthleteId || !sourceTeamId || !displayName) return null;
  return {
    sourceSystem: "sandman", sourceAthleteId, sourceTeamId, displayName,
    status: clean(data.rosterStatus || data.status || "current").toLowerCase(),
    discipline: clean(data.primaryDiscipline || data.discipline || data.art || data.program),
    teamName: clean(data.team || data.location?.team)
  };
}

export const cornermanRoster = onRequest(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.status(405).json({ error: "Method not allowed." }); return; }
  const expected = clean(process.env.SANDMAN_CORNERMAN_SHARED_SECRET);
  const supplied = clean(request.headers.authorization).replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || !sameSecret(supplied, expected)) { response.status(401).json({ error: "Authentication required." }); return; }
  const sourceTeamId = clean(request.query.teamId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sourceTeamId)) { response.status(400).json({ error: "A valid teamId is required." }); return; }
  try {
    const db = getFirestore();
    const [teamMatches, locationMatches] = await Promise.all([
      db.collection("athletes").where("teamId", "==", sourceTeamId).limit(500).get(),
      db.collection("athletes").where("locationId", "==", sourceTeamId).limit(500).get()
    ]);
    const unique = new Map<string, ReturnType<typeof normalizeCornermanRosterAthlete>>();
    for (const snap of [teamMatches, locationMatches]) for (const doc of snap.docs) {
      const athlete = normalizeCornermanRosterAthlete(doc.id, doc.data());
      if (athlete && athlete.status !== "archived" && athlete.status !== "inactive") unique.set(athlete.sourceAthleteId, athlete);
    }
    response.status(200).json({ sourceSystem: "sandman", sourceTeamId, athletes: [...unique.values()] });
  } catch { response.status(503).json({ error: "Roster service is unavailable." }); }
});
