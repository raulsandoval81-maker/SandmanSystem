// functions/src/xpEngine.ts
import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const db = getFirestore();

type Kind =
  | "ATTENDANCE"
  | "ARENA/BATTLE"
  | "ARENA/PODIUM"
  | "ARENA/STYLEIQ"
  | "STRENGTH"
  | "HONOR"
  | string;

function monthKeyFrom(ts: Timestamp) {
  // YYYY-MM
  const d = ts.toDate();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function mustString(x: any, name: string) {
  const v = String(x ?? "").trim();
  if (!v) throw new HttpsError("invalid-argument", `${name} required`);
  return v;
}

function mustNumber(x: any, name: string) {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new HttpsError("invalid-argument", `${name} must be a number`);
  return n;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// -----------------------------
// V1 caps (safe defaults)
// You can tune these later without changing the contracts.
// -----------------------------
function getMonthlyCaps(trackCode: string) {
  // HS Foundry4 Combat default:
  return {
    attendance: 200, // +10 each
    arena: 40, // battle/podium/style share the arena cap
  };
}

function isLaneKind(kind: string) {
  return kind === "STRENGTH" || kind === "HONOR";
}

function inferBase(a: any): "F4" | "F8" {
  const tb = String(a?.trackBase || "").toUpperCase();
  if (tb === "F8" || tb.includes("FOUNDRY8")) return "F8";

  // Fallback to uid prefix if present
  const id = String(a?.uid || a?.id || "").toUpperCase();
  if (id.startsWith("F8_")) return "F8";

  return "F4";
}

function allowedKind(kind: string) {
  if (kind === "ATTENDANCE") return true;
  if (kind === "ARENA/BATTLE") return true;
  if (kind === "ARENA/PODIUM") return true;
  if (kind === "ARENA/STYLEIQ") return true;

  // ✅ lanes
  if (kind === "STRENGTH") return true;
  if (kind === "HONOR") return true;

  return false;
}

function kindLane(kind: string) {
  if (kind === "STRENGTH") return "strength";
  if (kind === "HONOR") return "honor";
  if (kind.startsWith("ARENA/")) return "arena";
  return "combat";
}

function normalizeAmount(kind: string, amount: number) {
  if (kind === "ATTENDANCE") {
    if (amount !== 10 && amount !== 5) {
      throw new HttpsError("invalid-argument", "ATTENDANCE amount must be 10 or 5");
    }
    return amount;
  }
  if (kind === "ARENA/BATTLE") {
    if (amount !== 10) throw new HttpsError("invalid-argument", "ARENA/BATTLE amount must be 10");
    return amount;
  }
  if (kind === "ARENA/PODIUM") {
    if (amount !== 5) throw new HttpsError("invalid-argument", "ARENA/PODIUM amount must be 5");
    return amount;
  }
  if (kind === "ARENA/STYLEIQ") {
    if (amount !== 5) throw new HttpsError("invalid-argument", "ARENA/STYLEIQ amount must be 5");
    return amount;
  }

  // For lanes, your other engine enforces deltas by base (F8 must be +5).
  // This engine keeps amount as-is; if you want, you can enforce +5 for F8 here later.
  return amount;
}

// export a single function that receives (coachUid, payload) and returns result
export async function runIncrementXp(coachUid: string, payload: any) {
  const uid = mustString(payload?.uid, "uid"); // ✅ canonical athlete doc id
  const kind = mustString(payload?.kind, "kind") as Kind;
  const rawAmount = mustNumber(payload?.amount ?? 0, "amount");
  const meta = payload?.meta ?? {};

  if (!coachUid) throw new HttpsError("unauthenticated", "coachUid required");
  if (!allowedKind(kind)) throw new HttpsError("invalid-argument", `Unsupported kind: ${kind}`);
  if (rawAmount <= 0) throw new HttpsError("invalid-argument", "amount must be > 0");

  // canonical amounts
  const amount = normalizeAmount(kind, rawAmount);

  const now = Timestamp.now();
  const monthKey = monthKeyFrom(now);

  const athleteRef = db.doc(`athletes/${uid}`);
  const logRef = db.collection("xpLogs").doc(); // autoId ref usable inside tx

  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);
    if (!snap.exists) throw new HttpsError("not-found", `athlete not found: ${uid}`);

    const a = snap.data() || {};
    const base = inferBase(a);
    if (base === "F8" && isLaneKind(kind) && amount !== 5) {
  throw new HttpsError("invalid-argument", "F8 STRENGTH/HONOR amount must be 5");
}


    // basic athlete fields we rely on
    const xp = Number(a.xp ?? 0);
    const xpCap = Number(a.xpCap ?? 1200);
    const track = String(a.track ?? a.trackCode ?? "foundry4-combat");

    // Lane totals (F4 separate; F8 may optionally track)
    const beforeStrength = Number(a.xpStrength ?? 0);
    const beforeHonor = Number(a.xpHonor ?? 0);

    // status locks (if you already have these, keep them)
    const status = String(a.status ?? "ACTIVE");
    const lockedUntil = a.lockedUntil ? (a.lockedUntil as Timestamp) : null;

    if (status === "FROZEN") {
      throw new HttpsError("failed-precondition", "FROZEN");
    }
    if (status === "COOLDOWN" && lockedUntil && lockedUntil.toMillis() > now.toMillis()) {
      throw new HttpsError("failed-precondition", "COOLDOWN");
    }

    // monthly counters live on athlete doc (simple, fast, V1)
    // structure:
    // monthly: { "YYYY-MM": { attendance: number, arena: number } }
    const monthly = a.monthly && typeof a.monthly === "object" ? a.monthly : {};
    const m = monthly[monthKey] && typeof monthly[monthKey] === "object" ? monthly[monthKey] : {};
    const soFarAttendance = Number(m.attendance ?? 0);
    const soFarArena = Number(m.arena ?? 0);

    const caps = getMonthlyCaps(track);

    // lane caps (V1 uses the same caps struct; only attendance/arena are enforced here)
    if (kind === "ATTENDANCE") {
      if (soFarAttendance + amount > caps.attendance) {
        throw new HttpsError("failed-precondition", "MONTHLY_ATTENDANCE_CAP_REACHED");
      }
    } else if (kind.startsWith("ARENA/")) {
      if (soFarArena + amount > caps.arena) {
        throw new HttpsError("failed-precondition", "MONTHLY_ARENA_CAP_REACHED");
      }
      // V1 tournamentId required
      const tId = String(meta?.tournamentId ?? "").trim();
      if (!tId)
        throw new HttpsError("invalid-argument", "meta.tournamentId required for ARENA awards");
    }

    // ------------------------
    // APPLY XP / LANES
    // ------------------------
    const beforeXp = xp;
    const delta = amount;

    let afterXp = beforeXp;
    let afterStrength = beforeStrength;
    let afterHonor = beforeHonor;

    if (isLaneKind(kind)) {
      if (base === "F8") {
        // F8: lanes feed the ONE bar
        afterXp = clamp(beforeXp + delta, 0, xpCap);

        // optional: track lane totals if you want (keeps compatibility with your other engine)
        if (kind === "STRENGTH") afterStrength = clamp(beforeStrength + delta, 0, 2400);
        if (kind === "HONOR") afterHonor = clamp(beforeHonor + delta, 0, 2400);
      } else {
        // F4: lanes are separate — DO NOT TOUCH xp
        afterXp = beforeXp;

        if (kind === "STRENGTH") afterStrength = clamp(beforeStrength + delta, 0, 2400);
        if (kind === "HONOR") afterHonor = clamp(beforeHonor + delta, 0, 2400);
      }
    } else {
      // Combat kinds
      afterXp = clamp(beforeXp + delta, 0, xpCap);
    }

    // ------------------------
    // LOG (immutable)
    // ------------------------
tx.set(logRef, {
  createdAt: now,
  monthKey,
  uid,
  coachUid,
  kind,
  lane: kindLane(kind),
  amount: delta,
  beforeXp,
  afterXp,
  xpCap,
  track,
  base,
  ...(base === "F4" ? { xpStrength: afterStrength, xpHonor: afterHonor } : {}),
  meta: {
    ...meta,
    source: meta?.source ?? "engine",
  },
});

    // ------------------------
    // UPDATE ATHLETE DOC
    // ------------------------
    const monthPatch: any = {};
    if (kind === "ATTENDANCE") {
      monthPatch[`monthly.${monthKey}.attendance`] = FieldValue.increment(delta);
    } else if (kind.startsWith("ARENA/")) {
      monthPatch[`monthly.${monthKey}.arena`] = FieldValue.increment(delta);
    }

    const patch: any = {
      updatedAt: now,
      ...monthPatch,
    };

    // F4 lane awards should not touch xp
    if (isLaneKind(kind) && base === "F4") {
      if (kind === "STRENGTH") patch.xpStrength = afterStrength;
      if (kind === "HONOR") patch.xpHonor = afterHonor;
    } else {
      // Combat awards (and all F8 awards) write xp
      patch.xp = afterXp;
    }

    // Optional: keep lane fields updated for F8 only when used
    if (base === "F8") {
      if (kind === "STRENGTH") patch.xpStrength = afterStrength;
      if (kind === "HONOR") patch.xpHonor = afterHonor;
    }

    tx.set(athleteRef, patch, { merge: true });

    return {
      ok: true,
      uid,
      kind,
      delta,
      beforeXp,
      afterXp,
      monthKey,
      logId: logRef.id,
      base,
      xpStrength: base === "F4" ? afterStrength : kind === "STRENGTH" ? afterStrength : undefined,
      xpHonor: base === "F4" ? afterHonor : kind === "HONOR" ? afterHonor : undefined,
    };
  });

  return out;
}
