export const INNER_DRILL_CONTRACT_VERSION = "sandman-inner-drill-v1";
export const PRACTICE_MODES = Object.freeze(["auto", "hybrid", "manual"]);
export const INNER_DRILL_KINDS = Object.freeze(["drill", "live", "match"]);
export const ROTATION_FORMATS = Object.freeze(["standard", "match", "ironman", "top-bottom-out"]);

/** Editable training formats, not age, rank, federation, or developmental prescriptions. */
export const WRESTLING_LIVE_FORMATS = Object.freeze({
  short: Object.freeze({label: "Short goes", workSeconds: 30, restSeconds: 15, rounds: 6}),
  standard: Object.freeze({label: "Standard rounds", workSeconds: 120, restSeconds: 30, rounds: 6}),
  long: Object.freeze({label: "Long goes", workSeconds: 300, restSeconds: 60, rounds: 3}),
});

const asText = (value, name, max = 240) => {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw new TypeError(`${name} must contain 1–${max} characters.`);
  return text;
};
const integer = (value, name, min, max) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return number;
};
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const cueList = (value, name) => {
  if (!Array.isArray(value) || value.length > 20) throw new TypeError(`${name} must be an array with at most 20 cues.`);
  return value.map((cue, index) => asText(cue, `${name}[${index}]`, 120));
};

function phase(id, label, kind, seconds, extra = {}) {
  if (seconds <= 0) return null;
  return {id, label, kind, seconds, ...extra};
}

export function compileIntervals({label, workSeconds, restSeconds = 0, rounds}) {
  const work = integer(workSeconds, "workSeconds", 1, 3600);
  const rest = integer(restSeconds, "restSeconds", 0, 1800);
  const count = integer(rounds, "rounds", 1, 100);
  return Array.from({length: count}, (_, index) => {
    const round = index + 1;
    return [phase(`work-${round}`, label, "work", work, {round, rounds: count}),
      round < count ? phase(`rest-${round}`, "Rest / rotate", "rest", rest, {round, rounds: count}) : null];
  }).flat().filter(Boolean);
}

export function buildWrestlingRotation(format, athleteCount) {
  if (!ROTATION_FORMATS.includes(format)) throw new TypeError("Unsupported rotation format.");
  if (format === "standard") return [];
  const count = integer(athleteCount, "athleteCount", 3, 5);
  if (format === "top-bottom-out") {
    if (count !== 3) throw new RangeError("Top / Bottom / Out requires exactly three athletes.");
    return [[1,2,3],[3,1,2],[2,3,1]].map(([top,bottom,out]) => ({
      label: `Top ${top} · Bottom ${bottom}`, detail: `TOP ${top} · BOTTOM ${bottom} · OUT ${out}`,
      top, bottom, out,
    }));
  }
  if (format === "ironman" && count < 4) throw new RangeError("Iron Man requires four or five athletes.");
  const goes = [];
  for (let first = 1; first <= count; first += 1) for (let second = 1; second <= count; second += 1) {
    if (first === second || (format === "match" && second < first)) continue;
    goes.push({label: `${first} vs ${second}`, detail: format === "ironman"
      ? `IRON MAN ${first} · CHALLENGER ${second}` : `${first} vs ${second}`,
      ...(format === "ironman" ? {ironMan:first, challenger:second} : {first, second})});
  }
  return goes;
}

export function compileRotation({format, athleteCount, workSeconds, restSeconds = 0}) {
  const work = integer(workSeconds, "workSeconds", 1, 3600);
  const rest = integer(restSeconds, "restSeconds", 0, 1800);
  const goes = buildWrestlingRotation(format, athleteCount);
  if (!goes.length) throw new RangeError("A standard rotation uses interval rounds instead of an ordered rotation.");
  return goes.flatMap((go, index) => [
    phase(`rotation-${index + 1}`, go.label, "work", work, {round:index + 1, rounds:goes.length, rotation:go}),
    index < goes.length - 1 ? phase(`rotation-rest-${index + 1}`, "Rotate / rest", "rest", rest) : null,
  ]).filter(Boolean);
}

