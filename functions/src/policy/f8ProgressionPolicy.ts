export const F8_POLICY_VERSION = "f8-road2champion-v2" as const;

export const F8_STRIPE_PERCENTAGES = Object.freeze([
  25,
  50,
  75,
  100,
] as const);

export const F8_STRIPES_PER_RANK = 4 as const;

export const F8_RANKS = Object.freeze([
  Object.freeze({
    id: "shadow",
    tier: "T0",
    name: "Shadow",
    xpCap: 800,
    combinedStrengthHonorMonthlyCap: 40,
    competitionMonthlyCap: 0,
  }),
  Object.freeze({
    id: "prospect",
    tier: "T1",
    name: "Prospect",
    xpCap: 1600,
    combinedStrengthHonorMonthlyCap: 40,
    competitionMonthlyCap: 50,
  }),
  Object.freeze({
    id: "competitor",
    tier: "T2",
    name: "Competitor",
    xpCap: 2400,
    combinedStrengthHonorMonthlyCap: 60,
    competitionMonthlyCap: 80,
  }),
  Object.freeze({
    id: "contender",
    tier: "T3",
    name: "Contender",
    xpCap: 2800,
    combinedStrengthHonorMonthlyCap: 90,
    competitionMonthlyCap: 80,
  }),
  Object.freeze({
    id: "champion",
    tier: "T4",
    name: "Champion",
    xpCap: 3200,
    combinedStrengthHonorMonthlyCap: 120,
    competitionMonthlyCap: 80,
  }),
] as const);

export type F8RankMetadata = (typeof F8_RANKS)[number];
export type F8RankId = F8RankMetadata["id"];
export type F8Tier = F8RankMetadata["tier"];
export type F8RankReference = F8RankId | F8Tier | F8RankMetadata["name"];

export const F8_TOTAL_JOURNEY_XP = F8_RANKS.reduce(
  (total, rank) => total + rank.xpCap,
  0
);

export const F8_SOURCE_XP_VALUES = Object.freeze({
  combatPractice: Object.freeze([5, 10] as const),
  conditioning: 5,
  shorterRemoteStrength: 5,
  ironWork: 10,
  honor: 5,
  tournament: Object.freeze({
    participation: 10,
    secondDivision: 5,
    podium: 5,
    maximum: 20,
    styleIqProgression: 0,
  }),
});

export const F8_PROGRESSION_POLICY = Object.freeze({
  version: F8_POLICY_VERSION,
  progressionBars: 1,
  stripesPerRank: F8_STRIPES_PER_RANK,
  stripePercentages: F8_STRIPE_PERCENTAGES,
  ranks: F8_RANKS,
  totalJourneyXp: F8_TOTAL_JOURNEY_XP,
  sourceXpValues: F8_SOURCE_XP_VALUES,
});

function normalizeRankReference(reference: F8RankReference): string {
  return String(reference).trim().toLowerCase();
}

export function resolveF8RankMetadata(
  reference: F8RankReference
): F8RankMetadata {
  const normalized = normalizeRankReference(reference);
  const rank = F8_RANKS.find(
    (candidate) =>
      candidate.id === normalized ||
      candidate.tier.toLowerCase() === normalized ||
      candidate.name.toLowerCase() === normalized
  );

  if (!rank) {
    throw new RangeError(`Unknown Foundry 8 rank: ${String(reference)}`);
  }

  return rank;
}

export function resolveF8RankXpCap(reference: F8RankReference): number {
  return resolveF8RankMetadata(reference).xpCap;
}

export function calculateF8StripeThresholds(
  referenceOrCap: F8RankReference | number
): readonly number[] {
  const cap =
    typeof referenceOrCap === "number"
      ? referenceOrCap
      : resolveF8RankXpCap(referenceOrCap);

  if (!Number.isFinite(cap) || cap <= 0) {
    throw new RangeError("Foundry 8 rank XP cap must be a positive number.");
  }

  return Object.freeze(
    F8_STRIPE_PERCENTAGES.map((percentage) =>
      Math.ceil((cap * percentage) / 100)
    )
  );
}

export function calculateF8StripeCount(
  reference: F8RankReference,
  activeTierXp: number
): number {
  const safeXp = Number.isFinite(activeTierXp)
    ? Math.max(0, activeTierXp)
    : 0;

  return calculateF8StripeThresholds(reference).filter(
    (threshold) => safeXp >= threshold
  ).length;
}

export function hasReachedF8RankXpRequirement(
  reference: F8RankReference,
  activeTierXp: number
): boolean {
  return (
    Number.isFinite(activeTierXp) &&
    activeTierXp >= resolveF8RankXpCap(reference)
  );
}

export function resolveF8CombinedStrengthHonorMonthlyCap(
  reference: F8RankReference
): number {
  return resolveF8RankMetadata(reference).combinedStrengthHonorMonthlyCap;
}

export function resolveF8CompetitionMonthlyCap(
  reference: F8RankReference
): number {
  return resolveF8RankMetadata(reference).competitionMonthlyCap;
}
