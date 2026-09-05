import {
  COMBAT_TRAINING_DEFAULTS,
  COMBAT_TRAINING_TIMING
} from "/lab/timer-engine/data/combat-training-policy.js";
import { COMBAT_DISCIPLINE_LIBRARY } from "/lab/timer-engine/data/combat-discipline-library.js";

const JOURNEY_ALIASES = Object.freeze({
  road2champion: "road2champion",
  zero2hero: "road2champion",
  z2h: "road2champion",
  f8: "road2champion",
  youth: "road2champion",
  path2legend: "path2legend",
  p2l: "path2legend",
  f4: "path2legend"
});

const DISCIPLINE_ALIASES = Object.freeze({
  wrestling: "wrestling",
  boxing: "boxing",
  kickboxing: "muay-thai",
  "muay-thai": "muay-thai",
  muaythai: "muay-thai",
  striking: "muay-thai",
  mma: "mma",
  grappling: "submission-grappling",
  bjj: "submission-grappling",
  "submission-grappling": "submission-grappling"
});

const normalize = value => String(value || "").trim().toLowerCase();

function resolveKey(value, aliases, fallback, label) {
  const normalized = normalize(value);
  if (!normalized) return fallback;
  const resolved = aliases[normalized];
  if (!resolved) throw new RangeError(`Unsupported ${label}: ${value}`);
  return resolved;
}

function resolveTier(value) {
  const normalized = normalize(value || "t0");
  const tier = normalized.startsWith("t") ? normalized : `t${normalized}`;
  if (!/^t[0-4]$/.test(tier)) throw new RangeError(`Unsupported training tier: ${value}`);
  return tier;
}

function resolveRound(round, targetDuration, transitionDuration) {
  const mode = round.mode || "neutral";
  const actionCount = round.actions.length;
  const roundDuration = Math.max(targetDuration, round.minimumRoundDuration || 0);
  const overhead = mode === "bottom"
    ? actionCount * round.commandPattern.leadInDuration
    : (actionCount - (round.trailingTransition === false ? 1 : 0)) * transitionDuration;
  const actionDuration = (roundDuration - overhead) / actionCount;
  if (!Number.isFinite(actionDuration) || actionDuration <= 0) {
    throw new RangeError(`Cannot resolve action timing for ${round.id}`);
  }
  return Object.freeze({ ...round, mode, roundDuration, actionDuration });
}

export function resolveCombatTrainingPreset({ discipline, journey, track, tier } = {}) {
  const disciplineKey = resolveKey(discipline, DISCIPLINE_ALIASES, "wrestling", "discipline");
  const journeyKey = resolveKey(journey || track, JOURNEY_ALIASES, "road2champion", "journey");
  const tierKey = resolveTier(tier);
  const disciplineDefinition = COMBAT_DISCIPLINE_LIBRARY[disciplineKey];
  const timing = COMBAT_TRAINING_TIMING[journeyKey]?.[tierKey];
  if (!disciplineDefinition || !timing) throw new RangeError("No complete combat training preset is available");

  const rounds = Object.freeze(disciplineDefinition.rounds.map(round =>
    resolveRound(round, timing.roundDuration, disciplineDefinition.transition.duration)
  ));

  return Object.freeze({
    id: `${journeyKey}-${tierKey}-${disciplineKey}`,
    label: `${timing.rankName} ${disciplineDefinition.label}`,
    discipline: disciplineKey,
    journey: journeyKey,
    tier: tierKey,
    rankName: timing.rankName,
    roundDuration: timing.roundDuration,
    actionDuration: rounds[0].actionDuration,
    prerollDuration: COMBAT_TRAINING_DEFAULTS.prerollDuration,
    restDuration: COMBAT_TRAINING_DEFAULTS.restDuration,
    shortTimeAt: COMBAT_TRAINING_DEFAULTS.shortTimeAt,
    transition: disciplineDefinition.transition,
    derivedFrom: disciplineDefinition.derivedFrom || null,
    rounds
  });
}

export function resolveCombatTrainingPresetFromSearch(search = "") {
  const params = new URLSearchParams(search);
  return resolveCombatTrainingPreset({
    discipline: params.get("discipline"),
    journey: params.get("journey"),
    track: params.get("track"),
    tier: params.get("tier")
  });
}
