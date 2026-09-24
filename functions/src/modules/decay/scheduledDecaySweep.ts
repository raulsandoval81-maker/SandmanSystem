/**
 * Sandman Combat Decay Engine
 *
 * PURPOSE
 * -------
 * Maintains combat readiness through inactivity decay.
 *
 * RULES
 * -----
 * Day 14  -> Warning
 * Day 28  -> -25 XP
 * Day 35  -> -25 XP
 * Every 14 days thereafter -> -25 XP
 * Maximum Decay -> 150 XP
 *
 * Recovery
 * --------
 * Two separate verified combat attendance days
 * stop decay and reset inactivity.
 *
 * Decay never demotes earned tiers.
 * XP never falls below zero.
 */

import { createHash } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  DocumentReference,
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {
  calculateDecay,
  decayHitDueAt,
} from "./decayEngine";
import { resolveDecayActivityAnchor } from "./decayRelaunchPolicy";
import {
  hasCanonicalRecoveryEvidence,
  RECOVERY_DAYS_REQUIRED,
} from "./decayRecoveryPolicy";
import {
  resolveDisciplineXpAuthority,
} from "../../management/disciplineXpAuthority";
import {
  classifyAthlete,
} from "../../services/authoritativeXpService";
import {
  createParentSignal,
  PARENT_SIGNAL_TYPES,
} from "../parent/createParentSignal";

const DK_HIT = 25;
const DK_MAX = 150;

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function athleteName(athlete: any, athleteId: string): string {
  return clean(
    athlete?.publicName ||
    athlete?.fullName ||
    athlete?.name ||
    athleteId
  );
}

function primaryDiscipline(athlete: any): string {
  return clean(
    athlete?.primaryDiscipline ||
    athlete?.activeDiscipline ||
    athlete?.discipline ||
    athlete?.art ||
    athlete?.sport
  ).toLowerCase();
}

function receiptId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

type DecaySignal = {
  type:
    | typeof PARENT_SIGNAL_TYPES.DECAY_WARNING
    | typeof PARENT_SIGNAL_TYPES.DECAY_POINTS
    | typeof PARENT_SIGNAL_TYPES.PROGRAM_FROZEN;
  sourceId: string;
  note: string;
  meta: Record<string, unknown>;
};

type SweepResult = {
  uid: string;
  action: string;
  signal?: DecaySignal;
  [key: string]: unknown;
};

function decayXpPatch(
  athlete: any,
  athleteId: string,
  deduction: number
): { patch: Record<string, number>; beforeXp: number; afterXp: number } {
  const base = classifyAthlete(athlete, athleteId);

  if (base === "F8") {
    const beforeXp = Number(athlete?.xp);
    if (!Number.isFinite(beforeXp) || beforeXp < 0) {
      throw new Error("INVALID_ACTIVE_XP");
    }
    const afterXp = Math.max(0, beforeXp - deduction);
    return { patch: { xp: afterXp }, beforeXp, afterXp };
  }

  const primary = primaryDiscipline(athlete);
  if (!primary) {
    throw new Error("PRIMARY_DISCIPLINE_REQUIRED");
  }

  const authority = resolveDisciplineXpAuthority(athlete, primary);
  if (!authority.isPrimary) {
    throw new Error("PRIMARY_DISCIPLINE_AUTHORITY_MISMATCH");
  }

  const beforeXp = authority.authoritativeBeforeXp;
  const afterXp = Math.max(0, beforeXp - deduction);
  const patch = Object.fromEntries(
    authority.xpWriteTargets.map((field) => [field, afterXp])
  );

  return { patch, beforeXp, afterXp };
}

async function emitDecaySignal(
  athleteId: string,
  name: string,
  signal: DecaySignal
) {
  return createParentSignal({
    athleteId,
    athleteName: name,
    type: signal.type,
    source: "scheduled_decay_sweep",
    sourceId: signal.sourceId,
    idempotencyKey: signal.sourceId,
    note: signal.note,
    meta: signal.meta,
  });
}

