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
 * Three separate verified combat attendance days
 * stop decay and reset inactivity.
 *
 * Decay never demotes earned tiers.
 * XP never falls below zero.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore,FieldValue,Timestamp} from "firebase-admin/firestore";

const DK_HIT = 25;
const DK_MAX = 150;
const RECOVERY_DAYS_REQUIRED = 3;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export const scheduledDecaySweep = onSchedule(
  {
    schedule: "every 24 hours",
    timeZone: "America/Los_Angeles",
  },
  async () => {
    const db = getFirestore();
    const now = new Date();

    const snap = await db
      .collection("athletes")
      .where("decay.state", "==", "DECAY_ACTIVE")
      .get();

    const results = [];

    for (const docSnap of snap.docs) {
      const athlete = docSnap.data() || {};
      const ref = docSnap.ref;

      const uid = docSnap.id;
      const currentXp = Number(athlete.xp || 0);
      const currentPoints = Number(athlete?.decay?.points || 0);
      const currentHits = Number(athlete?.decay?.hits || 0);
      const recoveryDaysCompleted = Number(
        athlete?.decay?.recoveryDaysCompleted || 0
      );

      if (recoveryDaysCompleted >= RECOVERY_DAYS_REQUIRED) {
        await ref.update({
          "decay.state": "CLEAR",
          "decay.clearedAt": FieldValue.serverTimestamp(),
          "decay.points": 0,
          "decay.hits": 0,
          "decay.nextHitAt": null,
          "decay.recoveryDaysCompleted": 0,
          "decay.reason": "Recovered after 3 verified combat days",
          "decay.lastUpdatedAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.push({ uid, action: "CLEARED" });
        continue;
      }

      const nextHitAt = toDate(athlete?.decay?.nextHitAt);

      if (!nextHitAt || nextHitAt > now) {
        results.push({ uid, action: "SKIPPED_NOT_DUE" });
        continue;
      }

      const nextPoints = Math.min(currentPoints + DK_HIT, DK_MAX);
      const nextHits = currentHits + 1;

      // Decay reduces combat readiness only.
      // It never demotes an athlete's earned tier.
      const nextXp = Math.max(0, currentXp - DK_HIT);

      const frozen = nextPoints >= DK_MAX;

      await ref.update({
        xp: nextXp,

        "decay.state": frozen ? "FROZEN" : "DECAY_ACTIVE",
        "decay.points": nextPoints,
        "decay.hits": nextHits,
        "decay.lastHitAt": FieldValue.serverTimestamp(),
        "decay.nextHitAt": frozen
          ? null
          : Timestamp.fromDate(addDays(now, 14)),
        "decay.lastUpdatedAt": FieldValue.serverTimestamp(),

        tierStatus: frozen ? "frozen" : athlete.tierStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      results.push({
        uid,
        action: frozen ? "FROZEN" : "DK_APPLIED",
        beforeXp: currentXp,
        afterXp: nextXp,
        decayPoints: nextPoints,
      });
    }

    console.log("[scheduledDecaySweep]", {
      checked: snap.size,
      results,
    });
  }
);