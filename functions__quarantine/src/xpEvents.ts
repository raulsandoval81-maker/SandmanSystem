// functions/src/xpEvents.ts
/**
 * XP increment functions (hybrid):
 *  - incrementXp      (onCall, canonical)
 *  - incrementXpHttp  (onRequest + CORS, dev/integration only)
 * Server-side caps + leaderboard mirror.
 * Includes:
 *  - attendance / fish / tournament_show / style / prestige
 *  - character (+5) with leader/non-leader caps
 *  - leadership_allowance (+100) once per month for leaders
 *  - capReason echoed back for the tester UI
 */

import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import cors from "cors";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const corsHandler = cors({ origin: true });

/* ---------- TYPES ---------- */
type Track = "foundry8" | "foundry4";
type XpType =
  | "attendance"
  | "fish"
  | "tournament_show"
  | "style"
  | "prestige"
  | "character"
  | "leadership_allowance";

export interface Payload {
  uid: string;
  track: Track;
  type: XpType | { type: XpType; badge?: string; note?: string };
  badge?: string; // style | prestige | character category
  note?: string;  // freeform note (character)
  mk?: string;    // YYYY-MM
}

/* ---------- CONSTANTS ---------- */
const POINTS: Record<XpType, number> = {
  attendance: 10,
  fish: -5,
  tournament_show: 15,
  style: 5,
  prestige: 0, // resolved by PRESTIGE_POINTS
  character: 5,
  leadership_allowance: 100,
};

const PRESTIGE_POINTS: Record<string, number> = {
  lion: 15,
  tiger: 50,
  bear: 100,
};

const ATTENDANCE_XP_CAP = 120;       // XP / month
const STYLE_COUNT_CAP = 2;           // entries / month
const FISH_COUNT_CAP = 4;            // entries / month
const NON_LEADER_CHARACTER_CAP = 4;  // entries / month
const LEADER_CHARACTER_CAP = 10;     // entries / month
// prestige: once per year per badge
// leadership_allowance: once per month

/* ---------- HELPERS ---------- */
const monthKey = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const yearFromMk = (mk: string) => mk.slice(0, 4);

function normalize(input: Payload["type"], badge?: string, note?: string) {
  if (typeof input === "object" && input) {
    return {
      type: input.type as XpType,
      badge: input.badge ?? badge,
      note: input.note ?? note,
    };
  }
  return { type: input as XpType, badge, note };
}

function assertString(name: string, v: unknown) {
  if (typeof v !== "string" || !v.trim())
    throw new HttpsError("invalid-argument", `${name} is required`);
}

/* ---------- REFS ---------- */
const countersDoc = (track: string, mk: string, uid: string) =>
  db.doc(`leaderboards/${track}/months/${mk}/counters/${uid}`);
const entriesCol = (track: string, mk: string) =>
  db.collection(`leaderboards/${track}/months/${mk}/entries`);
const athletesTotalsDoc = (track: string, mk: string, uid: string) =>
  db.doc(`leaderboards/${track}/months/${mk}/athletes/${uid}`);
const prestigeYearDoc = (uid: string, year: string) =>
  db.doc(`xpCounters/${uid}/years/${year}`);
const allowanceMonthDoc = (uid: string, mk: string) =>
  db.doc(`xpCounters/${uid}/months/${mk}`);

