import {
  F8_RANKS,
  calculateF8StripeCount,
  calculateF8StripeThresholds,
} from "../../functions/lib/policy/f8ProgressionPolicy.js";

export const LEGACY_F8_RANKS = Object.freeze([
  Object.freeze({ tier: "T0", name: "Shadow", xpCap: 600 }),
  Object.freeze({ tier: "T1", name: "Recruit", xpCap: 800 }),
  Object.freeze({ tier: "T2", name: "Contender", xpCap: 1000 }),
  Object.freeze({ tier: "T3", name: "Competitor", xpCap: 1200 }),
  Object.freeze({ tier: "T4", name: "Warrior", xpCap: 1400 }),
  Object.freeze({ tier: "T5", name: "Champion", xpCap: 1600 }),
  Object.freeze({ tier: "T6", name: "Commander", xpCap: 1800 }),
  Object.freeze({ tier: "T7", name: "Hero", xpCap: 2400 }),
]);

export const MIGRATION_WARNING_CODES = Object.freeze([
  "UNKNOWN_F8_CLASSIFICATION",
  "UNKNOWN_LEGACY_TIER",
  "RANK_TIER_MISMATCH",
  "NEGATIVE_XP",
  "INVALID_XP",
  "XP_OVER_LEGACY_CAP",
  "STORED_CAP_MISMATCH",
  "STRIPE_MISMATCH",
  "SOURCE_BUCKET_MISMATCH",
  "TESTING_IN_PROGRESS",
  "COOLDOWN_OR_FREEZE_ACTIVE",
  "LEGACY_CREDIT_PRESENT",
  "DISCIPLINE_PROGRESSION_CONFLICT",
  "LOG_RECONCILIATION_WARNING",
  "FIVE_RANK_DATA_ALREADY_PRESENT",
]);

const F8_EXACT_VALUES = new Set(["f8", "foundry8", "zero2hero", "z2h", "youth"]);
const F4_EXACT_VALUES = new Set([
  "f4",
  "foundry4",
  "path2legend",
  "p2l",
  "quest2mastery",
  "q2m",
  "adult",
]);
const CLASSIFICATION_FIELDS = [
  "trackBase",
  "framework",
  "programKind",
  "program",
  "programTrack",
  "journey",
  "track",
  "trackCode",
  "ladderKey",
];

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function markerKind(value) {
  const valueNormalized = normalized(value);
  if (!valueNormalized) return null;
  if (
    F8_EXACT_VALUES.has(valueNormalized) ||
    valueNormalized.startsWith("f8") ||
    valueNormalized.includes("foundry8") ||
    valueNormalized.includes("zero2hero") ||
    valueNormalized.includes("z2h")
  ) {
    return "F8";
  }
  if (
    F4_EXACT_VALUES.has(valueNormalized) ||
    valueNormalized.startsWith("f4") ||
    valueNormalized.includes("foundry4") ||
    valueNormalized.includes("path2legend") ||
    valueNormalized.includes("quest2mastery")
  ) {
    return "F4";
  }
  return null;
}

function collectMarkers(record, prefix, evidence) {
  if (!record || typeof record !== "object") return;
  for (const field of CLASSIFICATION_FIELDS) {
    const value = record[field];
    const kind = markerKind(value);
    if (kind) evidence.push({ kind, path: `${prefix}${field}`, value: String(value) });
  }
}

export function classifyF8Candidate(docId, athlete = {}) {
  const evidence = [];
  const identifiers = [docId, athlete.uid, athlete.uidCode, athlete.id];
  for (const [index, value] of identifiers.entries()) {
    if (/^F8_/i.test(String(value ?? "").trim())) {
      evidence.push({
        kind: "F8",
        path: ["documentId", "uid", "uidCode", "id"][index],
        value: String(value),
      });
    }
    if (/^F4_/i.test(String(value ?? "").trim())) {
      evidence.push({
        kind: "F4",
        path: ["documentId", "uid", "uidCode", "id"][index],
        value: String(value),
      });
    }
  }

  collectMarkers(athlete, "", evidence);
  const disciplines = athlete.disciplines;
  if (disciplines && typeof disciplines === "object" && !Array.isArray(disciplines)) {
    for (const [disciplineId, discipline] of Object.entries(disciplines)) {
      collectMarkers(discipline, `disciplines.${disciplineId}.`, evidence);
    }
  }

  const hasF8 = evidence.some((item) => item.kind === "F8");
  const hasF4 = evidence.some((item) => item.kind === "F4");
  const accepted = hasF8 && !hasF4;
  const reason = accepted
    ? "Explicit Foundry 8 / Zero2Hero evidence with no conflicting F4 marker."
    : hasF8 && hasF4
      ? "Conflicting F8 and F4 classification evidence; excluded fail-closed."
      : "No explicit Foundry 8 / Zero2Hero classification evidence."
  return { accepted, ambiguous: hasF8 && hasF4, reason, evidence };
}

