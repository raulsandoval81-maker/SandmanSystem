import {WRESTLING_CARD_FAMILIES, WRESTLING_FAMILIES} from "/coaches/cards/wrestling/family-map.js";
import {WAVE_CARDS as T0_CARDS} from "/assets/js/hybrid/teen/teen-path-to-legend-wrestling-t0-waves.js";
import {WAVE_CARDS as T1_CARDS} from "/assets/js/hybrid/teen/teen-path-to-legend-wrestling-t1-waves.js";
import {WAVE_CARDS as T2_CARDS} from "/assets/js/hybrid/teen/teen-path-to-legend-wrestling-t2-waves.js";
import {WAVE_CARDS as T3_CARDS} from "/assets/js/hybrid/teen/teen-path-to-legend-wrestling-t3-waves.js";
import {WAVE_CARDS as T4_CARDS} from "/assets/js/hybrid/teen/teen-path-to-legend-wrestling-t4-waves.js";

export const AUTO_LESSON_PREVIEW_VERSION = "p2l-wrestling-checkpoint-1";
export const P2L_RANKS = Object.freeze({
  t0: "Apprentice", t1: "Warrior", t2: "Hero", t3: "Veteran", t4: "Legend"
});
export const PREVIEW_PRACTICE_SCHEMAS = Object.freeze({
  "academy-60": Object.freeze([
    {blockId: "onmat", minutes: 2}, {blockId: "warmup", minutes: 8},
    {blockId: "drills", minutes: 10}, {blockId: "technique", minutes: 15},
    {blockId: "water", minutes: 2}, {blockId: "live", minutes: 15},
    {blockId: "cond", minutes: 5}, {blockId: "offmat", minutes: 3}
  ]),
  "academy-75": Object.freeze([
    {blockId: "onmat", minutes: 2}, {blockId: "warmup", minutes: 10},
    {blockId: "drills", minutes: 12}, {blockId: "technique", minutes: 18},
    {blockId: "water", minutes: 3}, {blockId: "live", minutes: 20},
    {blockId: "cond", minutes: 7}, {blockId: "offmat", minutes: 3}
  ])
});

const CARD_MODULES = {t0: T0_CARDS, t1: T1_CARDS, t2: T2_CARDS, t3: T3_CARDS, t4: T4_CARDS};
const TRACK_ORDER = ["INTRODUCE", "PRACTICE", "EXTEND"];
const SUPPORTED_BLOCKS = new Set(["technique", "drills", "live"]);
const PROPOSED_MINUTES = {INTRODUCE: 8, PRACTICE: 6, EXTEND: 8};

function cardsFor(tier, familyId) {
  const mapping = WRESTLING_CARD_FAMILIES.p2l[tier];
  return Object.values(CARD_MODULES[tier]).flat().filter(card =>
    mapping[String(card.id || "").toLowerCase()] === familyId &&
    String(card.href || "").startsWith(`/coaches/cards/teen/p2l-wrestling/${tier}/`) &&
    String(card.tier || "").toLowerCase() === tier
  );
}
function compatible(a, b) {
  return Math.abs(TRACK_ORDER.indexOf(a) - TRACK_ORDER.indexOf(b)) <= 1;
}
function dominantTrack(recommendation) {
  return recommendation.athletes.reduce((result, athlete) =>
    TRACK_ORDER.indexOf(athlete.track) < TRACK_ORDER.indexOf(result) ? athlete.track : result,
  "EXTEND");
}

