import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";

import {
  createTestingEvent
} from "./testing-events/createTestingEvent";

import {
  createParentSignal,
  PARENT_SIGNAL_TYPES
} from "./parent/createParentSignal";

import {
  RANK_META,
  Base,
  ProgramKind
} from "./promotion/rankMeta";

const XP = Object.freeze({
  F4: {
    tierCaps: {
      T0: 1000,
      T1: 1600,
      T2: 2000,
      T3: 2400,
      T4: 3000,
    },
    tiers: ["T0", "T1", "T2", "T3", "T4"],
  },

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
    tiers: ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"],
  },
} as const);


function normalizeBaseFromAthlete(a: any): Base {
  const raw = String(
    a?.trackBase ||
    a?.track ||
    a?.trackCode ||
    a?.programCode ||
    a?.program ||
    a?.base ||
    ""
  ).toUpperCase();

  if (
    raw.startsWith("F8") ||
    raw.includes("FOUNDRY8") ||
    raw.includes("YOUTH") ||
    raw.includes("ZERO") ||
    raw.includes("Z2H")
  ) {
    return "F8";
  }

  return "F4";
}

function normalizeProgramKind(a: any): ProgramKind {
  const raw = String(
    a?.programKind ||
    a?.trackCode ||
    a?.track ||
    a?.programCode ||
    a?.program ||
    ""
  ).toLowerCase();

  if (
    raw.includes("zero-to-hero") ||
    raw.includes("zero2hero") ||
    raw.includes("z2h") ||
    raw.includes("youth") ||
    raw.includes("foundry8")
  ) {
    return "youth";
  }

  if (
    raw.includes("road-to-greatness") ||
    raw.includes("roadtogreatness") ||
    raw.includes("r2g") ||
    raw.includes("boxing")
  ) {
    return "boxing";
  }

  if (
    raw.includes("quest-for-mastery") ||
    raw.includes("questformastery") ||
    raw.includes("q2m") ||
    raw.includes("mma")
  ) {
    return "mma";
  }

  return "wrestling";
}

function normalizeTier(a: any): string {
  if (typeof a?.tier === "string" && a.tier.startsWith("T")) {
    return a.tier;
  }

  if (typeof a?.tier === "number") {
    return `T${a.tier}`;
  }

  if (typeof a?.rank === "string" && a.rank.startsWith("T")) {
    return a.rank;
  }

  return "T0";
}

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function stripeCountFromXp(xp: number, cap: number) {
  if (!cap || cap <= 0) return 0;
  return Math.max(
    0,
    Math.min(4, Math.floor(xp / (cap / 4)))
  );
}

