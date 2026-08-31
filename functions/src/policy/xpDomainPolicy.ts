export const XP_DOMAINS = Object.freeze({
  ACTIVE_RANK: "ACTIVE_RANK",
  LIFETIME: "LIFETIME",
  CHALLENGE: "CHALLENGE",
  STRENGTH: "STRENGTH",
  HONOR: "HONOR",
} as const);

export type XpDomain = (typeof XP_DOMAINS)[keyof typeof XP_DOMAINS];
export type XpProgramBase = "F4" | "F8" | "ADULT";
export type XpAwardLane = "JOURNEY" | "STRENGTH" | "HONOR" | "CHALLENGE";

export const XP_DOMAIN_POLICY_VERSION = "xp-domain-firewall-v1" as const;

export const XP_DOMAIN_FIREWALL = Object.freeze({
  version: XP_DOMAIN_POLICY_VERSION,
  authoritativeActiveRankField: "xp",
  permittedFutureConversions: Object.freeze([
    Object.freeze({ from: XP_DOMAINS.CHALLENGE, to: XP_DOMAINS.LIFETIME }),
  ]),
  forbiddenConversions: Object.freeze([
    Object.freeze({ from: XP_DOMAINS.CHALLENGE, to: XP_DOMAINS.ACTIVE_RANK }),
    Object.freeze({ from: XP_DOMAINS.CHALLENGE, to: XP_DOMAINS.STRENGTH }),
    Object.freeze({ from: XP_DOMAINS.CHALLENGE, to: XP_DOMAINS.HONOR }),
    Object.freeze({ from: XP_DOMAINS.LIFETIME, to: XP_DOMAINS.ACTIVE_RANK }),
  ]),
});

export function resolveAuthoritativeActiveRankXp(athlete: any): number {
  return Number(athlete?.xp ?? 0);
}

export type LifetimeXpAccumulation = Readonly<{
  before: number;
  after: number;
  delta: number;
}>;

export function resolveLifetimeXpAccumulation(
  athlete: any,
  activeRankXpBefore: number,
  activeRankXpAfter: number
): LifetimeXpAccumulation {
  const before = Number(athlete?.lifetimeXp ?? 0);
  if (!Number.isFinite(before) || before < 0) {
    throw new Error("INVALID_LIFETIME_XP");
  }
  const delta = Math.max(0, activeRankXpAfter - activeRankXpBefore);
  return Object.freeze({ before, after: before + delta, delta });
}

export function isXpDomainConversionPermitted(from: XpDomain, to: XpDomain): boolean {
  return XP_DOMAIN_FIREWALL.permittedFutureConversions.some(
    (conversion) => conversion.from === from && conversion.to === to
  );
}

export function awardLaneFeedsActiveRankXp(base: XpProgramBase, lane: XpAwardLane): boolean {
  if (lane === "JOURNEY") return true;
  if (lane === "CHALLENGE") return false;
  return base === "F8" && (lane === "STRENGTH" || lane === "HONOR");
}