function warning(code, explanation) {
  return Object.freeze({ code, explanation });
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function legacyStripeCount(xp, cap) {
  if (!Number.isFinite(xp) || !Number.isFinite(cap) || cap <= 0) return null;
  const safeXp = Math.max(0, Math.min(xp, cap));
  return Math.min(4, Math.floor(safeXp / (cap / 4)));
}

function findNewRank(cumulativeXp) {
  let consumed = 0;
  for (const rank of F8_RANKS) {
    if (cumulativeXp < consumed + rank.xpCap || rank === F8_RANKS.at(-1)) {
      return { rank, start: consumed };
    }
    consumed += rank.xpCap;
  }
  throw new Error("Unable to resolve new Foundry 8 rank.");
}

export function calculateF8MigrationProposal(input) {
  const warnings = [];
  const tier = String(input?.tier ?? "").trim().toUpperCase();
  const legacyIndex = LEGACY_F8_RANKS.findIndex((rank) => rank.tier === tier);
  if (legacyIndex < 0) {
    warnings.push(warning("UNKNOWN_LEGACY_TIER", `Legacy tier '${tier || "(missing)"}' is not T0-T7.`));
    return { proposal: null, warnings };
  }

  const legacyRank = LEGACY_F8_RANKS[legacyIndex];
  const storedRankName = String(input?.rankName ?? "").trim();
  if (storedRankName && storedRankName.toLowerCase() !== legacyRank.name.toLowerCase()) {
    warnings.push(warning("RANK_TIER_MISMATCH", `${tier} expects ${legacyRank.name}, but stored rank is ${storedRankName}.`));
  }

  const rawXp = numericValue(input?.xp);
  if (rawXp === null) {
    warnings.push(warning("INVALID_XP", "Active XP is missing or is not a finite number; zero used for proposal."));
  } else if (rawXp < 0) {
    warnings.push(warning("NEGATIVE_XP", `Active XP ${rawXp} is negative; zero used for proposal.`));
  } else if (rawXp > legacyRank.xpCap) {
    warnings.push(warning("XP_OVER_LEGACY_CAP", `Active XP ${rawXp} exceeds the ${legacyRank.xpCap} legacy cap; cap used for proposal.`));
  }
  const clampedXp = Math.max(0, Math.min(rawXp ?? 0, legacyRank.xpCap));

  const storedCap = numericValue(input?.xpCap);
  if (storedCap !== null && storedCap !== legacyRank.xpCap) {
    warnings.push(warning("STORED_CAP_MISMATCH", `Stored cap ${storedCap} does not match legacy ${tier} cap ${legacyRank.xpCap}.`));
  }

  const storedStripeCount = numericValue(input?.stripeCount);
  const expectedLegacyStripes = legacyStripeCount(clampedXp, legacyRank.xpCap);
  if (storedStripeCount !== null && storedStripeCount !== expectedLegacyStripes) {
    warnings.push(warning("STRIPE_MISMATCH", `Stored stripe count ${storedStripeCount} differs from legacy-calculated ${expectedLegacyStripes}.`));
  }

  const oldJourneyEarned =
    LEGACY_F8_RANKS.slice(0, legacyIndex).reduce((sum, rank) => sum + rank.xpCap, 0) + clampedXp;
  const { rank: newRank, start } = findNewRank(oldJourneyEarned);
  const proposedActiveXp = Math.min(newRank.xpCap, oldJourneyEarned - start);
  const proposedStripeThresholds = [...calculateF8StripeThresholds(newRank.id)];
  const proposedStripeCount = calculateF8StripeCount(newRank.id, proposedActiveXp);

  return {
    proposal: {
      oldCumulativeJourneyXp: oldJourneyEarned,
      proposedTier: newRank.tier,
      proposedRank: newRank.name,
      proposedActiveXp,
      proposedXpCap: newRank.xpCap,
      proposedStripeCount,
      proposedStripeThresholds,
      proposedRankPercent: Number(((proposedActiveXp / newRank.xpCap) * 100).toFixed(2)),
    },
    warnings,
  };
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function progressionFingerprint(record) {
  if (!record || typeof record !== "object") return null;
  return JSON.stringify({
    tier: record.tier ?? record.tierCode ?? null,
    rankName: record.rankName ?? record.tierName ?? null,
    xp: record.xp ?? record.currentTierXP ?? null,
    xpCap: record.xpCap ?? null,
    curriculumTier: record.curriculumTier ?? record.unlockedTier ?? null,
  });
}

export function evaluateF8SafetyWarnings(input, context = {}) {
  const warnings = [];
  const xp = numericValue(input?.xp);
  const combatBucketValues = [input?.xpDaily, input?.xpArena, input?.xpFightIQ]
    .map(numericValue)
    .filter((value) => value !== null);
  if (xp !== null && combatBucketValues.length && combatBucketValues.reduce((a, b) => a + b, 0) > xp) {
    warnings.push(warning("SOURCE_BUCKET_MISMATCH", "Combat source buckets exceed stored active XP and could reconstruct stale progress."));
  }

  const testingState = String(input?.testing?.state ?? "").trim().toUpperCase();
  if (["TEMPLE", "ELIGIBLE", "SCHEDULED", "TESTING"].includes(testingState)) {
    warnings.push(warning("TESTING_IN_PROGRESS", `Testing state is ${testingState}.`));
  }
  const nowMs = context.nowMs ?? Date.now();
  const lockTimes = [
    input?.testing?.cooldownUntil,
    input?.testing?.freezeUntil,
    input?.lockedUntil,
  ].map(timestampMillis).filter((value) => value !== null);
  if (["COOLDOWN", "FREEZE", "FROZEN"].includes(testingState) || lockTimes.some((value) => value > nowMs)) {
    warnings.push(warning("COOLDOWN_OR_FREEZE_ACTIVE", "Cooldown or freeze state is active or recorded."));
  }

  if (
    input?.legacyHold === true ||
    Number(input?.legacyCreditTotal ?? 0) !== 0 ||
    Number(input?.legacyCreditIssued ?? 0) !== 0 ||
    String(input?.legacyCreditSchedule ?? "").trim()
  ) {
    warnings.push(warning("LEGACY_CREDIT_PRESENT", "Legacy or deferred credit fields are present."));
  }

  const fingerprints = Object.values(input?.disciplines ?? {})
    .map(progressionFingerprint)
    .filter(Boolean);
  if (new Set(fingerprints).size > 1) {
    warnings.push(warning("DISCIPLINE_PROGRESSION_CONFLICT", "Discipline progression records disagree."));
  }

  const fiveRankNames = new Set(F8_RANKS.map((rank) => rank.name.toLowerCase()));
  const rankName = String(input?.rankName ?? "").trim().toLowerCase();
  const matchingNewRank = F8_RANKS.find((rank) => rank.name.toLowerCase() === rankName);
  if (
    rankName === "prospect" ||
    (matchingNewRank && numericValue(input?.xpCap) === matchingNewRank.xpCap)
  ) {
    warnings.push(warning("FIVE_RANK_DATA_ALREADY_PRESENT", "Record contains values matching the new five-rank policy."));
  }

  const logSummary = context.logSummary;
  if (
    logSummary &&
    ((logSummary.xpLogs.count > 0 && logSummary.xp_logs.count > 0) ||
      (logSummary.xpLogs.count === 0 && logSummary.xp_logs.count === 0))
  ) {
    warnings.push(warning("LOG_RECONCILIATION_WARNING", "XP history is split across both log models or absent from both; automatic reconciliation is not reliable."));
  }
  return warnings;
}

export function resolveLegacyProgressionSource(athlete = {}) {
  const rootHasTier = /^T[0-7]$/i.test(String(athlete.tier ?? athlete.tierCode ?? ""));
  if (rootHasTier) return { source: athlete, sourcePath: "athlete" };

  const explicitF8Disciplines = Object.entries(athlete.disciplines ?? {}).filter(([, record]) => {
    const evidence = [];
    collectMarkers(record, "", evidence);
    return evidence.some((item) => item.kind === "F8") && !evidence.some((item) => item.kind === "F4");
  });
  if (explicitF8Disciplines.length === 1) {
    return { source: explicitF8Disciplines[0][1], sourcePath: `disciplines.${explicitF8Disciplines[0][0]}` };
  }
  return { source: athlete, sourcePath: "athlete" };
}

export function buildF8MigrationReview(docId, athlete, context = {}) {
  const classification = classifyF8Candidate(docId, athlete);
  if (!classification.accepted) {
    return {
      included: false,
      exclusion: {
        documentId: docId,
        internalId: athlete.uid ?? athlete.uidCode ?? athlete.id ?? null,
        reason: classification.reason,
        evidence: classification.evidence,
        warnings: [warning("UNKNOWN_F8_CLASSIFICATION", classification.reason)],
      },
    };
  }

  const { source, sourcePath } = resolveLegacyProgressionSource(athlete);
  const calculated = calculateF8MigrationProposal(source);
  const safetyWarnings = evaluateF8SafetyWarnings(athlete, context);
  if (sourcePath !== "athlete" && Object.keys(athlete.disciplines ?? {}).length > 1) {
    safetyWarnings.push(warning("DISCIPLINE_PROGRESSION_CONFLICT", `Migration progression came from ${sourcePath}; other discipline records require review.`));
  }

  return {
    included: true,
    review: {
      identity: {
        documentId: docId,
        internalId: athlete.uid ?? athlete.uidCode ?? athlete.id ?? null,
        displayName: athlete.publicName ?? athlete.fullName ?? athlete.name ?? null,
      },
      classification: {
        reason: classification.reason,
        evidence: classification.evidence,
      },
      progressionSource: sourcePath,
      legacyProgression: {
        tier: source.tier ?? source.tierCode ?? null,
        rankName: source.rankName ?? source.tierName ?? null,
        xp: source.xp ?? source.currentTierXP ?? null,
        xpCap: source.xpCap ?? null,
        stripeCount: source.stripeCount ?? source.stripesEarned ?? null,
      },
      legacySourceState: {
        xpDaily: source.xpDaily ?? athlete.xpDaily ?? null,
        xpArena: source.xpArena ?? athlete.xpArena ?? null,
        xpFightIQ: source.xpFightIQ ?? athlete.xpFightIQ ?? null,
        xpStrength: source.xpStrength ?? athlete.xpStrength ?? null,
        xpHonor: source.xpHonor ?? athlete.xpHonor ?? null,
      },
      monthly: {
        embedded: athlete.monthly ?? null,
        xpMonthlySummary: context.xpMonthlySummary ?? null,
      },
      history: context.logSummary ?? null,
      promotionTesting: {
        testing: athlete.testing ?? null,
        tierStatus: athlete.tierStatus ?? null,
        status: athlete.status ?? null,
        lockedUntil: athlete.lockedUntil ?? null,
        legacyHold: athlete.legacyHold ?? null,
        legacyCreditTotal: athlete.legacyCreditTotal ?? null,
        legacyCreditIssued: athlete.legacyCreditIssued ?? null,
        legacyCreditSchedule: athlete.legacyCreditSchedule ?? null,
      },
      curriculumCompatibility: summarizeCurriculumCompatibility(athlete),
      proposal: calculated.proposal,
      warnings: [...calculated.warnings, ...safetyWarnings],
    },
  };
}

export function summarizeCurriculumCompatibility(athlete = {}) {
  const records = [];
  for (const [disciplineId, discipline] of Object.entries(athlete.disciplines ?? {})) {
    if (!discipline || typeof discipline !== "object") continue;
    records.push({
      disciplineId,
      tier: discipline.tier ?? discipline.tierCode ?? null,
      rankName: discipline.rankName ?? discipline.tierName ?? null,
      curriculumTier: discipline.curriculumTier ?? null,
      unlockedTier: discipline.unlockedTier ?? null,
      completedLessonCount: Array.isArray(discipline.completedLessons) ? discipline.completedLessons.length : null,
      completedSkillCount: Array.isArray(discipline.completedSkills) ? discipline.completedSkills.length : null,
      completionReferenceCount:
        discipline.completions && typeof discipline.completions === "object"
          ? Object.keys(discipline.completions).length
          : null,
    });
  }
  return { disciplines: records };
}
