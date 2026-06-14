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
type Base = "F4" | "F8";

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
  const raw =
    String(
      a?.trackBase ||
      a?.track ||
      a?.program ||
      a?.base ||
      ""
    ).toUpperCase();

  if (
    raw.startsWith("F8") ||
    raw.includes("FOUNDRY8") ||
    raw.includes("YOUTH")
  ) {
    return "F8";
  }

  return "F4";
}

function normalizeTier(a: any): string {
  if (
    typeof a?.tier === "string" &&
    a.tier.startsWith("T")
  ) {
    return a.tier;
  }

  if (typeof a?.tier === "number") {
    return `T${a.tier}`;
  }

  if (
    typeof a?.rank === "string" &&
    a.rank.startsWith("T")
  ) {
    return a.rank;
  }

  return "T0";
}

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m =
    String(d.getMonth() + 1).padStart(2, "0");

  return `${y}-${m}`;
}

export const promoteTier = onCall(async (req) => {
  const db = getFirestore();

  const payload =
    req.data || {};

  const uid =
    String(payload.uid || "").trim();

  const score =
    Number(payload.score || 0);

  const note =
    typeof payload.note === "string"
      ? payload.note.trim()
      : "";

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "Missing uid"
    );
  }

  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid score"
    );
  }

  if (score < 85) {
    throw new HttpsError(
      "failed-precondition",
      "Score must be 85 or higher to promote."
    );
  }

  const athleteRef =
    db.collection("athletes").doc(uid);

  const mKey =
    monthKey();

  const logRef =
    db.collection("xp_logs").doc();

  const result =
    await db.runTransaction(async (tx) => {
      const snap =
        await tx.get(athleteRef);

      if (!snap.exists) {
        throw new HttpsError(
          "not-found",
          `Athlete not found: ${uid}`
        );
      }

      const athlete =
        snap.data() || {};

      const testingState =
        String(athlete?.testing?.state || "");

      if (testingState !== "TESTING") {
        throw new HttpsError(
          "failed-precondition",
          `Athlete must be TESTING before promotion. Current state: ${testingState}`
        );
      }

      const base =
        normalizeBaseFromAthlete(athlete);

      const tier =
        normalizeTier(athlete);

      const tiers =
        XP[base].tiers as unknown as string[];

      const caps =
        XP[base].tierCaps as unknown as Record<
          string,
          number
        >;

      const idx =
        tiers.indexOf(tier);

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
          tier,
        };
      }

      const cap =
        Number(caps[tier] ?? 0);

      const beforeXp =
        Number(athlete.xp ?? 0);

      if (beforeXp < cap) {
        return {
          ok: true,
          blocked: true,
          reason: "NOT_READY",
          uid,
          base,
          tier,
          beforeXp,
          cap,
        };
      }

      const nextTier =
        tiers[idx + 1];

      const nextCap =
        Number(caps[nextTier] ?? 0);

      if (!nextCap) {
        throw new HttpsError(
          "failed-precondition",
          `Missing cap for ${base} ${nextTier}`
        );
      }

      const cooldownUntil =
        new Date();

      cooldownUntil.setDate(
        cooldownUntil.getDate() + 5
      );

      tx.update(athleteRef, {
        tier: nextTier,
        xp: 0,
        xpCap: nextCap,
        stripeCount: 0,
        trackBase: base,

        tierStatus: "cooldown",
        promotionLocked: false,

        "testing.state": "COOLDOWN",
        "testing.lastTestResult": "pass",
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
        "testing.promotedAt":
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      tx.set(logRef, {
        uid,
        kind: "PROMOTION",
        amount: 0,
        note:
          note ||
          `Passed test with ${score}%. Promoted ${tier} → ${nextTier}`,
        meta: {
          fromTier: tier,
          toTier: nextTier,
          score,
          passingScore: 85,
        },
        base,
        tier: nextTier,
        beforeXp,
        afterXp: 0,
        cap: nextCap,
        month: mKey,
        createdAt:
          FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        blocked: false,
        uid,
        base,
        fromTier: tier,
        toTier: nextTier,
        beforeXp,
        afterXp: 0,
        cap: nextCap,
        score,
        cooldownUntil:
          cooldownUntil.toISOString(),
        logId: logRef.id,
        parentUid:
          athlete.parentUid ?? null,
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

  });