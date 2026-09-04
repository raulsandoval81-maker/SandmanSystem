export const ROAD2CHAMPION_STRIPES_PER_RANK = 4;
export const ROAD2CHAMPION_STRIPE_PERCENTAGES = Object.freeze([25, 50, 75, 100]);

const RANK_DEFINITIONS = [
  ["shadow", "T0", "Shadow", 800, "white", "#ffffff"],
  ["prospect", "T1", "Prospect", 1600, "yellow", "#ffd633"],
  ["competitor", "T2", "Competitor", 2400, "orange", "#ff9f1a"],
  ["contender", "T3", "Contender", 2800, "green", "#35c759"],
  ["champion", "T4", "Champion", 3200, "black", "#111111"],
];

export function road2ChampionStripeThresholds(referenceOrCap) {
  const cap = typeof referenceOrCap === "number"
    ? referenceOrCap
    : resolveRoad2ChampionRank(referenceOrCap)?.xpCap;
  if (!Number.isFinite(cap) || cap <= 0) return [];
  return ROAD2CHAMPION_STRIPE_PERCENTAGES.map((percentage) =>
    Math.ceil((cap * percentage) / 100)
  );
}

export const ROAD2CHAMPION_RANKS = Object.freeze(
  RANK_DEFINITIONS.map(([id, tier, name, xpCap, colorName, color]) => Object.freeze({
    id,
    tier,
    key: tier.replace(/^T/, "R"),
    name,
    xpCap,
    stripes: ROAD2CHAMPION_STRIPES_PER_RANK,
    stripePercentages: ROAD2CHAMPION_STRIPE_PERCENTAGES,
    stripeThresholds: Object.freeze(road2ChampionStripeThresholds(xpCap)),
    colorName,
    color,
  }))
);

export function resolveRoad2ChampionRank(reference) {
  const normalized = String(reference ?? "").trim().toLowerCase();
  return ROAD2CHAMPION_RANKS.find((rank) =>
    rank.id === normalized ||
    rank.tier.toLowerCase() === normalized ||
    rank.key.toLowerCase() === normalized ||
    rank.name.toLowerCase() === normalized
  ) || null;
}

export function resolveRoad2ChampionAthleteRank(athlete = {}) {
  const tier = athlete.progressionTier ?? athlete.tier ?? athlete.tierCode ?? "T0";
  const normalizedTier = /^\d+$/.test(String(tier)) ? `T${tier}` : tier;
  return resolveRoad2ChampionRank(normalizedTier) || resolveRoad2ChampionRank(athlete.rankName) || ROAD2CHAMPION_RANKS[0];
}

export function resolveRoad2ChampionXpCap(reference) {
  return resolveRoad2ChampionRank(reference)?.xpCap ?? null;
}