/* ---------- CORE LOGIC ---------- */
async function incrementXpCore(raw: Payload) {
  assertString("uid", raw.uid);
  assertString("track", raw.track);

  const uid = raw.uid.trim();
  const track = raw.track.trim();
  const mk = raw.mk && /^\d{4}-\d{2}$/.test(raw.mk) ? raw.mk : monthKey();
  const year = yearFromMk(mk);

  const { type, badge, note } = normalize(raw.type, raw.badge, raw.note);
  if (!type) throw new HttpsError("invalid-argument", "type is required");

  // resolve points
  let points = POINTS[type];
  if (type === "prestige") {
    const b = (badge || "").toLowerCase();
    if (!b || !(b in PRESTIGE_POINTS)) {
      throw new HttpsError(
        "invalid-argument",
        "prestige badge is required (lion|tiger|bear)"
      );
    }
    points = PRESTIGE_POINTS[b];
  }

  const cRef = countersDoc(track, mk, uid);
  const aRef = athletesTotalsDoc(track, mk, uid);
  const yRef = prestigeYearDoc(uid, year);
  const mRef = allowanceMonthDoc(uid, mk);
  const eCol = entriesCol(track, mk);

  const result = await db.runTransaction(async (tx) => {
    const [cSnap, aSnap, ySnap, mSnap] = await Promise.all([
      tx.get(cRef),
      tx.get(aRef),
      tx.get(yRef),
      tx.get(mRef),
    ]);

    const counters = cSnap.exists
      ? (cSnap.data() as any)
      : {
          mk,
          uid,
          track,
          role: "athlete", // mirror of monthly role
          attendanceXp: 0,
          attendanceCount: 0,
          fishCount: 0,
          tournament_showCount: 0,
          style_bonusCount: 0,
          characterCount: 0,
          monthXp: 0,
          updatedAt: FieldValue.serverTimestamp(),
        };

    const athleteTotals = aSnap.exists
      ? (aSnap.data() as any)
      : {
          uid,
          track,
          mk,
          totalXp: 0,
          updatedAt: FieldValue.serverTimestamp(),
        };

    const yearFlags = ySnap.exists
      ? (ySnap.data() as any)
      : { year, prestige: {} as Record<string, boolean> };

    const monthFlags = mSnap.exists
      ? (mSnap.data() as any)
      : { mk, leadershipAllowanceGiven: false };

    /* ---------- CAPS ---------- */
    let applied = points;
    let capped = false;
    let capReason: string | null = null;

    if (type === "attendance") {
      if ((counters.role || "athlete") === "leader") {
        applied = 0;
        capped = true;
        capReason = "role_is_leader";
      } else {
        const current = Number(counters.attendanceXp || 0);
        const remaining = ATTENDANCE_XP_CAP - current;
        if (remaining <= 0) {
          applied = 0;
          capped = true;
          capReason = "attendance_cap";
        } else if (applied > remaining) {
          applied = remaining;
          capReason = "attendance_cap_partial";
        }
      }
    } else if (type === "style") {
      const used = Number(counters.style_bonusCount || 0);
      if (used >= STYLE_COUNT_CAP) {
        applied = 0;
        capped = true;
        capReason = "style_cap";
      }
    } else if (type === "fish") {
      const used = Number(counters.fishCount || 0);
      if (used >= FISH_COUNT_CAP) {
        applied = 0;
        capped = true;
        capReason = "fish_cap";
      }
    } else if (type === "prestige") {
      const bKey = (badge || "").toLowerCase();
      if (yearFlags.prestige?.[bKey]) {
        applied = 0;
        capped = true;
        capReason = "prestige_year";
      }
    } else if (type === "character") {
      const isLeader = String(counters.role || "athlete") === "leader";
      const used = Number(counters.characterCount || 0);
      const cap = isLeader ? LEADER_CHARACTER_CAP : NON_LEADER_CHARACTER_CAP;
      if (used >= cap) {
        applied = 0;
        capped = true;
        capReason = "character_cap";
      }
    } else if (type === "leadership_allowance") {
      const isLeader = String(counters.role || "athlete") === "leader";
      if (!isLeader || monthFlags.leadershipAllowanceGiven) {
        applied = 0;
        capped = true;
        capReason = "allowance_cap";
      }
    }

    /* ---------- WRITES ---------- */
    const now = FieldValue.serverTimestamp();

    // counters merge (only bump counts if applied !== 0)
    const toMerge: any = {
      mk,
      uid,
      track,
      monthXp: Number(counters.monthXp || 0) + applied,
      updatedAt: now,
    };

    if (type === "attendance") {
      toMerge.attendanceXp = Number(counters.attendanceXp || 0) + applied;
      toMerge.attendanceCount =
        Number(counters.attendanceCount || 0) + (applied > 0 ? 1 : 0);
    } else if (type === "fish") {
      if (applied !== 0) toMerge.fishCount = Number(counters.fishCount || 0) + 1;
    } else if (type === "tournament_show") {
      if (applied !== 0)
        toMerge.tournament_showCount =
          Number(counters.tournament_showCount || 0) + 1;
    } else if (type === "style") {
      if (applied !== 0)
        toMerge.style_bonusCount = Number(counters.style_bonusCount || 0) + 1;
    } else if (type === "character") {
      if (applied !== 0)
        toMerge.characterCount = Number(counters.characterCount || 0) + 1;
    }

    tx.set(cRef, toMerge, { merge: true });

    // immutable entry
    const entry: any = {
      uid,
      track,
      mk,
      type,
      badge: badge || null,
      note: note || null,
      xp: applied,
      capped,
      capReason, // surfaced by tester
      createdAt: now,
    };
    tx.set(eCol.doc(), entry);

    // leaderboard mirror
    tx.set(
      aRef,
      {
        uid,
        track,
        mk,
        totalXp: Number(athleteTotals.totalXp || 0) + applied,
        updatedAt: now,
      },
      { merge: true }
    );

    // prestige yearly flags
    if (type === "prestige" && applied > 0) {
      const bKey = (badge || "").toLowerCase();
      const next = { ...(yearFlags.prestige || {}) };
      next[bKey] = true;
      tx.set(yRef, { year, prestige: next, updatedAt: now }, { merge: true });
    }

    // allowance month flag
    if (type === "leadership_allowance" && applied > 0) {
      tx.set(
        mRef,
        { mk, leadershipAllowanceGiven: true, updatedAt: now },
        { merge: true }
      );
    }

    return { ok: true, applied, capped, capReason, mk };
  });

  return result;
}

/* ---------- EXPORTS ---------- */

// Canonical callable (SDK: httpsCallable("incrementXp"))
export const incrementXp = onCall<Payload>(async (req) => {
  return incrementXpCore(req.data as Payload);
});

// HTTP shim (dev/integration only; CORS-wrapped; guarded in prod)
export const incrementXpHttp = onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Guard: allow freely on emulator; require secret header otherwise
      if (
        process.env.FUNCTIONS_EMULATOR !== "true" &&
        req.headers["x-admin-secret"] !== process.env.XP_HTTP_SECRET
      ) {
        res.status(403).send({ error: "forbidden" });
        return;
      }

      const body = req.body as Payload;
      const result = await incrementXpCore(body);
      res.json(result);
    } catch (err: any) {
      console.error("[incrementXpHttp] ERROR:", err);
      res.status(500).send({ error: err?.message || "internal" });
    }
  });
});
