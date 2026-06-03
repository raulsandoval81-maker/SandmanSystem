// functions/src/xpEngine.ts
import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

function xpCapForAthlete(a: any): number {
  const tier = String(a?.tier || "T0").toUpperCase();

  const F4_CAPS: Record<string, number> = {
    T0: 1200,
    T1: 1600,
    T2: 2000,
    T3: 2400,
    T4: 2800,
  };

  const F8_CAPS: Record<string, number> = {
    T0: 800,
    T1: 1000,
    T2: 1200,
    T3: 1400,
    T4: 1600,
    T5: 1800,
    T6: 2000,
    T7: 2400,
  };

  const id = String(a?.uid || a?.id || "").toUpperCase();
  const base = id.startsWith("F8_") ? "F8" : "F4";

  return Number(
    a?.xpCap ||
    (base === "F8" ? F8_CAPS[tier] : F4_CAPS[tier]) ||
    1200
  );
}

const db = getFirestore();

type Kind =
  | "ATTENDANCE"
  | "ARENA/BATTLE"
  | "ARENA/PODIUM"
  | "ARENA/STYLEIQ"
  | "ARENA/EXTRA"
  | "STRENGTH"
  | "HONOR"
  | string;

function monthKeyFrom(ts: Timestamp) {
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
  if (!Number.isFinite(n)) {
    throw new HttpsError("invalid-argument", `${name} must be a number`);
  }
  return n;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function getMonthlyCaps(trackCode: string) {
  void trackCode;
  return {
    attendance: 200,
    arena: 40,
  };
}

function isLaneKind(kind: string) {
  return kind === "STRENGTH" || kind === "HONOR";
}

function inferBase(a: any): "F4" | "F8" {
  const tb = String(a?.trackBase || "").toUpperCase();
  if (tb === "F8" || tb.includes("FOUNDRY8")) return "F8";

  const id = String(a?.uid || a?.id || "").toUpperCase();
  if (id.startsWith("F8_")) return "F8";

  return "F4";
}

function allowedKind(kind: string) {
  if (kind === "ATTENDANCE") return true;
  if (kind === "ARENA/BATTLE") return true;
  if (kind === "ARENA/PODIUM") return true;
  if (kind === "ARENA/STYLEIQ") return true;
  if (kind === "ARENA/EXTRA") return true;
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

/* ------------------------
   Pacific day helpers
------------------------- */
function getPacificDateParts(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: String(map.weekday || ""),
  };
}

function getPacificDayKey(d: Date = new Date()) {
  const { year, month, day } = getPacificDateParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getPacificWeekday(d: Date = new Date()) {
  return getPacificDateParts(d).weekday;
}

function getPacificDayKeyFromTimestamp(ts: Timestamp) {
  return getPacificDayKey(ts.toDate());
}

/* ------------------------
   Amount validation
------------------------- */
function normalizeAmount(kind: string, amount: number) {
  if (kind === "ATTENDANCE") {
    if (amount !== 10 && amount !== 5) {
      throw new HttpsError("invalid-argument", "ATTENDANCE amount must be 10 or 5");
    }
    return amount;
  }

  if (kind === "ARENA/BATTLE") {
    if (amount !== 10) {
      throw new HttpsError("invalid-argument", "ARENA/BATTLE amount must be 10");
    }
    return amount;
  }

  if (kind === "ARENA/PODIUM") {
    if (amount !== 5) {
      throw new HttpsError("invalid-argument", "ARENA/PODIUM amount must be 5");
    }
    return amount;
  }

  if (kind === "ARENA/STYLEIQ") {
    if (amount !== 5) {
      throw new HttpsError("invalid-argument", "ARENA/STYLEIQ amount must be 5");
    }
    return amount;
  }

  if (kind === "ARENA/EXTRA") {
    if (amount !== 5) {
      throw new HttpsError("invalid-argument", "ARENA/EXTRA amount must be 5");
    }
    return amount;
  }

  return amount;
}

export async function runIncrementXp(coachUid: string, payload: any) {
  const uid = mustString(payload?.uid, "uid");
  const kind = mustString(payload?.kind, "kind") as Kind;
  const rawAmount = mustNumber(payload?.amount ?? 0, "amount");
  const meta = payload?.meta ?? {};

  if (!coachUid) {
    throw new HttpsError("unauthenticated", "coachUid required");
  }
  if (!allowedKind(kind)) {
    throw new HttpsError("invalid-argument", `Unsupported kind: ${kind}`);
  }
  if (rawAmount <= 0) {
    throw new HttpsError("invalid-argument", "amount must be > 0");
  }

  const amount = normalizeAmount(kind, rawAmount);
  const now = Timestamp.now();
  const monthKey = monthKeyFrom(now);

  const athleteRef = db.doc(`athletes/${uid}`);
  const logRef = db.collection("xpLogs").doc();

  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `athlete not found: ${uid}`);
    }

    const a = snap.data() || {};
    const base = inferBase(a);

    const testing = a.testing || {};
    const testingState = String(testing.state || "").toUpperCase();

    const cooldownUntil = testing.cooldownUntil || null;
    const freezeUntil = testing.freezeUntil || null;

    const cooldownMs =
      cooldownUntil && typeof cooldownUntil.toDate === "function"
        ? cooldownUntil.toDate().getTime()
        : 0;

    const freezeMs =
      freezeUntil && typeof freezeUntil.toDate === "function"
        ? freezeUntil.toDate().getTime()
        : 0;

    const nowMs = now.toDate().getTime();

    const inCooldown = testingState === "COOLDOWN" && cooldownMs > nowMs;
    const inFreeze = testingState === "FREEZE" && freezeMs > nowMs;

    if (inCooldown) {
      return {
        ok: true,
        blocked: true,
        reason: "COOLDOWN_ACTIVE",
        uid,
        base,
        testingState,
        cooldownUntil,
      };
    }

    if (inFreeze) {
      return {
        ok: true,
        blocked: true,
        reason: "FREEZE_ACTIVE",
        uid,
        base,
        testingState,
        freezeUntil,
      };
    }

        // ------------------------
    // ARENA ENFORCEMENT (EVENT-BASED)
    // Battle: +10, max 1/day
    // Podium: +5, max 1/day
    // Extra: +5, max 1/day
    // Style: +5 each, max 2/event
    // ------------------------
    if (kind.startsWith("ARENA/")) {
      const eventId = String(meta?.tournamentId ?? "").trim();
      if (!eventId) {
        throw new HttpsError("invalid-argument", "meta.tournamentId required for ARENA awards");
      }

      const todayDayKey = getPacificDayKey(now.toDate());

      const todayArenaSnap = await tx.get(
        db.collection("xpLogs")
          .where("uid", "==", uid)
      );

      let battleCount = 0;
      let podiumCount = 0;
      let extraCount = 0;

      todayArenaSnap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const createdAt = d.createdAt as Timestamp | undefined;
        if (!createdAt) return;

        const logDayKey = getPacificDayKey(createdAt.toDate());
        if (logDayKey !== todayDayKey) return;

        const k = String(d.kind || "");

        if (k === "ARENA/BATTLE") battleCount += 1;
        if (k === "ARENA/PODIUM") podiumCount += 1;
        if (k === "ARENA/EXTRA") extraCount += 1;
      });

      if (kind === "ARENA/BATTLE" && battleCount >= 1) {
        return {
          ok: true,
          blocked: true,
          reason: "ARENA_BATTLE_LIMIT",
          uid,
          eventId,
          battleCount,
        };
      }

      if (kind === "ARENA/PODIUM" && podiumCount >= 1) {
        return {
          ok: true,
          blocked: true,
          reason: "ARENA_PODIUM_LIMIT",
          uid,
          eventId,
          podiumCount,
        };
      }

      if (kind === "ARENA/EXTRA" && extraCount >= 1) {
        return {
          ok: true,
          blocked: true,
          reason: "ARENA_EXTRA_LIMIT",
          uid,
          eventId,
          extraCount,
        };
      }

      if (kind === "ARENA/STYLEIQ") {
        const eventStyleSnap = await tx.get(
          db.collection("xpLogs")
            .where("uid", "==", uid)
            .where("kind", "==", "ARENA/STYLEIQ")
            .where("meta.tournamentId", "==", eventId)
        );

        let styleCount = 0;
        eventStyleSnap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const createdAt = d.createdAt as Timestamp | undefined;
          if (!createdAt) return;

          const logDayKey = getPacificDayKey(createdAt.toDate());
          if (logDayKey !== todayDayKey) return;

          styleCount += 1;
        });

        if (styleCount >= 2) {
          return {
            ok: true,
            blocked: true,
            reason: "ARENA_STYLE_EVENT_LIMIT",
            uid,
            eventId,
            styleCount,
          };
        }
      }
    }


    // ------------------------
    // DAILY GRIND ENFORCEMENT
    // Mon–Sat only
    // max 2 ATTENDANCE presses/day
    // max 15 ATTENDANCE XP/day
    // Pacific-local day
    // ------------------------
    if (kind === "ATTENDANCE") {
      const pacificWeekday = getPacificWeekday(now.toDate());

      if (pacificWeekday === "Sun") {
        return {
          ok: true,
          blocked: true,
          reason: "ATTENDANCE_BLOCKED_SUNDAY",
          uid,
          base,
          weekday: pacificWeekday,
        };
      }

      const todayDayKey = getPacificDayKeyFromTimestamp(now);

      const todayLogsSnap = await tx.get(
        db.collection("xpLogs")
          .where("uid", "==", uid)
          .where("kind", "==", "ATTENDANCE")
      );

      let dailyPressCount = 0;
      let dailyXpTotal = 0;

      todayLogsSnap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const createdAt = d.createdAt as Timestamp | undefined;
        if (!createdAt) return;

        const logDayKey = getPacificDayKeyFromTimestamp(createdAt);
        if (logDayKey !== todayDayKey) return;

        dailyPressCount += 1;
        dailyXpTotal += Number(d.amount ?? d.delta ?? 0);
      });

      if (dailyPressCount >= 2) {
        return {
          ok: true,
          blocked: true,
          reason: "DAILY_GRIND_PRESS_LIMIT",
          uid,
          base,
          dailyPressCount,
          dailyXpTotal,
          weekday: pacificWeekday,
        };
      }

      if (dailyXpTotal + amount > 15) {
        return {
          ok: true,
          blocked: true,
          reason: "DAILY_GRIND_XP_LIMIT",
          uid,
          base,
          dailyPressCount,
          dailyXpTotal,
          attemptedAmount: amount,
          weekday: pacificWeekday,
        };
      }
    }

    if (base === "F8" && isLaneKind(kind) && amount !== 5) {
      throw new HttpsError("invalid-argument", "F8 STRENGTH/HONOR amount must be 5");
    }

    const xp = Number(a.xp ?? 0);

    const xpCap = xpCapForAthlete(a);
    const track = String(a.track ?? a.trackCode ?? "foundry4-combat");

    const beforeStrength = Number(a.xpStrength ?? 0);
    const beforeHonor = Number(a.xpHonor ?? 0);

    const status = String(a.status ?? "ACTIVE");
    const lockedUntil = a.lockedUntil ? (a.lockedUntil as Timestamp) : null;

    if (status === "FROZEN") {
      throw new HttpsError("failed-precondition", "FROZEN");
    }
    if (status === "COOLDOWN" && lockedUntil && lockedUntil.toMillis() > now.toMillis()) {
      throw new HttpsError("failed-precondition", "COOLDOWN");
    }

    const monthly = a.monthly && typeof a.monthly === "object" ? a.monthly : {};
    const m =
      monthly[monthKey] && typeof monthly[monthKey] === "object" ? monthly[monthKey] : {};
    const soFarAttendance = Number(m.attendance ?? 0);
    const soFarArena = Number(m.arena ?? 0);

    const caps = getMonthlyCaps(track);

    if (kind === "ATTENDANCE") {
      if (soFarAttendance + amount > caps.attendance) {
        throw new HttpsError("failed-precondition", "MONTHLY_ATTENDANCE_CAP_REACHED");
      }
    } else if (kind.startsWith("ARENA/")) {
      if (soFarArena + amount > caps.arena) {
        throw new HttpsError("failed-precondition", "MONTHLY_ARENA_CAP_REACHED");
      }

      const tId = String(meta?.tournamentId ?? "").trim();
      if (!tId) {
        throw new HttpsError("invalid-argument", "meta.tournamentId required for ARENA awards");
      }
    }

    const beforeXp = xp;
    const delta = amount;

    let afterXp = beforeXp;
    let afterStrength = beforeStrength;
    let afterHonor = beforeHonor;

    if (isLaneKind(kind)) {
      if (base === "F8") {
        afterXp = clamp(beforeXp + delta, 0, xpCap);

        if (kind === "STRENGTH") afterStrength = clamp(beforeStrength + delta, 0, 2400);
        if (kind === "HONOR") afterHonor = clamp(beforeHonor + delta, 0, 2400);
      } else {
        afterXp = beforeXp;

        if (kind === "STRENGTH") afterStrength = clamp(beforeStrength + delta, 0, 2400);
        if (kind === "HONOR") afterHonor = clamp(beforeHonor + delta, 0, 2400);
      }
    } else {
      afterXp = clamp(beforeXp + delta, 0, xpCap);
    }

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

    const monthPatch: Record<string, any> = {};
    if (kind === "ATTENDANCE") {
      monthPatch[`monthly.${monthKey}.attendance`] = FieldValue.increment(delta);
    } else if (kind.startsWith("ARENA/")) {
      monthPatch[`monthly.${monthKey}.arena`] = FieldValue.increment(delta);
    }

    const patch: Record<string, any> = {
      updatedAt: now,
      ...monthPatch,
    };

    // AUTO TESTING STAGE (FINAL — CORRECT FOR YOUR SCHEMA)
    const ratio = xpCap > 0 ? afterXp / xpCap : 0;
    const currentState = String(a?.testing?.state || "ACTIVE");

    let nextState: string | null = null;
    if (currentState === "ACTIVE" || currentState === "TEMPLE") {
      if (ratio >= 1) {
        nextState = "ELIGIBLE";
      } else if (ratio >= 0.9 && currentState === "ACTIVE") {
        nextState = "TEMPLE";
      }
    }

    if (isLaneKind(kind) && base === "F4") {
      if (kind === "STRENGTH") patch.xpStrength = afterStrength;
      if (kind === "HONOR") patch.xpHonor = afterHonor;
    } else {
      patch.xp = afterXp;
    }

    if (base === "F8") {
      if (kind === "STRENGTH") patch.xpStrength = afterStrength;
      if (kind === "HONOR") patch.xpHonor = afterHonor;
    }

    tx.set(athleteRef, patch, { merge: true });

    if (nextState) {
      const testingPatch: Record<string, any> = {
        "testing.state": nextState,
        tierStatus: nextState.toLowerCase(),
      };

      if (nextState === "TEMPLE") {
        testingPatch["testing.templeEnteredAt"] = now;
      }

      if (nextState === "ELIGIBLE") {
        testingPatch["testing.testEligibleAt"] = now;
      }

      tx.update(athleteRef, testingPatch);
    }

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
      xpStrength:
        base === "F4"
          ? afterStrength
          : kind === "STRENGTH"
            ? afterStrength
            : undefined,
      xpHonor:
        base === "F4"
          ? afterHonor
          : kind === "HONOR"
            ? afterHonor
            : undefined,
      autoStageDebug: {
        xpCap,
        afterXp,
        ratio,
        currentState,
        nextState,
      },
    };
  });

  return out;
}