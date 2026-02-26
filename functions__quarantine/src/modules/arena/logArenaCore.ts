// functions/src/modules/arena/logArenaCore.ts
import * as admin from "firebase-admin";
import { handleIncrementXp } from "../xp/incrementXpCore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export type ArenaLogReq = {
  athleteUid: string;
  eventName: string;
  division?: string | null;
  battle?: boolean;
  podium?: boolean;
  matchIq?: boolean;
  style?: string | null;
  penalty?: boolean;
  note?: string | null;
  // pass through for weekend/tourney
  tournamentId?: string | null;
};

export async function handleLogArena(
  data: ArenaLogReq,
  ctx: { authUid?: string | null } = {}
) {
  const athleteUid = (data.athleteUid || "").trim();
  if (!athleteUid) throw new Error("athleteUid required");

  const eventName = (data.eventName || "").trim();
  const division = data.division || null;

  // 1) figure XP from flags
  let totalXp = 0;
  if (data.battle) totalXp += 10;   // showed up / competed
  if (data.podium) totalXp += 5;    // placed
  if (data.matchIq) totalXp += 5;   // style / IQ
  if (data.penalty) totalXp -= 5;   // coach penalty

  const actor = ctx.authUid || "coach-local";

  // 2) write arena log
  const logRef = db.collection("arenaLogs").doc();
  await logRef.set({
    id: logRef.id,
    athleteUid,
    eventName,
    division,
    battle: !!data.battle,
    podium: !!data.podium,
    matchIq: !!data.matchIq,
    style: data.style || null,
    penalty: !!data.penalty,
    totalXp,
    note: data.note || null,
    tournamentId: data.tournamentId || null,
    by: actor,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "coach-arena-log",
  });

  // 3) push XP through your existing XP core
  if (totalXp !== 0) {
    await handleIncrementXp(
      {
        uid: athleteUid,
        amount: totalXp,                            // forces this amount
        event: "ARENA",                             // ok, core will keep it
        note: data.note || `Arena: ${eventName}`,
        meta: {
          source: "coach-arena-log",
          eventName,
          division,
          battle: !!data.battle,
          podium: !!data.podium,
          matchIq: !!data.matchIq,
          style: data.style || null,
          penalty: !!data.penalty,
          tournamentId: data.tournamentId || null,
        },
      },
      { authUid: actor }
    );
  }

  return {
    ok: true,
    id: logRef.id,
    athleteUid,
    eventName,
    totalXp,
  };
}