/** Pure preview: reads supplied recommendations and static curriculum modules only. */
export function assembleAutoLessonPreview(input) {
  const blockers = [];
  if (String(input.discipline).toLowerCase() !== "wrestling") blockers.push("unsupported-discipline");
  if (String(input.journey).toLowerCase() !== "p2l") blockers.push("unsupported-journey");
  const blocks = PREVIEW_PRACTICE_SCHEMAS[input.schema];
  if (!blocks) blockers.push("unsupported-practice-schema");

  const resolved = input.recommendations.flatMap(recommendation => {
    const tier = String(recommendation.tier).toLowerCase();
    if (!recommendation.evidenceComplete) {
      blockers.push(`incomplete-evidence:${recommendation.groupId}:${recommendation.familyId}`); return [];
    }
    if (!P2L_RANKS[tier]) {
      blockers.push(`unsupported-rank:${recommendation.groupId}:${recommendation.tier}`); return [];
    }
    if (!WRESTLING_FAMILIES[recommendation.familyId]) {
      blockers.push(`missing-family-mapping:${recommendation.groupId}:${recommendation.familyId}`); return [];
    }
    if (!recommendation.athletes.length || recommendation.athletes.some(athlete =>
      !athlete.athleteId || !TRACK_ORDER.includes(athlete.track))) {
      blockers.push(`invalid-athlete-tracks:${recommendation.groupId}:${recommendation.familyId}`); return [];
    }
    const cards = cardsFor(tier, recommendation.familyId);
    if (!cards.length) {
      blockers.push(`missing-card-mapping:${recommendation.groupId}:${tier}:${recommendation.familyId}`); return [];
    }
    const card = cards[0];
    const blockId = String(card.lane).toLowerCase();
    if (!SUPPORTED_BLOCKS.has(blockId)) {
      blockers.push(`unsupported-activity:${recommendation.groupId}:${card.id}:${card.lane}`); return [];
    }
    return [{...recommendation, tier, rankName: P2L_RANKS[tier], card, blockId,
      dominantTrack: dominantTrack(recommendation)}];
  });

  const segments = [];
  for (const item of resolved) {
    const match = segments.find(segment => segment.familyId === item.familyId
      && segment.blockId === item.blockId
      && segment.variations.every(other => compatible(other.dominantTrack, item.dominantTrack)));
    if (match) {
      match.variations.push(item); match.shared = true;
      match.proposedMinutes = Math.max(match.proposedMinutes, PROPOSED_MINUTES[item.dominantTrack]);
    } else {
      segments.push({familyId: item.familyId, familyLabel: WRESTLING_FAMILIES[item.familyId],
        blockId: item.blockId, proposedMinutes: PROPOSED_MINUTES[item.dominantTrack],
        shared: false, variations: [item]});
    }
  }
  if (blocks) for (const block of blocks) {
    const requested = segments.filter(segment => segment.blockId === block.blockId)
      .reduce((sum, segment) => sum + segment.proposedMinutes, 0);
    if (requested > block.minutes) blockers.push(`insufficient-time:${block.blockId}:${requested}:${block.minutes}`);
  }
  return {
    version: AUTO_LESSON_PREVIEW_VERSION, authoritative: false, previewOnly: true,
    eligibleForAuto: false, coachEditingRequired: true, coachApprovalRequired: true,
    evidenceCertifiedByAdapter: false, timingPolicy: "PROPOSED_PREVIEW_POLICY",
    discipline: "wrestling", journey: "p2l", schema: input.schema,
    durationMinutes: blocks?.reduce((sum, block) => sum + block.minutes, 0) || 0,
    blocks: blocks || [], segments, blockers: [...new Set(blockers)].sort(),
    readyForCoachPreview: blockers.length === 0
  };
}

/** Consumes only the protected callable's diagnostic contract; never upgrades its authority. */
export function assembleServerLessonPreview(source, schema = "academy-60") {
  const trustBlockers = [];
  const sourceBlockers = [...(source?.blockers || [])];
  if (source?.contractVersion !== "skill-check-auto-preview-v1"
      || source?.issuedBy !== "skillCheckCoachCall") trustBlockers.push("untrusted-recommendation-source");
  if (source?.reviewStatus !== "COACH_REVIEW_REQUIRED"
      || source?.authorizationStatus !== "DIAGNOSTIC_ONLY"
      || source?.previewOnly !== true || source?.authoritative !== false
      || source?.eligibleForAuto !== false || source?.coachApprovalRequired !== true) {
    trustBlockers.push("forged-or-inconsistent-authorization-status");
  }
  if (source?.sourceEvidenceAccepted !== true) trustBlockers.push("source-evidence-not-accepted");
  const assembled = assembleAutoLessonPreview({
    discipline: source?.discipline || "",
    journey: source?.journey || "",
    schema,
    recommendations: trustBlockers.length ? [] : (source?.recommendations || []),
  });
  return {
    ...assembled,
    sourceContractVersion: source?.contractVersion || "",
    sourceReviewStatus: source?.reviewStatus || "UNKNOWN",
    sourceAuthorizationStatus: source?.authorizationStatus || "UNKNOWN",
    sourceEvidenceAccepted: source?.sourceEvidenceAccepted === true,
    blockers: [...new Set([...trustBlockers, ...sourceBlockers, ...assembled.blockers])].sort(),
    readyForCoachPreview: trustBlockers.length === 0 && sourceBlockers.length === 0 && assembled.readyForCoachPreview,
  };
}
