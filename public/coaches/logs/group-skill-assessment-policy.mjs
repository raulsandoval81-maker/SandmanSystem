// Post-Practice Clipboard — pure group Skill Check draft policy.
// This module prepares proposed observations only. It never verifies skills,
// changes athlete records, awards XP, or authorizes automatic progression.
export const SKILL_STAGES = Object.freeze([
  "NOT_INTRODUCED", "LEARNED", "APPLIED", "MASTERED", "REFINED"
]);

const norm = value => String(value ?? "").trim().toUpperCase();

export function prepareGroupSkillAssessment({
  athleteIds = [], checkedInIds = [], familyId = "",
  defaultStage = "", exceptions = {}, excludedIds = [],
} = {}) {
  const roster = athleteIds.map(norm);
  const checkedIn = new Set(checkedInIds.map(norm));
  const excluded = new Set(excludedIds.map(norm));
  const exceptionMap = new Map(Object.entries(exceptions).map(([id, stage]) => [norm(id), norm(stage)]));
  const stage = norm(defaultStage);
  const family = String(familyId).trim();
  const blockers = [];

  if (!family || family.includes("/") || family.length > 100) blockers.push("A valid canonical skill family is required.");
  if (!roster.length || roster.length > 30 || new Set(roster).size !== roster.length || roster.some(id => !/^[A-Z0-9_-]+$/.test(id))) {
    blockers.push("A unique group of 1–30 valid athletes is required.");
  }
  if (!SKILL_STAGES.includes(stage)) blockers.push("A valid proposed skill stage is required.");
  if (roster.some(id => !checkedIn.has(id))) blockers.push("Every included group athlete must be checked in.");
  if ([...excluded, ...exceptionMap.keys()].some(id => !roster.includes(id))) {
    blockers.push("Exceptions and exclusions must belong to the selected group.");
  }
  if ([...exceptionMap.values()].some(value => !SKILL_STAGES.includes(value))) {
    blockers.push("Every individual exception needs a valid skill stage.");
  }
  const observations = blockers.length ? [] : roster
    .filter(id => !excluded.has(id))
    .map(athleteId => ({
      athleteId, familyId: family, proposedStage: exceptionMap.get(athleteId) || stage,
      individuallyAdjusted: exceptionMap.has(athleteId),
    }));
  return {
    ok: blockers.length === 0,
    blockers,
    observations,
    excludedAthleteIds: roster.filter(id => excluded.has(id)),
    draftOnly: true,
    attendanceFinalized: false,
    skillVerified: false,
    xpAwarded: false,
    autoEligible: false,
  };
}
