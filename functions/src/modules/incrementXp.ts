// functions/src/incrementXp.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendParentSignal } from "./parent/sendParentSignal";
import { PARENT_SIGNAL_TYPES } from "./parent/parentSignalTypes";


if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("🔥 Using Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}
// 👇 put it HERE (with helpers, not inside a function)
function getMonthKey(date: Date) {
  return date.toISOString().slice(0, 7); // "2026-05"
}
/**
 * Minimal XP rules mirror (server-side).
 * Keep this in functions so the client can't bypass caps.
 */
const STRIPES_PER_TIER = 4;

type Base = "F4" | "F8";

const XP = Object.freeze({
  // Foundry 4 (Teen) — arena monthly cap removed (unlimited)
  F4: {
    tierCaps: { T0: 1000, T1: 1600, T2: 2000, T3: 2400, T4: 3000 },
    monthly: {
      attendance: 200,
      arena: { T0: null, T1: null, T2: null, T3: null, T4: null }, // unlimited
    },
  },
  // Foundry 8 (Youth) — capped monthly arena
  F8: {
    tierCaps: {
      T0: 600,
      T1: 800,
      T2: 1000,
      T3: 1200,
      T4: 1400,
      T5: 1600,
      T6: 1800,
      T7: 2400,
    },
    monthly: {
      attendance: 160, // ✅ LOCKED: 160 for ALL F8 tiers
      arena: { T0: 0, T1: 40, T2: 40, T3: 60, T4: 60, T5: 60, T6: 60, T7: 80 },
    },
  },
} as const);

// Lane rules (V1)
// Lane rules (V1)
const LANE = Object.freeze({
  F8: {
    strength: {
      delta: 5,
      monthlyCap: 60,
      gate: { tier: "T3", stripe: 1 }
    },

    honor: {
      delta: 5,
      monthlyCap: 60,
      gate: { tier: "T3", stripe: 2 }
    },
  },

  F4: {
    strength: {
      deltaFull: 10,
      deltaMerit: 5,
      monthlyCap: 120
    },

    honor: {
      deltaFull: 10,
      deltaMerit: 5,
      monthlyCap: 120
    },
  },
} as const);

const KIND = Object.freeze({
  ATTENDANCE: "ATTENDANCE",
  ARENA_BATTLE: "ARENA/BATTLE",
  ARENA_PODIUM: "ARENA/PODIUM",
  ARENA_STYLEIQ: "ARENA/STYLEIQ",

  // Strength / Honor (coach-only)
  STRENGTH: "STRENGTH",
  HONOR: "HONOR",
} as const);

const DEV = Object.freeze({
  GRIND: "DEV/GRIND",
  SETXP: "DEV/SETXP",
  PROMOTE_TIER: "DEV/PROMOTE_TIER", // optional (nice for jumping tiers)

  // ✅ status + locks (dev-only)
  SET_STATUS: "DEV/SET_STATUS",
  CLEAR_LOCK: "DEV/CLEAR_LOCK",
} as const);

function isDevKind(kind: string) {
  return (
    kind === DEV.GRIND ||
    kind === DEV.SETXP ||
    kind === DEV.PROMOTE_TIER ||
    kind === DEV.SET_STATUS ||
    kind === DEV.CLEAR_LOCK
  );
}

function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" || !!process.env.FIREBASE_EMULATOR_HUB;
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

// ✅ single truth: attendance cap is just XP[base].monthly.attendance
function monthlyAttendanceCap(base: Base): number {
  return XP[base].monthly.attendance;
}

function isArenaKind(
  kind: string
): kind is typeof KIND.ARENA_BATTLE | typeof KIND.ARENA_PODIUM | typeof KIND.ARENA_STYLEIQ {
  return kind === KIND.ARENA_BATTLE || kind === KIND.ARENA_PODIUM || kind === KIND.ARENA_STYLEIQ;
}

function isStrengthKind(kind: string) {
  return kind === KIND.STRENGTH;
}
function isHonorKind(kind: string) {
  return kind === KIND.HONOR;
}
function isLaneKind(kind: string) {
  return isStrengthKind(kind) || isHonorKind(kind);
}

function defaultAmountFor(kind: string): number {
  if (kind === DEV.GRIND) return 10;
  if (kind === DEV.SETXP) return NaN;
  if (kind === DEV.PROMOTE_TIER) return 1; // dummy positive number

  // ✅ dev status kinds ignore amount but must pass validation
  if (kind === DEV.SET_STATUS) return 1;
  if (kind === DEV.CLEAR_LOCK) return 1;

  if (kind === KIND.ATTENDANCE) return 10;
  if (kind === KIND.ARENA_BATTLE) return 10;
  if (kind === KIND.ARENA_PODIUM) return 5;
  if (kind === KIND.ARENA_STYLEIQ) return 5;

  // Strength/Honor:
  // - F4 usually +10 (or +5 merit)
  // - F8 must be +5
  // We validate later by base, so defaulting to 10 is fine as long as youth passes 5.
  if (kind === KIND.STRENGTH) return 10;
  if (kind === KIND.HONOR) return 10;

  return NaN;
}

function nextTier(base: Base, tier: string): string | null {
  const caps = XP[base].tierCaps as unknown as Record<string, number>;
  const tiers = Object.keys(caps).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const idx = tiers.indexOf(tier);
  if (idx === -1) return tiers[0] ?? "T0";
  return tiers[idx + 1] ?? null; // null = already at cap tier
}


function stripeCountForCombatTotal(total: number, cap: number) {
  const safeCap = Math.max(1, Number(cap) || 1);
  const safeTotal = Math.max(0, Math.min(safeCap, Number(total) || 0));
  const pct = (safeTotal / safeCap) * 100;

  if (pct >= 100) return 4;
  if (pct >= 75) return 3;
  if (pct >= 50) return 2;
  if (pct >= 25) return 1;
  return 0;
}

export const incrementXp = onCall(async (req) => {
  // 🔒 AUTH GUARD — MUST BE FIRST
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Coach authentication required");
  }

  const coachUid = req.auth.uid;

  const payload = req.data || {};
  const uid = String(payload.uid || "").trim();
  const kind = String(payload.kind || "").trim();

  const amountRaw = payload.amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw) ? amountRaw : undefined;

  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const tournamentId =
    typeof (meta as any).tournamentId === "string" ? String((meta as any).tournamentId).trim() : "";

  if (!uid) throw new HttpsError("invalid-argument", "Missing uid");
  if (!kind) throw new HttpsError("invalid-argument", "Missing kind");

  if (isDevKind(kind) && !isEmulator()) {
    throw new HttpsError("failed-precondition", "DEV kinds are emulator-only.");
  }

  // ✅ delta is guaranteed number after this block
  const defaultAmount = defaultAmountFor(kind);
  const deltaCandidate = amount ?? defaultAmount;

  if (!Number.isFinite(deltaCandidate) || deltaCandidate <= 0) {
    throw new HttpsError("invalid-argument", "Invalid amount");
  }
  const delta: number = deltaCandidate;

  if (isArenaKind(kind) && !tournamentId) {
    throw new HttpsError("invalid-argument", "Arena awards require meta.tournamentId");
  }

  const athleteRef = db.collection("athletes").doc(uid);
  const mKey = monthKey();
  const monthlyRef = db.collection("xp_monthly").doc(`${uid}_${mKey}`);
  const logRef = db.collection("xp_logs").doc();

  const result = await db.runTransaction(async (tx) => {
    
    const athleteSnap = await tx.get(athleteRef);
    if (!athleteSnap.exists) throw new HttpsError("not-found", `Athlete not found: ${uid}`);

    const athlete = athleteSnap.data() || {};
    const base: Base = normalizeBaseFromAthlete(athlete);
    const tier = normalizeTier(athlete);
    const devRun = isDevKind(kind);

    

    // ------------------------
    // DEV: PROMOTE TIER (test only)
    // ------------------------
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

      const beforeXpPromote = Number((athlete as any).xp ?? 0);
      const afterXpPromote = 0;

      tx.set(
        athleteRef,
        {
          tier: nxt,
          xp: 0,
          xpCap: newCap,
          trackBase: base,

          // ✅ combat bucket wipe (prevents "stacking" illusion)
          xpDaily: 0,
          xpArena: 0,
          xpFightIQ: 0,
          stripeCount: 0,

          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        monthlyRef,
        {
          uid,
          month: mKey,
          attendance: 0,
          arena: 0,
          strength: 0,
          honor: 0,

          // ✅ clear styleIQ per-tournament history
          styleByTournament: {},

          updatedAt: FieldValue.serverTimestamp(),
          devMode: true,
        },
        { merge: true }
      );

      tx.set(logRef, {
        uid,
        coachUid,
        kind,
        amount: 0,
        note: note || `Promote ${tier} -> ${nxt}`,
        meta: { fromTier: tier, toTier: nxt, beforeXp: beforeXpPromote, lane: "dev" },
        base,
        tier: nxt,
        beforeXp: beforeXpPromote,
        afterXp: afterXpPromote,
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
        beforeXp: beforeXpPromote,
        afterXp: afterXpPromote,
        cap: newCap,
        stripeCount: 0,
      };
    }

    // ------------------------
    // DEV: SET XP (test only) — authoritative write
    // ALSO stamps monthlyRef.devMode=true so DEV bypass works reliably.
    // ------------------------
    if (kind === DEV.SETXP) {
      const isTestUid = uid.startsWith("F4_TEST_") || uid.startsWith("F8_TEST_");
      if (!isTestUid) {
        throw new HttpsError("failed-precondition", "DEV/SETXP requires TEST uid.");
      }

      const tierCaps = XP[base].tierCaps as unknown as Record<string, number>;
      const cap = Number(tierCaps[tier] ?? 0);
      if (!cap) throw new HttpsError("failed-precondition", `Missing cap for ${base} ${tier}`);

      const beforeXpSet = Number((athlete as any).xp ?? 0);

      // absolute set, clamped (delta carries the desired XP target)
      const target = Math.max(0, Math.min(cap, delta));

    const stripeCount = stripeCountForCombatTotal(target, cap);
      tx.set(
        athleteRef,
        {
          xp: target,
          xpDaily: target, // treat as daily for stripe math + clarity
          xpArena: 0,
          xpFightIQ: 0,
          stripeCount,
          xpCap: cap,
          tier,
          trackBase: base,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // ✅ DEV bypass stamp
      tx.set(
        monthlyRef,
        {
          uid,
          month: mKey,
          devMode: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(logRef, {
        uid,
        coachUid,
        kind,
        amount: target,
        note: note || `DEV set xp -> ${target}`,
        meta: { ...(meta || {}), lane: "dev" },
        base,
        tier,
        beforeXp: beforeXpSet,
        afterXp: target,
        month: mKey,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        blocked: false,
        uid,
        kind,
        amount: target,
        base,
        tier,
        cap,
        beforeXp: beforeXpSet,
        afterXp: target,
        stripeCount,
        logId: logRef.id,
      };
    }

    // ------------------------
    // CAPS
    // ------------------------
    const tierCaps = XP[base].tierCaps as unknown as Record<string, number>;
    const cap = Number(tierCaps[tier] ?? 0);
    if (!cap) throw new HttpsError("failed-precondition", `Missing cap for ${base} ${tier}`);

    // ---- COMBAT BASELINE (BACKWARD-COMPAT SAFE) ----
    const beforeXp = Number((athlete as any).xp ?? 0);

    // Detect whether buckets already exist
    const hasBuckets =
      (athlete as any).xpDaily !== undefined ||
      (athlete as any).xpArena !== undefined ||
      (athlete as any).xpFightIQ !== undefined;

    // If buckets exist → use them.
    // If not → treat existing xp as daily so nothing collapses
    const beforeDaily = Number((athlete as any).xpDaily ?? (hasBuckets ? 0 : beforeXp));
    const beforeArena = Number((athlete as any).xpArena ?? 0);
    const beforeFightIQ = Number((athlete as any).xpFightIQ ?? 0);

    // ✅ SINGLE SOURCE for COMBAT bar total
    const beforeCombatTotal = hasBuckets ? beforeDaily + beforeArena + beforeFightIQ : beforeXp;

    // Lane totals (F4 only, coach-only)
    const beforeStrength = Number((athlete as any).xpStrength ?? 0);
    const beforeHonor = Number((athlete as any).xpHonor ?? 0);

    // ------------------------
    // DEV: STATUS / LOCKS (test only, NO XP changes)
    // ------------------------
    if (kind === DEV.SET_STATUS || kind === DEV.CLEAR_LOCK) {
      const isTestUid = uid.startsWith("F4_TEST_") || uid.startsWith("F8_TEST_");
      if (!isTestUid) {
        throw new HttpsError("failed-precondition", "DEV status requires TEST uid.");
      }

      const m = meta && typeof meta === "object" ? (meta as any) : {};
      const requestedStatus = String(m.status || "").trim().toUpperCase();

      const allowed = new Set([
        "IN_TIER",
        "TEST_READY",
        "FROZEN",
        "COOLDOWN",
        "TIER_COMPLETE",
        "TEST_PASSED",
      ]);
      if (kind === DEV.SET_STATUS && !allowed.has(requestedStatus)) {
        throw new HttpsError("invalid-argument", `Invalid status: ${requestedStatus}`);
      }

      let newStatus = "IN_TIER";
      let newLockedUntil: any = null;
      let lastTestResult: any = null;

      if (kind === DEV.CLEAR_LOCK) {
        newStatus = "IN_TIER";
        newLockedUntil = null;
        lastTestResult = null;
      } else {
        newStatus = requestedStatus;

        // Only FROZEN/COOLDOWN require a lock time
        if (newStatus === "FROZEN" || newStatus === "COOLDOWN") {
          const daysRaw = m.days;
          const days =
            typeof daysRaw === "number" && Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 0;
          if (days <= 0) {
            throw new HttpsError(
              "invalid-argument",
              "meta.days must be a positive integer for FROZEN/COOLDOWN"
            );
          }
          newLockedUntil = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
          lastTestResult = newStatus === "FROZEN" ? "FAIL" : "PASS";
        }
      }

      tx.set(
        athleteRef,
        {
          status: newStatus,
          lockedUntil: newLockedUntil,
          ...(newStatus === "FROZEN" || newStatus === "COOLDOWN"
            ? { lastTestAt: FieldValue.serverTimestamp(), lastTestResult }
            : {}),
          ...(kind === DEV.CLEAR_LOCK ? { lastTestResult: null, lockedUntil: null } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(logRef, {
        uid,
        coachUid,
        kind,
        amount: 0,
        note: note || (kind === DEV.CLEAR_LOCK ? "DEV clear lock" : `DEV set status=${newStatus}`),
        meta: {
          ...(meta || {}),
          lane: "dev",
          status: newStatus,
          lockedUntil: newLockedUntil,
        },
        base,
        tier,
        beforeXp: beforeCombatTotal,
        afterXp: beforeCombatTotal,
        month: mKey,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        blocked: false,
        uid,
        kind,
        base,
        tier,
        status: newStatus,
        lockedUntil: newLockedUntil,
      };
    }

    // ------------------------
    // LOCK CHECK (COOLDOWN / FROZEN)
    // ------------------------
    const status = String((athlete as any).status || "IN_TIER").toUpperCase();
    const lockedUntil = (athlete as any).lockedUntil;

    const lockedUntilMs =
      lockedUntil && typeof lockedUntil.toDate === "function" ? lockedUntil.toDate().getTime() : 0;

    const locked = (status === "COOLDOWN" || status === "FROZEN") && lockedUntilMs > Date.now();

    if (locked) {
      return {
        ok: true,
        blocked: true,
        reason: status === "COOLDOWN" ? "PROMOTION_COOLDOWN" : "TEST_FREEZE",
        status,
        lockedUntil,
        base,
        tier,
        cap,
        beforeXp: beforeCombatTotal,
        afterXp: beforeCombatTotal,
      };
    }

    // Tier cap check:
    // - F8: single bar must respect cap
    // - F4: combat cap applies only to combat kinds
    // - F4: lane kinds cap against lane totals (simple V1)
    if (base === "F8" && beforeCombatTotal >= cap) {
      return {
        ok: true,
        blocked: true,
        reason: "TIER_CAP_REACHED",
        base,
        tier,
        cap,
        beforeXp: beforeCombatTotal,
        afterXp: beforeCombatTotal,
      };
    }

    if (base === "F4") {
      // Combat kinds
      if (!isLaneKind(kind) && beforeCombatTotal >= cap) {
        return {
          ok: true,
          blocked: true,
          reason: "TIER_CAP_REACHED",
          base,
          tier,
          cap,
          beforeXp: beforeCombatTotal,
          afterXp: beforeCombatTotal,
        };
      }

      // Lane kinds
      if (kind === KIND.STRENGTH && beforeStrength >= cap) {
        return {
          ok: true,
          blocked: true,
          reason: "TIER_CAP_REACHED",
          base,
          tier,
          cap,
          beforeXp: beforeStrength,
          afterXp: beforeStrength,
        };
      }
      if (kind === KIND.HONOR && beforeHonor >= cap) {
        return {
          ok: true,
          blocked: true,
          reason: "TIER_CAP_REACHED",
          base,
          tier,
          cap,
          beforeXp: beforeHonor,
          afterXp: beforeHonor,
        };
      }
    }

    const monthlySnap = await tx.get(monthlyRef);
    const monthly = monthlySnap.exists ? monthlySnap.data() || {} : {};
    const attendanceSoFar = Number((monthly as any).attendance ?? 0);
    const arenaSoFar = Number((monthly as any).arena ?? 0);
    const strengthSoFar = Number((monthly as any).strength ?? 0);
    const honorSoFar = Number((monthly as any).honor ?? 0);

    // dev bypass: ONLY if monthlyRef has devMode:true AND uid is a TEST uid
    const devMode = (monthly as any).devMode === true;
    const isTestUid = uid.startsWith("F4_TEST_") || uid.startsWith("F8_TEST_");
    const allowDevBypass = devMode && isTestUid;

    // For gating we need current stripe (computed off combat total)
    const beforeStripeCount = stripeCountForCombatTotal(beforeCombatTotal, cap);
    // ------------------------
    // MONTHLY ENFORCEMENT (no dev / no bypass)
    // ------------------------
    if (!devRun && !allowDevBypass) {
      // Attendance cap
      if (kind === KIND.ATTENDANCE) {
        const maxAttend = monthlyAttendanceCap(base);
        if (attendanceSoFar + delta > maxAttend) {
          return {
            ok: true,
            blocked: true,
            reason: "MONTHLY_ATTENDANCE_CAP_REACHED",
            base,
            tier,
            cap,
            beforeXp: beforeCombatTotal,
            afterXp: beforeCombatTotal,
            month: mKey,
            attendanceSoFar,
            maxAttend,
          };
        }
      }

      // Arena cap (F8 only)
      if (isArenaKind(kind)) {
        const maxArena = (XP[base].monthly.arena as any)?.[tier];
        // null/undefined means unlimited for F4
        if (typeof maxArena === "number" && arenaSoFar + delta > maxArena) {
          return {
            ok: true,
            blocked: true,
            reason: "MONTHLY_ARENA_CAP_REACHED",
            base,
            tier,
            cap,
            beforeXp: beforeCombatTotal,
            afterXp: beforeCombatTotal,
            month: mKey,
            arenaSoFar,
            maxArena,
          };
        }
      }

      // Strength/Honor enforcement
      if (isLaneKind(kind)) {
        const lane = isStrengthKind(kind) ? "strength" : "honor";

        if (base === "F8") {
          const rule = lane === "strength" ? LANE.F8.strength : LANE.F8.honor;

          // youth delta must be exactly +5
          if (delta !== rule.delta) {
            return {
              ok: true,
              blocked: true,
              reason: "INVALID_DELTA_FOR_YOUTH",
              base,
              tier,
              cap,
              beforeXp: beforeCombatTotal,
              afterXp: beforeCombatTotal,
            };
          }

// ----------
// F8 PERMA-UNLOCK GATE (unlock once in T0, then stay unlocked)
// ----------

const unlockedStrength = Boolean((athlete as any).laneUnlockedStrength);
const unlockedHonor    = Boolean((athlete as any).laneUnlockedHonor);

const isStrength = lane === "strength";
const alreadyUnlocked = isStrength ? unlockedStrength : unlockedHonor;

// If not unlocked yet, only allow unlocking in T0 when stripe gate is met
const canUnlockNow =
  (tier === "T0") && (beforeStripeCount >= rule.gate.stripe);

if (!alreadyUnlocked && !canUnlockNow) {
  return {
    ok: true,
    blocked: true,
    reason: "CONTRIB_LOCKED_BY_GATE",
    base, tier, cap,
    beforeXp: beforeCombatTotal,
    afterXp: beforeCombatTotal,
    gate: rule.gate,
    beforeStripeCount,
  };
}

// If we just qualified, persist unlock on athlete doc (FOREVER)
if (!alreadyUnlocked && canUnlockNow) {
  tx.set(
    athleteRef,
    {
      ...(isStrength ? { laneUnlockedStrength: true } : { laneUnlockedHonor: true }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

          // monthly cap per contribution
          const soFar = lane === "strength" ? strengthSoFar : honorSoFar;
          if (soFar + delta > rule.monthlyCap) {
            return {
              ok: true,
              blocked: true,
              reason: "MONTHLY_CONTRIB_CAP_REACHED",
              base,
              tier,
              cap,
              beforeXp: beforeCombatTotal,
              afterXp: beforeCombatTotal,
              month: mKey,
              soFar,
              max: rule.monthlyCap,
            };
          }
        }

        if (base === "F4") {
          const rule = lane === "strength" ? LANE.F4.strength : LANE.F4.honor;

          // F4 delta must be +10 (full) or +5 (merit)
          const okDelta = delta === rule.deltaFull || delta === rule.deltaMerit;
          if (!okDelta) {
            return {
              ok: true,
              blocked: true,
              reason: "INVALID_DELTA_FOR_F4_LANE",
              base,
              tier,
              cap,
              beforeXp: beforeCombatTotal,
              afterXp: beforeCombatTotal,
            };
          }

          const soFar = lane === "strength" ? strengthSoFar : honorSoFar;
          if (soFar + delta > rule.monthlyCap) {
            return {
              ok: true,
              blocked: true,
              reason: "MONTHLY_LANE_CAP_REACHED",
              base,
              tier,
              cap,
              beforeXp: beforeCombatTotal,
              afterXp: beforeCombatTotal,
              month: mKey,
              soFar,
              max: rule.monthlyCap,
            };
          }
        }
      }
    }

    // styleIQ once per tournament (keep enforced even in devMode)
    if (isArenaKind(kind) && kind === KIND.ARENA_STYLEIQ) {
      const styleMap =
        (monthly as any).styleByTournament && typeof (monthly as any).styleByTournament === "object"
          ? (monthly as any).styleByTournament
          : {};

      if (styleMap[tournamentId]) {
        return {
          ok: true,
          blocked: true,
          reason: "STYLEIQ_ALREADY_AWARDED_FOR_TOURNAMENT",
          base,
          tier,
          cap,
          beforeXp: beforeCombatTotal,
          afterXp: beforeCombatTotal,
          month: mKey,
          tournamentId,
        };
      }

      styleMap[tournamentId] = true;
      tx.set(monthlyRef, { styleByTournament: styleMap }, { merge: true });
    }

    // ------------------------
    // APPLY UPDATES
    // ------------------------

    // ✅ main bar total (single source for xp)
    let afterCombatTotal = beforeCombatTotal;

    // Combat buckets (existing)
    let afterDaily = beforeDaily;
    let afterArena = beforeArena;
    let afterFightIQ = beforeFightIQ;

    // Lane totals (F4 = separate; F8 = optional tracking if you store them)
    let afterStrength = beforeStrength;
    let afterHonor = beforeHonor;

    // ------------------------
    // MAP DELTA -> BUCKETS / TOTALS
    // ------------------------

    // Combat mapping (always affects combat buckets)
    if (kind === KIND.ATTENDANCE) afterDaily += delta;
    if (kind === KIND.ARENA_BATTLE || kind === KIND.ARENA_PODIUM) afterArena += delta;
    if (kind === KIND.ARENA_STYLEIQ) afterFightIQ += delta;

    // Strength/Honor mapping
    if (isLaneKind(kind)) {
      if (base === "F8") {
        // ✅ F8: ONE BAR — lane XP must move the main bar
        afterCombatTotal += delta;

        // optional: track lane buckets too (ONLY if you store xpStrength/xpHonor for F8)
        if (isStrengthKind(kind)) afterStrength += delta;
        if (isHonorKind(kind)) afterHonor += delta;

        // IMPORTANT: do NOT add lane delta into afterDaily/afterArena/afterFightIQ
      } else {
        // F4: lanes are separate totals (do NOT affect combat bar)
        if (isStrengthKind(kind)) afterStrength += delta;
        if (isHonorKind(kind)) afterHonor += delta;
      }
    }

    // ------------------------
    // CLAMP + FINAL TOTALS
    // ------------------------

    // ✅ Bar total rules
    if (base === "F4") {
      // F4 bar = combat buckets only (lanes are separate)
      afterCombatTotal = afterDaily + afterArena + afterFightIQ;
    } else {
      // F8 bar = combat buckets + lane delta already applied
      const combatBucketsTotal = afterDaily + afterArena + afterFightIQ;
      const laneDeltaApplied = afterCombatTotal - beforeCombatTotal;
      afterCombatTotal = combatBucketsTotal + laneDeltaApplied;
    }

    // Clamp bar
    afterCombatTotal = Math.min(cap, afterCombatTotal);

    // Clamp lanes (simple V1)
    const afterStrengthClamped = Math.min(cap, afterStrength);
    const afterHonorClamped = Math.min(cap, afterHonor);

    // Derived stripes are for COMBAT bar (visual)
const stripeCount = stripeCountForCombatTotal(afterCombatTotal, cap);
    // ------------------------
    // Athlete update
    // ------------------------
    const athletePatch: any = {
      xpCap: cap,
      tier,
      trackBase: base,
      updatedAt: FieldValue.serverTimestamp(),

      // Always keep combat bar fields compatible
      xp: afterCombatTotal,
      xpDaily: afterDaily,
      xpArena: afterArena,
      xpFightIQ: afterFightIQ,
      stripeCount,
    };
    

    // ✅ F4: always store lanes
    if (base === "F4") {
      athletePatch.xpStrength = afterStrengthClamped;
      athletePatch.xpHonor = afterHonorClamped;
    }

    // ✅ F8: store lane totals only when lane is used (keeps docs clean)
    if (base === "F8") {
      if (isStrengthKind(kind)) athletePatch.xpStrength = afterStrengthClamped;
      if (isHonorKind(kind)) athletePatch.xpHonor = afterHonorClamped;
    }
    // ------------------------
// AUTO TESTING STAGE (SYSTEM-OWNED)
// ------------------------

const ratio = cap > 0 ? afterCombatTotal / cap : 0;

// read current testing safely
const currentState = String((athlete as any)?.testing?.state || "ACTIVE");

let nextState: string | null = null;
let becameEligible = false;

if (currentState === "ACTIVE") {
  if (ratio >= 1) {
    nextState = "ELIGIBLE";
    becameEligible = true;
  } else if (ratio >= 0.9) {
    nextState = "TEMPLE";
  }
}

// apply if needed
if (nextState) {
  athletePatch["testing"] = {
    ...(athlete as any).testing,
    state: nextState,
  };

  athletePatch["tierStatus"] = nextState.toLowerCase();

  if (nextState === "TEMPLE") {
    athletePatch["templeEnteredAt"] = FieldValue.serverTimestamp();
  }

  if (nextState === "ELIGIBLE") {
    athletePatch["testEligibleAt"] = FieldValue.serverTimestamp();
  }
}

    tx.set(athleteRef, athletePatch, { merge: true });

    // ------------------------
    // Monthly counters update
    // ------------------------
    if (!devRun) {
      const patch: any = { uid, month: mKey, updatedAt: FieldValue.serverTimestamp() };

      if (kind === KIND.ATTENDANCE) patch.attendance = attendanceSoFar + delta;
      if (isArenaKind(kind)) patch.arena = arenaSoFar + delta;

      // Lane monthly counters (works for BOTH F4 and F8 gating)
      if (isStrengthKind(kind)) patch.strength = strengthSoFar + delta;
      if (isHonorKind(kind)) patch.honor = honorSoFar + delta;

      tx.set(monthlyRef, patch, { merge: true });
    }

// Log (permanent coach file)
const laneTag =
  kind === KIND.STRENGTH
    ? "strength"
    : kind === KIND.HONOR
      ? "honor"
      : isArenaKind(kind)
        ? "arena"
        : kind === KIND.ATTENDANCE
          ? "combat"
          : "unknown";

tx.set(logRef, {
  uid,
  coachUid,
  kind,
  amount: delta,
  note,
  meta: {
    ...(meta || {}),
    lane: laneTag,
    ...(isArenaKind(kind) ? { tournamentId } : {}),
    stripeSnapshot: { beforeStripeCount },
    xpBuckets: {
      beforeDaily,
      beforeArena,
      beforeFightIQ,
      afterDaily,
      afterArena,
      afterFightIQ,
      beforeStrength,
      beforeHonor,
      afterStrength: afterStrengthClamped,
      afterHonor: afterHonorClamped,
    },
  },
  base,
  tier,
  beforeXp: beforeCombatTotal,
  afterXp: afterCombatTotal,
  month: mKey,
  createdAt: FieldValue.serverTimestamp(),
});

// 🔥 LEADERBOARD WRITE
const leaderboardTrack = base === "F8" ? "foundry8" : "foundry4";

const leaderboardEntryRef = db
  .collection("leaderboards")
  .doc(leaderboardTrack)
  .collection("months")
  .doc(mKey)
  .collection("entries")
  .doc();

tx.set(leaderboardEntryRef, {
  uid,
  athleteName:
    (athlete as any).fullName ||
    (athlete as any).publicName ||
    (athlete as any).name ||
    uid,
  xp: delta,
  kind,
  base,
  tier,
  month: mKey,
  createdAt: FieldValue.serverTimestamp(),
});

// 🔥 LIFETIME LEADERBOARD WRITE (ADD THIS UNDER)
const lifetimeEntryRef = db
  .collection("leaderboards")
  .doc(leaderboardTrack)
  .collection("lifetime")
  .doc("summary")
  .collection("entries")
  .doc();

tx.set(lifetimeEntryRef, {
  uid,
  athleteName:
    (athlete as any).fullName ||
    (athlete as any).publicName ||
    (athlete as any).name ||
    uid,
  xp: delta,
  kind,
  base,
  tier,
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
  beforeXp: beforeCombatTotal,
  afterXp: afterCombatTotal,
  stripeCount,

  becameEligible:
    nextState === "ELIGIBLE",

  athleteName:
    (athlete as any).publicName ||
    (athlete as any).fullName ||
    (athlete as any).name ||
    uid,

  parentUid:
    (athlete as any).parentUid || null,
  xpStrength:
    (base === "F8" && kind === KIND.STRENGTH) ? afterStrengthClamped
    : (base === "F4") ? afterStrengthClamped
    : undefined,

  xpHonor:
    (base === "F8" && kind === KIND.HONOR) ? afterHonorClamped
    : (base === "F4") ? afterHonorClamped
    : undefined,

  logId: logRef.id,
};
  });

  if (
    result.becameEligible &&
    result.parentUid
  ) {
    await sendParentSignal({
      parentUid: result.parentUid,
      athleteId: uid,
      athleteName: result.athleteName,
      type: PARENT_SIGNAL_TYPES.TESTING_ELIGIBLE,
      source: "incrementXp",
      sourceId: result.logId,
    });
  }

  return result;
});