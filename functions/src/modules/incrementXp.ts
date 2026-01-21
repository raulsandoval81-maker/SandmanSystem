import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("🔥 Using Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}
/**
 * Minimal XP rules mirror (server-side).
 * Keep this in functions so the client can't bypass caps.
 */
const STRIPES_PER_TIER = 4;

type Base = "F4" | "F8";

const XP = Object.freeze({
  // Foundry 4 (olders / HS) — arena monthly cap removed (unlimited)
  F4: {
    tierCaps: { T0: 1200, T1: 1600, T2: 2000, T3: 2400, T4: 2800 },
    monthly: {
      attendance: 200,
      arena: { T0: null, T1: null, T2: null, T3: null, T4: null }, // unlimited
    },
  },
  // Foundry 8 (youth) — capped monthly arena
  F8: {
    tierCaps: { T0: 800, T1: 1000, T2: 1200, T3: 1400, T4: 1600, T5: 1800, T6: 2000, T7: 2400 },
    monthly: {
      attendance: 160,
      arena: { T0: 0, T1: 40, T2: 40, T3: 60, T4: 60, T5: 60, T6: 60, T7: 80 },
    },
  },
} as const);

const KIND = Object.freeze({
  ATTENDANCE: "ATTENDANCE",
  ARENA_BATTLE: "ARENA/BATTLE",
  ARENA_PODIUM: "ARENA/PODIUM",
  ARENA_STYLEIQ: "ARENA/STYLEIQ",
} as const);
const DEV = Object.freeze({
  GRIND: "DEV/GRIND",
  SETXP: "DEV/SETXP",
  PROMOTE_TIER: "DEV/PROMOTE_TIER", // optional (nice for jumping tiers)
} as const);

function isDevKind(kind: string) {
  return kind === DEV.GRIND || kind === DEV.SETXP || kind === DEV.PROMOTE_TIER;
}

function isEmulator(): boolean {
  // Works for Functions emulator + most local setups
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    !!process.env.FIREBASE_EMULATOR_HUB
  );
}

type Kind = (typeof KIND)[keyof typeof KIND];

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeBaseFromAthlete(a: any): Base {
  const raw = String(a?.trackBase || a?.track || a?.program || "").toUpperCase();

  if (raw.startsWith("F8") || raw.includes("FOUNDRY8")) return "F8";
  if (raw.startsWith("F4") || raw.includes("FOUNDRY4")) return "F4";

  return "F4"; // safe default
}
function normalizeTier(a: any): string {
  if (typeof a?.tier === "string" && a.tier.startsWith("T")) return a.tier;
  if (typeof a?.tier === "number") return `T${a.tier}`;
  if (typeof a?.rank === "string" && a.rank.startsWith("T")) return a.rank;
  return "T0";
}
function monthlyAttendanceCap(base: Base, tier: string): number {
  if (base !== "F8") return XP[base].monthly.attendance;

  const t = String(tier).toUpperCase();
  return ["T0", "T1", "T2", "T3"].includes(t) ? 160 : 200;
}

function isArenaKind(kind: string): kind is
  | typeof KIND.ARENA_BATTLE
  | typeof KIND.ARENA_PODIUM
  | typeof KIND.ARENA_STYLEIQ {
  return (
    kind === KIND.ARENA_BATTLE ||
    kind === KIND.ARENA_PODIUM ||
    kind === KIND.ARENA_STYLEIQ
  );
}

function defaultAmountFor(kind: string): number {
  if (kind === DEV.GRIND) return 10;
  if (kind === DEV.SETXP) return NaN;
  if (kind === DEV.PROMOTE_TIER) return 1; // dummy positive number
  if (kind === KIND.ATTENDANCE) return 10;
  if (kind === KIND.ARENA_BATTLE) return 10;
  if (kind === KIND.ARENA_PODIUM) return 5;
  if (kind === KIND.ARENA_STYLEIQ) return 5;
  return NaN;
}

function nextTier(base: Base, tier: string): string | null {
  const caps = XP[base].tierCaps as unknown as Record<string, number>;
  const tiers = Object.keys(caps).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const idx = tiers.indexOf(tier);
  if (idx === -1) return tiers[0] ?? "T0";
  return tiers[idx + 1] ?? null; // null = already at cap tier
}