export function compileMatches({periodSeconds, periodBreakSeconds = 0, matchCount = 1,
  recoverySeconds = 0, shortTimeSeconds = 10}) {
  if (!Array.isArray(periodSeconds) || !periodSeconds.length || periodSeconds.length > 10) {
    throw new RangeError("Matches require 1–10 periods.");
  }
  const periods = periodSeconds.map((seconds, index) => integer(seconds, `periodSeconds[${index}]`, 1, 3600));
  const periodBreak = integer(periodBreakSeconds, "periodBreakSeconds", 0, 600);
  const matches = integer(matchCount, "matchCount", 1, 100);
  const recovery = integer(recoverySeconds, "recoverySeconds", 0, 1800);
  const shortTime = integer(shortTimeSeconds, "shortTimeSeconds", 0, 120);
  const phases = [];
  for (let match = 1; match <= matches; match += 1) {
    periods.forEach((seconds, index) => {
      phases.push(phase(`match-${match}-period-${index + 1}`, `Match ${match} · Period ${index + 1}`,
        "work", seconds, {match, matches, round:index + 1, rounds:periods.length,
          shortTimeCueSeconds: seconds > shortTime + 5 ? shortTime : null}));
      if (index < periods.length - 1 && periodBreak > 0) phases.push(phase(
        `match-${match}-break-${index + 1}`, "Period break", "break", periodBreak, {match, matches}));
    });
    if (match < matches && recovery > 0) phases.push(phase(
      `match-${match}-recovery`, "Between matches", "break", recovery, {match, matches}));
  }
  return phases;
}

function compileTimer(kind, timer, name) {
  if (!timer || timer.type === "continuous") {
    return [phase("continuous", name, "work", integer(timer?.seconds, "timer.seconds", 1, 14400))];
  }
  if (timer.type === "interval") return compileIntervals({label:name, ...timer});
  if (timer.type === "rotation") return compileRotation(timer);
  if (timer.type === "match" && kind === "match") return compileMatches(timer);
  throw new TypeError("Timer type is incompatible with this inner drill.");
}

function assertSourceBoundary(mode, origin, provenance) {
  if (!PRACTICE_MODES.includes(mode)) throw new TypeError("Unsupported practice mode.");
  if (!['coach','server-suggestion'].includes(origin)) throw new TypeError("Unsupported planning origin.");
  if (mode === "auto" && origin !== "server-suggestion") throw new TypeError("AUTO drills require a server suggestion.");
  if (origin === "server-suggestion" && (!provenance || provenance.previewOnly !== true
      || provenance.authoritative !== false || provenance.eligibleForAuto !== false)) {
    throw new TypeError("Server suggestions must preserve the protected diagnostic boundary.");
  }
}

