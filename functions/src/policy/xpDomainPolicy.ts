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
export type LifetimeXpDomain = "COMBAT" | "STRENGTH" | "HONOR";
export type XpAdjustmentSemantic =
  | "NEW_EARNED_XP"
  | "RESTORE_ALREADY_COUNTED_XP"
  | "HISTORICAL_LIFETIME_RECONCILIATION"
  | "RECOGNIZED_PRIOR_EXPERIENCE"
  | "REVERSE_ERRONEOUS_AWARD"
  | "OPERATIONAL_DEDUCTION"
  | "DOMAIN_RECLASSIFICATION";

export type ManagementXpAdjustmentCategory =
  | "delayed_onboarding"
  | "paper_reconciliation"
  | "downtime_recovery"
  | "correction";

export const LIFETIME_XP_RECEIPT_VERSION = "lifetime-components-v1" as const;
export const LIFETIME_XP_SCHEMA_VERSION = "domain-components-v1" as const;
const COMPONENT_FIELDS = Object.freeze({
  COMBAT: "lifetimeCombatXp",
  STRENGTH: "lifetimeStrengthXp",
  HONOR: "lifetimeHonorXp",
} as const);

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

function nonNegative(value: unknown, code: string): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(code);
  return number;
}

export function resolveLifetimeDomain(kindInput: unknown): LifetimeXpDomain {
  const kind = String(kindInput ?? "").trim().toUpperCase();
  if (kind === "STRENGTH") return "STRENGTH";
  if (kind === "HONOR") return "HONOR";
  if (kind === "ATTENDANCE" || kind === "DAILY_GRIND"
    || kind.startsWith("ARENA/") || kind.startsWith("CHAMPIONSHIP/")) return "COMBAT";
  throw new Error(`UNRESOLVED_LIFETIME_DOMAIN:${kind || "EMPTY"}`);
}

export type LifetimeXpState = Readonly<{
  legacy: number;
  combat: number;
  strength: number;
  honor: number;
  combined: number;
  reconciliationStatus: "componentized" | "legacy_unreconciled";
}>;

export function resolveLifetimeXpState(athlete: any): LifetimeXpState {
  const combat = nonNegative(athlete?.lifetimeCombatXp, "INVALID_LIFETIME_COMBAT_XP");
  const strength = nonNegative(athlete?.lifetimeStrengthXp, "INVALID_LIFETIME_STRENGTH_XP");
  const honor = nonNegative(athlete?.lifetimeHonorXp, "INVALID_LIFETIME_HONOR_XP");
  const componentTotal = combat + strength + honor;
  const storedCombined = nonNegative(athlete?.lifetimeXp, "INVALID_LIFETIME_XP");
  const hasSchema = athlete?.lifetimeXpSchemaVersion === LIFETIME_XP_SCHEMA_VERSION;
  const legacy = hasSchema
    ? nonNegative(athlete?.lifetimeLegacyXp, "INVALID_LIFETIME_LEGACY_XP")
    : storedCombined;
  const combined = legacy + componentTotal;
  if (hasSchema && storedCombined !== combined) {
    throw new Error("LIFETIME_XP_INVARIANT_VIOLATION");
  }
  return Object.freeze({ legacy, combat, strength, honor, combined,
    reconciliationStatus: legacy > 0 ? "legacy_unreconciled" : "componentized" });
}

export function resolveManagementAdjustmentSemantic(
  categoryInput: unknown,
  explicitSemantic?: XpAdjustmentSemantic
): XpAdjustmentSemantic {
  const category = String(categoryInput ?? "").trim().toLowerCase() as ManagementXpAdjustmentCategory;
  if (category === "delayed_onboarding" || category === "paper_reconciliation") {
    return "NEW_EARNED_XP";
  }
  if (category === "downtime_recovery") {
    return explicitSemantic ?? "NEW_EARNED_XP";
  }
  if (category === "correction") {
    if (!explicitSemantic) throw new Error("CORRECTION_REQUIRES_EXPLICIT_XP_SEMANTIC");
    return explicitSemantic;
  }
  throw new Error(`UNSUPPORTED_MANAGEMENT_XP_CATEGORY:${category || "EMPTY"}`);
}