async function evaluateAthlete(
  ref: DocumentReference,
  now: Date
): Promise<SweepResult> {
  const db = getFirestore();
  const athleteId = ref.id;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { uid: athleteId, action: "SKIPPED_MISSING" };
    }

    const athlete = snap.data() || {};
    const decay = athlete.decay || {};
    const currentState = clean(decay.state).toUpperCase() || "CLEAR";

    const lastActivityAt = resolveDecayActivityAnchor(athlete);
    if (!lastActivityAt) {
      return { uid: athleteId, action: "SKIPPED_RELAUNCH_REQUIRED" };
    }

    if (currentState === "FROZEN") {
      return { uid: athleteId, action: "SKIPPED_FROZEN" };
    }

    if (
      currentState === "DECAY_ACTIVE" &&
      hasCanonicalRecoveryEvidence(decay)
    ) {
      tx.update(ref, {
        "decay.state": "CLEAR",
        "decay.clearedAt": FieldValue.serverTimestamp(),
        "decay.nextHitAt": null,
        "decay.recoveryDaysCompleted": RECOVERY_DAYS_REQUIRED,
        "decay.resolutionStatus": "RECOVERY_REQUIREMENT_COMPLETED",
        "decay.resolutionReason":
          "Recovered after 2 verified combat practices; historical decay retained.",
        "decay.lastUpdatedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { uid: athleteId, action: "CLEARED_RECOVERED" };
    }

    const calculated = calculateDecay(lastActivityAt, now);

    if (calculated.state === "CLEAR") {
      if (currentState === "CLEAR") {
        return { uid: athleteId, action: "SKIPPED_CLEAR" };
      }
      tx.update(ref, {
        "decay.state": "CLEAR",
        "decay.nextHitAt": null,
        "decay.lastUpdatedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { uid: athleteId, action: "CLEAR" };
    }

    if (calculated.state === "WARNING") {
      if (currentState === "WARNING") {
        return { uid: athleteId, action: "SKIPPED_WARNING_EXISTS" };
      }

      const transitionId = receiptId([
        "decay-warning",
        athleteId,
        String(lastActivityAt.getTime()),
      ]);
      const transitionRef = db
        .collection("decayTransitionReceipts")
        .doc(transitionId);
      if ((await tx.get(transitionRef)).exists) {
        return { uid: athleteId, action: "SKIPPED_WARNING_RECEIPTED" };
      }

      tx.update(ref, {
        "decay.state": "WARNING",
        "decay.warningAt": FieldValue.serverTimestamp(),
        "decay.recoveryDaysRequired": RECOVERY_DAYS_REQUIRED,
        "decay.lastUpdatedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(transitionRef, {
        athleteId,
        type: "DECAY_WARNING",
        lastActivityAt: Timestamp.fromDate(lastActivityAt),
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        uid: athleteId,
        action: "WARNING",
        signal: {
          type: PARENT_SIGNAL_TYPES.DECAY_WARNING,
          sourceId: transitionId,
          note: calculated.message,
          meta: { daysInactive: calculated.daysInactive },
        },
      };
    }

    const completedHits = Math.max(0, Number(decay.hits || 0));
    const persistedDueAt = toDate(decay.nextHitAt);
    const dueAt =
      persistedDueAt ||
      decayHitDueAt(lastActivityAt, completedHits);

    if (!dueAt) {
      return { uid: athleteId, action: "SKIPPED_NO_DUE_DATE" };
    }

    if (dueAt > now) {
      if (
        currentState !== "DECAY_ACTIVE" ||
        !persistedDueAt
      ) {
        tx.update(ref, {
          "decay.state": "DECAY_ACTIVE",
          "decay.startedAt":
            decay.startedAt || FieldValue.serverTimestamp(),
          "decay.nextHitAt": Timestamp.fromDate(dueAt),
          "decay.recoveryDaysRequired": RECOVERY_DAYS_REQUIRED,
          "decay.recoveryDaysCompleted": Number(
            decay.recoveryDaysCompleted || 0
          ),
          "decay.recoveryLog": Array.isArray(decay.recoveryLog)
            ? decay.recoveryLog
            : [],
          "decay.lastUpdatedAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { uid: athleteId, action: "DECAY_ACTIVE" };
      }
      return { uid: athleteId, action: "SKIPPED_NOT_DUE" };
    }

    if (currentState === "CLEAR" && hasCanonicalRecoveryEvidence(decay)) {
      return { uid: athleteId, action: "SKIPPED_RECOVERED" };
    }

    const dueMillis = dueAt.getTime();
    const hitReceiptId = receiptId([
      "decay-hit",
      athleteId,
      String(dueMillis),
    ]);
    const hitReceiptRef = db
      .collection("decayHitReceipts")
      .doc(hitReceiptId);
    if ((await tx.get(hitReceiptRef)).exists) {
      return { uid: athleteId, action: "SKIPPED_HIT_RECEIPTED" };
    }

    let authority;
    try {
      authority = decayXpPatch(athlete, athleteId, DK_HIT);
    } catch (error: unknown) {
      return {
        uid: athleteId,
        action: "SKIPPED_XP_AUTHORITY",
        reason: error instanceof Error ? error.message : "UNKNOWN_AUTHORITY",
      };
    }

    const nextPoints = Math.min(
      Number(decay.points || 0) + DK_HIT,
      DK_MAX
    );
    const nextHits = completedHits + 1;
    const frozen = nextPoints >= DK_MAX;
    const nextDueAt = frozen
      ? null
      : decayHitDueAt(lastActivityAt, nextHits);

    tx.update(ref, {
      ...authority.patch,
      "decay.state": frozen ? "FROZEN" : "DECAY_ACTIVE",
      "decay.points": nextPoints,
      "decay.hits": nextHits,
      "decay.startedAt":
        decay.startedAt || FieldValue.serverTimestamp(),
      "decay.lastHitAt": FieldValue.serverTimestamp(),
      "decay.nextHitAt": nextDueAt
        ? Timestamp.fromDate(nextDueAt)
        : null,
      "decay.recoveryDaysRequired": RECOVERY_DAYS_REQUIRED,
      "decay.recoveryDaysCompleted":
        currentState === "DECAY_ACTIVE"
          ? Number(decay.recoveryDaysCompleted || 0)
          : 0,
      "decay.recoveryLog":
        currentState === "DECAY_ACTIVE" &&
        Array.isArray(decay.recoveryLog)
          ? decay.recoveryLog
          : [],
      "decay.lastUpdatedAt": FieldValue.serverTimestamp(),
      tierStatus: frozen ? "frozen" : athlete.tierStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(hitReceiptRef, {
      athleteId,
      dueAt: Timestamp.fromDate(dueAt),
      hitNumber: nextHits,
      pointsApplied: DK_HIT,
      beforeXp: authority.beforeXp,
      afterXp: authority.afterXp,
      stateAfter: frozen ? "FROZEN" : "DECAY_ACTIVE",
      createdAt: FieldValue.serverTimestamp(),
    });

    const type = frozen
      ? PARENT_SIGNAL_TYPES.PROGRAM_FROZEN
      : PARENT_SIGNAL_TYPES.DECAY_POINTS;
    return {
      uid: athleteId,
      action: frozen ? "FROZEN" : "DK_APPLIED",
      beforeXp: authority.beforeXp,
      afterXp: authority.afterXp,
      decayPoints: nextPoints,
      signal: {
        type,
        sourceId: hitReceiptId,
        note: frozen
          ? "Progression frozen after reaching 150 decay points."
          : "25 decay points applied for continued inactivity.",
        meta: {
          hitNumber: nextHits,
          decayPoints: nextPoints,
          dueAt: dueAt.toISOString(),
        },
      },
    };
  });
}

export const scheduledDecaySweep = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "America/Los_Angeles",
  },
  async () => {
    const db = getFirestore();
    const now = new Date();

    const snap = await db.collection("athletes").get();

    const results = [];

    for (const docSnap of snap.docs) {
      const result = await evaluateAthlete(docSnap.ref, now);
      results.push(result);

      if (result.signal) {
        try {
          await emitDecaySignal(
            result.uid,
            athleteName(docSnap.data(), result.uid),
            result.signal
          );
        } catch (error) {
          console.error(
            "[scheduledDecaySweep] parent signal failed",
            result.uid,
            error
          );
        }
      }
    }

    console.log("[scheduledDecaySweep]", {
      checked: snap.size,
      results,
    });
  }
);