/** Pure planning adapter. It does not start a timer, mutate a practice, or certify evidence. */
export function createInnerDrill(input) {
  const mode = String(input.practiceMode || "").toLowerCase();
  const origin = input.origin || "coach";
  assertSourceBoundary(mode, origin, input.recommendationProvenance);
  const kind = String(input.kind || "").toLowerCase();
  if (!INNER_DRILL_KINDS.includes(kind)) throw new TypeError("Unsupported inner-drill kind.");
  const parentBlock = asText(input.parentBlock, "parentBlock", 40).toLowerCase();
  if (!['warmup','drills','technique','live','cond'].includes(parentBlock)) throw new TypeError("Unsupported parent practice block.");
  const name = asText(input.name, "name", 80);
  const phases = compileTimer(kind, input.timer, name);
  const scheduledSeconds = phases.reduce((sum, item) => sum + item.seconds, 0);
  const coachCard = input.coachCard ? clone(input.coachCard) : null;
  if (coachCard && (!String(coachCard.id || "").trim()
      || !String(coachCard.href || "").startsWith("/coaches/cards/")
      || !String(coachCard.href).endsWith(".html") || String(coachCard.href).includes(".."))) {
    throw new TypeError("Coach Card reference must point to an existing Sandman Coach Card path.");
  }
  return Object.freeze({
    contractVersion: INNER_DRILL_CONTRACT_VERSION,
    id: asText(input.id, "id", 100), name, kind, parentBlock,
    discipline: String(input.discipline || "wrestling").toLowerCase(), practiceMode: mode, origin,
    skillFamily: input.skillFamily ? asText(input.skillFamily, "skillFamily", 100) : null,
    coachCard, assignedGroupIds: [...new Set((input.assignedGroupIds || []).map(String).filter(Boolean))],
    instructionalPurpose: asText(input.instructionalPurpose || "Coach-selected practice activity", "instructionalPurpose", 240),
    goal: String(input.goal || "").trim().slice(0, 120), cueLevel: input.cueLevel || "optimal",
    coachingCues: cueList(input.coachingCues || [], "coachingCues"),
    flowCues: cueList(input.flowCues || [], "flowCues"),
    timer: clone(input.timer), phases, scheduledSeconds,
    reservedMinutes: Math.ceil(scheduledSeconds / 60), minutes: scheduledSeconds / 60,
    recommendationProvenance: clone(input.recommendationProvenance || null),
    skillProvenance: clone(input.skillProvenance || null),
    coachEditable: true, policyHook: input.policyHook || null,
    planningOnly: true, authoritative: false, eligibleForAuto: false,
  });
}

export function overrideInnerDrillTiming(drill, timer) {
  const updated = createInnerDrill({...clone(drill), timer, originalProposal: undefined});
  return Object.freeze({...updated, originalProposal: clone(drill.originalProposal || drill),
    coachOverride: true, coachCard: clone(drill.coachCard), skillProvenance: clone(drill.skillProvenance),
    recommendationProvenance: clone(drill.recommendationProvenance)});
}

export function validateInnerDrillBlock({parentMinutes, parentTimer, drills}) {
  const capacitySeconds = integer(Math.round(Number(parentMinutes) * 60), "parent capacity", 1, 14400);
  const scheduledSeconds = (drills || []).reduce((sum, drill) => sum + Number(drill.scheduledSeconds || 0), 0);
  const reservedMinutes = (drills || []).reduce((sum, drill) =>
    sum + Math.ceil(Number(drill.scheduledSeconds || 0) / 60), 0);
  const blockers = [];
  if ((drills || []).some(drill => drill.contractVersion !== INNER_DRILL_CONTRACT_VERSION)) {
    blockers.push("unsupported-inner-drill-contract");
  }
  if (scheduledSeconds > capacitySeconds) blockers.push(`parent-block-capacity-exceeded:${scheduledSeconds}:${capacitySeconds}`);
  if (reservedMinutes * 60 > capacitySeconds) blockers.push(
    `parent-block-reservation-exceeded:${reservedMinutes}:${Math.floor(capacitySeconds / 60)}`);
  if (parentTimer?.pack && (drills || []).some(drill => (drill.phases || []).length > 1)) {
    blockers.push("parent-timer-conflicts-with-inner-schedule");
  }
  return {ok:blockers.length === 0, capacitySeconds, scheduledSeconds, reservedMinutes,
    remainingSeconds:Math.max(0, capacitySeconds - scheduledSeconds), blockers};
}

/** Existing Clipboard fields plus namespaced extended planning data. */
export function toClipboardDrillBlock(drill) {
  return {
    id: drill.id, name: drill.name, minutes: drill.reservedMinutes, goal: drill.goal,
    cueLevel: drill.cueLevel, coachingCues: drill.coachingCues.join(" · "),
    flowCues: drill.flowCues.join(" · "),
    innerDrill: clone(drill),
  };
}