const retiredLegacyPromoteTier = onCall(async (req) => {
  const db = getFirestore();

  const payload = req.data || {};
  const uid = String(payload.uid || "").trim();
  const score = Number(payload.score || 0);

  const note =
    typeof payload.note === "string"
      ? payload.note.trim()
      : "";

  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid");
  }

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new HttpsError("invalid-argument", "Invalid score");
  }

  if (score < 85) {
    throw new HttpsError(
      "failed-precondition",
      "Score must be 85 or higher to promote."
    );
  }

  const athleteRef = db.collection("athletes").doc(uid);
  const mKey = monthKey();
  const logRef = db.collection("xp_logs").doc();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(athleteRef);

    if (!snap.exists) {
      throw new HttpsError(
        "not-found",
        `Athlete not found: ${uid}`
      );
    }

    const athlete = snap.data() || {};
    const testingState = String(athlete?.testing?.state || "");

    if (testingState !== "TESTING") {
      throw new HttpsError(
        "failed-precondition",
        `Athlete must be TESTING before promotion. Current state: ${testingState}`
      );
    }

    const base = normalizeBaseFromAthlete(athlete);
    const programKind = normalizeProgramKind(athlete);
    const tier = normalizeTier(athlete);

    const tiers = XP[base].tiers as unknown as string[];
    const caps = XP[base].tierCaps as unknown as Record<string, number>;

    const idx = tiers.indexOf(tier);

    if (idx < 0) {
      throw new HttpsError(
        "failed-precondition",
        `Unknown tier: ${tier}`
      );
    }

    if (idx >= tiers.length - 1) {
      return {
        ok: true,
        blocked: true,
        reason: "MAX_TIER_REACHED",
        uid,
        base,
        programKind,
        tier,
      };
    }

    const cap = Number(caps[tier] ?? 0);
    const beforeXp = Number(athlete.xp ?? 0);

    if (beforeXp < cap) {
      return {
        ok: true,
        blocked: true,
        reason: "NOT_READY",
        uid,
        base,
        programKind,
        tier,
        beforeXp,
        cap,
      };
    }

    const nextTier = tiers[idx + 1];
    const nextCap = Number(caps[nextTier] ?? 0);

    if (!nextCap) {
      throw new HttpsError(
        "failed-precondition",
        `Missing cap for ${base} ${nextTier}`
      );
    }

    const cooldownUntil = new Date();
    cooldownUntil.setDate(cooldownUntil.getDate() + 5);

    const legacyTotal = Number(athlete.legacyCreditTotal || 0);
    const legacyIssued = Number(athlete.legacyCreditIssued || 0);

    const canReleaseLegacy =
      tier === "T0" &&
      nextTier === "T1" &&
      athlete.legacyHold === true &&
      athlete.legacyCreditSchedule === "deferred_t1_entry";

    const releasedLegacyXp = canReleaseLegacy
      ? Math.max(0, legacyTotal - legacyIssued)
      : 0;

    const afterXp = releasedLegacyXp;
    const stripeCount = stripeCountFromXp(afterXp, nextCap);

    const nextRank =
      RANK_META[programKind]?.[base]?.[nextTier] || {
        rankName: nextTier,
        rankColor: "",
      };

    const updatePayload: Record<string, any> = {
      tier: nextTier,
      rankName: nextRank.rankName,
      rankColor: nextRank.rankColor,

      xp: afterXp,
      xpCap: nextCap,
      stripeCount,
      trackBase: base,
      programKind,

      tierStatus: "cooldown",
      promotionLocked: true,

      "testing.state": "COOLDOWN",
      "testing.lastTestResult": "PASS",
      "testing.lastTestScore": score,
      "testing.passingScore": 85,
      "testing.cooldownUntil": cooldownUntil,
      "testing.freezeUntil": null,
      "testing.testingStartedAt": null,
      "testing.coachReady": false,
      "testing.coachReadyAt": null,
      "testing.scheduledDate": null,
      "testing.scheduledAt": null,
      "testing.scheduledBy": null,

      "testing.promotedFrom": tier,
      "testing.promotedTo": nextTier,
      "testing.promotedAt": FieldValue.serverTimestamp(),

      updatedAt: FieldValue.serverTimestamp(),
    };

    if (canReleaseLegacy) {
      updatePayload.legacyHold = false;
      updatePayload.legacyCreditIssued =
        legacyIssued + releasedLegacyXp;
    }

    tx.update(athleteRef, updatePayload);

    tx.set(logRef, {
      uid,
      kind: "PROMOTION",
      amount: afterXp,
      note:
        note ||
        `Passed test with ${score}%. Promoted ${tier} → ${nextTier}`,
      meta: {
        fromTier: tier,
        toTier: nextTier,
        score,
        passingScore: 85,
        releasedLegacyXp,
      },
      base,
      programKind,
      tier: nextTier,
      beforeXp,
      afterXp,
      cap: nextCap,
      month: mKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      blocked: false,
      uid,
      base,
      programKind,
      fromTier: tier,
      toTier: nextTier,
      beforeXp,
      afterXp,
      cap: nextCap,
      score,
      cooldownUntil: cooldownUntil.toISOString(),
      logId: logRef.id,
      parentUid: athlete.parentUid ?? null,
      publicName:
        athlete.publicName ??
        athlete.fullName ??
        null,
    };
  });

  if (result.ok && !result.blocked) {
    await createTestingEvent({
      uid: result.uid,
      type: "TEST_PASSED",
      score: result.score,
      tier: result.fromTier,
      parentUid: result.parentUid ?? null,
      publicName: result.publicName ?? null,
    });

    await createTestingEvent({
      uid: result.uid,
      type: "PROMOTED",
      score: result.score,
      tier: result.fromTier,
      nextTier: result.toTier,
      parentUid: result.parentUid ?? null,
      publicName: result.publicName ?? null,
    });

    await createParentSignal({
      athleteId: result.uid,
      athleteName: result.publicName ?? result.uid,
      type: PARENT_SIGNAL_TYPES.TEST_PASSED,
      source: "promoteTier",
      sourceId: result.logId,
    });

    await createParentSignal({
      athleteId: result.uid,
      athleteName: result.publicName ?? result.uid,
      type: PARENT_SIGNAL_TYPES.COOLDOWN_STARTED,
      source: "promoteTier",
      sourceId: result.logId,
    });

    await createParentSignal({
      athleteId: result.uid,
      athleteName: result.publicName ?? result.uid,
      type: PARENT_SIGNAL_TYPES.PROMOTED,
      nextTier: result.toTier,
      source: "promoteTier",
      sourceId: result.logId,
    });
  }

  return result;
});

void retiredLegacyPromoteTier;
export { promoteTier } from "./promotion/promoteTierAction";
