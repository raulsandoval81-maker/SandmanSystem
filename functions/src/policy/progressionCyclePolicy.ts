import { HttpsError } from "firebase-functions/v2/https";
import {
  resolveF8RankMetadata,
  type F8RankReference,
} from "./f8ProgressionPolicy";

export type ProgressionBase = "F4" | "F8";

const F4_RANKS = Object.freeze([
  Object.freeze({ tier: "T0", rankName: "Apprentice", xpCap: 1000 }),
  Object.freeze({ tier: "T1", rankName: "Warrior", xpCap: 1600 }),
  Object.freeze({ tier: "T2", rankName: "Champion", xpCap: 2200 }),
  Object.freeze({ tier: "T3", rankName: "Veteran", xpCap: 2800 }),
  Object.freeze({ tier: "T4", rankName: "Legend", xpCap: 3200 }),
]);

export type PromotionRank = Readonly<{ tier: string; rankName: string; xpCap: number }>;

export function promotionRanks(base: ProgressionBase): readonly PromotionRank[] {
  if (base === "F4") return F4_RANKS;
  return ["T0", "T1", "T2", "T3", "T4"].map((tier) => {
    const rank = resolveF8RankMetadata(tier as F8RankReference);
    return Object.freeze({ tier: rank.tier, rankName: rank.name, xpCap: rank.xpCap });
  });
}

export function resolvePromotionTransition(base: ProgressionBase, tier: string) {
  const ranks = promotionRanks(base);
  const index = ranks.findIndex((rank) => rank.tier === tier);
  if (index < 0) throw new HttpsError("failed-precondition", `Unknown ${base} tier: ${tier}`);
  if (index === ranks.length - 1) {
    throw new HttpsError("failed-precondition", `${base}_FINAL_RANK_CANNOT_PROMOTE`);
  }
  return Object.freeze({ current: ranks[index], next: ranks[index + 1] });
}

export function progressionCycleSnapshot(athlete: any, tier: string) {
  const stored = athlete?.progressionCycle;
  const sequence = Number.isInteger(stored?.sequence) && stored.sequence >= 0
    ? stored.sequence : 0;
  const id = String(stored?.id ?? "").trim() || `legacy:${tier}`;
  return Object.freeze({ id, sequence, tier: String(stored?.tier ?? tier) });
}

export function nextProgressionCycle(athlete: any, nextTier: string, uniqueId: string) {
  const prior = progressionCycleSnapshot(athlete, String(athlete?.tier ?? "T0"));
  return Object.freeze({
    id: `${nextTier}:v${prior.sequence + 1}:${uniqueId}`,
    sequence: prior.sequence + 1,
    tier: nextTier,
    previousId: prior.id,
  });
}

export function isPromotionCooldownComplete(testing: any, nowMs: number): boolean {
  if (String(testing?.state ?? "").toUpperCase() !== "COOLDOWN") return false;
  if (String(testing?.lastTestResult ?? "").toUpperCase() !== "PASS") return false;
  const value = testing?.cooldownUntil;
  const untilMs = typeof value?.toMillis === "function"
    ? value.toMillis() : new Date(value ?? "").getTime();
  return Number.isFinite(untilMs) && untilMs <= nowMs;
}
