/* =========================================================
   BACKEND (Cloud Function) — write permanent coach logs
   File: functions/src/xp/logging.ts  (or inline in incrementXp)
   ========================================================= */

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

type XpMeta = {
  domain?: "GYM" | "HOME" | "CLASSROOM" | "COMMUNITY";
  reasonCode?: string;       // e.g. "CHARACTER_CHECK"
  reasonLabel?: string;      // human label
  reasonNote?: string | null;// optional short note
  source?: "COMMAND_CENTER" | "ARENA" | "ADMIN";
};

type WriteLogArgs = {
  athleteId: string;           // athlete UID/doc id (canonical)
  coachUid: string;            // auth uid
  lane: "combat" | "strength" | "honor";
  kind: string;                // e.g. combat_full, honor_half, honor_neg
  delta: number;               // +10 / +5 / -5
  beforeXP: number;
  afterXP: number;
  beforeCap?: number | null;
  afterCap?: number | null;
  meta?: XpMeta;
  blocked?: boolean;
  blockReason?: string | null;
  env?: "prod" | "dev";
};

export async function writeXpLog(args: WriteLogArgs) {
  const now = admin.firestore.Timestamp.now();

  const doc = {
    athleteId: args.athleteId,
    coachUid: args.coachUid,

    lane: args.lane,
    kind: args.kind,
    delta: args.delta,

    beforeXP: args.beforeXP,
    afterXP: args.afterXP,
    beforeCap: args.beforeCap ?? null,
    afterCap: args.afterCap ?? null,

    meta: {
      domain: args.meta?.domain ?? "GYM",
      reasonCode: args.meta?.reasonCode ?? null,
      reasonLabel: args.meta?.reasonLabel ?? null,
      reasonNote: args.meta?.reasonNote ?? null,
      source: args.meta?.source ?? "COMMAND_CENTER",
    },

    blocked: !!args.blocked,
    blockReason: args.blockReason ?? null,

    env: args.env ?? "prod",

    createdAt: now,              // server truth
    createdAtMs: Date.now(),      // handy for UI sort
  };

  // Permanent, coach-owned history (global)
  await db.collection("xpLogs").add(doc);

  // Optional: per-athlete subcollection for faster athlete lookups
  // await db.collection("athletes").doc(args.athleteId).collection("xpLogs").add(doc);

  return doc;
}

/* =========================================================
   BACKEND (incrementXp) — call writeXpLog after you compute
   Put this INSIDE your existing incrementXp handler right
   after you determine delta + apply the write.
   ========================================================= */

// Example inside incrementXp (pseudo-wiring):
export async function afterXpApplied({
  athleteId,
  coachUid,
  kind,
  lane,
  delta,
  beforeXP,
  afterXP,
  beforeCap,
  afterCap,
  meta,
  env,
  blocked,
  blockReason,
}: {
  athleteId: string;
  coachUid: string;
  kind: string;
  lane: "combat" | "strength" | "honor";
  delta: number;
  beforeXP: number;
  afterXP: number;
  beforeCap?: number | null;
  afterCap?: number | null;
  meta?: XpMeta;
  env?: "prod" | "dev";
  blocked?: boolean;
  blockReason?: string | null;
}) {
  // Guard: must have coachUid (auth)
  if (!coachUid) throw new HttpsError("unauthenticated", "Coach auth required");

  await writeXpLog({
    athleteId,
    coachUid,
    lane,
    kind,
    delta,
    beforeXP,
    afterXP,
    beforeCap,
    afterCap,
    meta,
    env,
    blocked,
    blockReason,
  });
}