export type LifetimeXpEffects = Readonly<{
  domain: LifetimeXpDomain;
  componentField: (typeof COMPONENT_FIELDS)[LifetimeXpDomain];
  semantic: XpAdjustmentSemantic;
  operationalDelta: number;
  componentBefore: number;
  componentAfter: number;
  lifetimeComponentDelta: number;
  combinedBefore: number;
  combinedAfter: number;
  combinedLifetimeDelta: number;
  stateAfter: LifetimeXpState;
}>;

export function resolveLifetimeXpEffects(args: {
  athlete: any;
  domain: LifetimeXpDomain;
  operationalDelta: number;
  semantic?: XpAdjustmentSemantic;
  lifetimeDelta?: number;
}): LifetimeXpEffects {
  const state = resolveLifetimeXpState(args.athlete);
  const semantic = args.semantic ?? "NEW_EARNED_XP";
  const operationalDelta = Number(args.operationalDelta);
  if (!Number.isFinite(operationalDelta)) throw new Error("INVALID_OPERATIONAL_DELTA");
  let lifetimeDelta = Number(args.lifetimeDelta ?? 0);
  if (semantic === "NEW_EARNED_XP" || semantic === "RECOGNIZED_PRIOR_EXPERIENCE") {
    lifetimeDelta = Math.max(0, operationalDelta);
  } else if (semantic === "RESTORE_ALREADY_COUNTED_XP" || semantic === "OPERATIONAL_DEDUCTION") {
    lifetimeDelta = 0;
  } else if (semantic === "HISTORICAL_LIFETIME_RECONCILIATION") {
    if (!Number.isFinite(lifetimeDelta)) throw new Error("INVALID_LIFETIME_DELTA");
  } else if (semantic === "REVERSE_ERRONEOUS_AWARD") {
    if (!Number.isFinite(lifetimeDelta) || lifetimeDelta >= 0) {
      throw new Error("REVERSAL_REQUIRES_NEGATIVE_LIFETIME_DELTA");
    }
  } else if (semantic === "DOMAIN_RECLASSIFICATION") {
    throw new Error("DOMAIN_RECLASSIFICATION_REQUIRES_TWO_COMPONENT_TRANSACTION");
  }
  const key = args.domain.toLowerCase() as "combat" | "strength" | "honor";
  const componentBefore = state[key];
  const componentAfter = componentBefore + lifetimeDelta;
  if (componentAfter < 0) throw new Error("LIFETIME_COMPONENT_UNDERFLOW");
  const combinedAfter = state.combined + lifetimeDelta;
  const stateAfter = Object.freeze({ ...state, [key]: componentAfter, combined: combinedAfter });
  return Object.freeze({ domain: args.domain, componentField: COMPONENT_FIELDS[args.domain], semantic,
    operationalDelta, componentBefore, componentAfter, lifetimeComponentDelta: lifetimeDelta,
    combinedBefore: state.combined, combinedAfter, combinedLifetimeDelta: lifetimeDelta, stateAfter });
}

export function assertLifetimeInvariant(state: LifetimeXpState): true {
  if (state.combined !== state.legacy + state.combat + state.strength + state.honor) {
    throw new Error("LIFETIME_XP_INVARIANT_VIOLATION");
  }
  return true;
}

export function lifetimeXpPatch(effects: LifetimeXpEffects): Record<string, unknown> {
  assertLifetimeInvariant(effects.stateAfter);
  return {
    [effects.componentField]: effects.componentAfter,
    lifetimeLegacyXp: effects.stateAfter.legacy,
    lifetimeXp: effects.combinedAfter,
    lifetimeXpSchemaVersion: LIFETIME_XP_SCHEMA_VERSION,
    lifetimeXpReconciliationStatus: effects.stateAfter.reconciliationStatus,
  };
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