export const incrementXp = onCall(async (req) => {
  const payload = req.data || {};

  const uid = String(payload.uid || "").trim();
  const kind = String(payload.kind || "").trim();

  const amountRaw = payload.amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw)
      ? amountRaw
      : undefined;

  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const tournamentId = typeof (meta as any).tournamentId === "string"

    ? String((meta as any).tournamentId).trim()
    : "";

  if (!uid) throw new HttpsError("invalid-argument", "Missing uid");
  if (!kind) throw new HttpsError("invalid-argument", "Missing kind");
if (isDevKind(kind) && !isEmulator()) {
  
  throw new HttpsError("failed-precondition", "DEV kinds are emulator-only.");
}

  // ✅ delta is guaranteed number after this block
  const defaultAmount = defaultAmountFor(kind); // number (may be NaN)
  const deltaCandidate = (amount ?? defaultAmount);

  if (!Number.isFinite(deltaCandidate) || deltaCandidate <= 0) {
    throw new HttpsError("invalid-argument", "Invalid amount");
  }
  const delta: number = deltaCandidate;

  if (isArenaKind(kind) && !tournamentId) {
    throw new HttpsError("invalid-argument", "Arena awards require meta.tournamentId");
  }

  const athleteRef = db.collection("athletes").doc(uid);

  // monthly aggregate doc (fast cap enforcement without scanning logs)
  const mKey = monthKey();
  const monthlyRef = db.collection("xp_monthly").doc(`${uid}_${mKey}`);

  const logRef = db.collection("xp_logs").doc(); // root logs, matches your UI

  const result = await db.runTransaction(async (tx) => {
    const athleteSnap = await tx.get(athleteRef);
    if (!athleteSnap.exists) throw new HttpsError("not-found", `Athlete not found: ${uid}`);

    const athlete = athleteSnap.data() || {};
    const base: Base = normalizeBaseFromAthlete(athlete);
    const tier = normalizeTier(athlete);
const devRun = isDevKind(kind);

if (kind === DEV.PROMOTE_TIER) {
  const isTestUid = uid.startsWith("F4_TEST_") || uid.startsWith("F8_TEST_");
  if (!isTestUid) throw new HttpsError("failed-precondition", "DEV promote requires TEST uid.");

  const nxt = nextTier(base, tier);
  if (!nxt) {
    return { ok: true, blocked: true, reason: "ALREADY_AT_CAP_TIER", base, tier };
  }

  const caps = XP[base].tierCaps as unknown as Record<string, number>;
  const newCap = Number(caps[nxt] ?? 0);
  if (!newCap) throw new HttpsError("failed-precondition", `Missing cap for ${base} ${nxt}`);

  // Reset XP on promotion (clean + predictable)
  const beforeXp = Number(athlete.xp ?? 0);
  const afterXp = 0;

  tx.set(
    athleteRef,
    {
      tier: nxt,
      xp: afterXp,
      xpCap: newCap,
      trackBase: base,
      stripeCount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // OPTIONAL but recommended: reset monthly counters for this uid+month so your test stays clean
  // (safe because it's test uid only)
  tx.set(
    monthlyRef,
    {
      uid,
      month: mKey,
      attendance: 0,
      arena: 0,
      updatedAt: FieldValue.serverTimestamp(),
      devMode: true, // keep bypass sticky
    },
    { merge: true }
  );

  tx.set(logRef, {
    uid,
    kind,
    amount: 0,
    note: note || `Promote ${tier} -> ${nxt}`,
    meta: { fromTier: tier, toTier: nxt, beforeXp },
    base,
    tier: nxt,
    beforeXp,
    afterXp,
    month: mKey,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    blocked: false,
    uid,
    kind,
    base,
    fromTier: tier,
    toTier: nxt,
    beforeXp,
    afterXp,
    cap: newCap,
    stripeCount: 0,
  };
}

    const tierCaps = XP[base].tierCaps as unknown as Record<string, number>;
    const cap = Number(tierCaps[tier] ?? 0);
    if (!cap) throw new HttpsError("failed-precondition", `Missing cap for ${base} ${tier}`);

    const beforeXp = Number(athlete.xp ?? 0);
    if (beforeXp >= cap) {
      return {
        ok: true,
        blocked: true,
        reason: "TIER_CAP_REACHED",
        base, tier, cap,
        beforeXp,
        afterXp: beforeXp,
      };
    }

    const monthlySnap = await tx.get(monthlyRef);
    const monthly = monthlySnap.exists ? (monthlySnap.data() || {}) : {};
    const attendanceSoFar = Number((monthly as any).attendance ?? 0);
    const arenaSoFar = Number((monthly as any).arena ?? 0);

// ---- monthly caps (attendance always capped; arena capped only for F8) ----

// dev bypass: ONLY if monthlyRef has devMode:true AND uid is a TEST uid
const devMode = (monthly as any).devMode === true;
const isTestUid = uid.startsWith("F4_TEST_") || uid.startsWith("F8_TEST_");
const allowDevBypass = devMode && isTestUid;

if (!devRun && !allowDevBypass) {
  if (kind === KIND.ATTENDANCE) {
    const maxAttend = monthlyAttendanceCap(base, tier);

    if ((attendanceSoFar + delta) > maxAttend) {
      return {
        ok: true,
        blocked: true,
        reason: "MONTHLY_ATTENDANCE_CAP_REACHED",
        base, tier, cap,
        beforeXp,
        afterXp: beforeXp,
        month: mKey,
        attendanceSoFar,
        maxAttend,
      };
    }
  }

  if (isArenaKind(kind)) {
    const maxArena = (XP[base].monthly.arena as any)?.[tier];
    // null/undefined means unlimited for F4 (your HS rule)
    if (typeof maxArena === "number" && (arenaSoFar + delta) > maxArena) {
      return {
        ok: true,
        blocked: true,
        reason: "MONTHLY_ARENA_CAP_REACHED",
        base, tier, cap,
        beforeXp,
        afterXp: beforeXp,
        month: mKey,
        arenaSoFar,
        maxArena,
      };
    }
  }
}

// styleIQ once per tournament (I would STILL enforce this even in devMode)
if (isArenaKind(kind)) {
  if (kind === KIND.ARENA_STYLEIQ) {
    const styleMap =
      ((monthly as any).styleByTournament && typeof (monthly as any).styleByTournament === "object")
        ? (monthly as any).styleByTournament
        : {};

    if (styleMap[tournamentId]) {
      return {
        ok: true,
        blocked: true,
        reason: "STYLEIQ_ALREADY_AWARDED_FOR_TOURNAMENT",
        base, tier, cap,
        beforeXp,
        afterXp: beforeXp,
        month: mKey,
        tournamentId,
      };
    }

    styleMap[tournamentId] = true;
    tx.set(monthlyRef, { styleByTournament: styleMap }, { merge: true });
  }
}

// ---- apply tier cap clamp ----
const afterXp = Math.min(cap, beforeXp + delta);

// derived stripes (visual)
const stripeStep = Math.max(1, Math.round(cap / STRIPES_PER_TIER / 10) * 10);
const stripeCount = Math.floor(Math.min(cap, afterXp) / stripeStep);

// write athlete update
tx.set(
  athleteRef,
  {
    xp: afterXp,
    xpCap: cap,
    tier,
    trackBase: base,
    stripeCount,
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);

// update monthly counters
if (!devRun) {
  const patch: any = {
    uid,
    month: mKey,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (kind === KIND.ATTENDANCE) patch.attendance = attendanceSoFar + delta;
  if (isArenaKind(kind)) patch.arena = arenaSoFar + delta;

  tx.set(monthlyRef, patch, { merge: true });
}

    // write log
    tx.set(logRef, {
      uid,
      kind,
      amount: delta,
      note,
      meta: isArenaKind(kind) ? { tournamentId } : (meta || {}),
      base,
      tier,
      beforeXp,
      afterXp,
      month: mKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      blocked: false,
      uid,
      kind,
      amount: delta,
      base,
      tier,
      cap,
      beforeXp,
      afterXp,
      stripeCount,
      stripeStep,
      logId: logRef.id,
    };
  });

  return result;
});
