const DISCIPLINE_ALIASES = Object.freeze({
  bjj: "submission-grappling",
  grappling: "submission-grappling",
  submission: "submission-grappling",
  submissiongrappling: "submission-grappling",
  muaythai: "muay-thai"
});

export function normalizeParentDiscipline(value = "") {
  const key = String(value).trim().toLowerCase().replaceAll("_", "-");
  return DISCIPLINE_ALIASES[key] || key;
}

export function formatCombatDisciplineLabel(value = "") {
  const key = normalizeParentDiscipline(value);
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    "muay-thai": "Muay Thai",
    mma: "MMA",
    "submission-grappling": "Submission Grappling"
  };
  return labels[key] || key.split("-").filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function getParentAthleteDisciplineIds(athlete = {}) {
  return Array.from(new Set([
    ...(Array.isArray(athlete.disciplineIds) ? athlete.disciplineIds : []),
    ...Object.keys(athlete.disciplines || {}),
    athlete.activeDiscipline,
    athlete.primaryDiscipline,
    athlete.discipline,
    athlete.art
  ].map(normalizeParentDiscipline).filter(Boolean)));
}

export function resolveParentAthleteContext(athlete = {}, options = {}) {
  const athleteUid = String(athlete.id || athlete.uid || athlete.uidCode || options.athleteUid || "")
    .trim().toUpperCase();
  const disciplineIds = getParentAthleteDisciplineIds(athlete);
  const candidates = [
    options.requestedDiscipline,
    options.rememberedDiscipline,
    athlete.activeDiscipline,
    disciplineIds[0],
    athlete.primaryDiscipline,
    athlete.discipline,
    athlete.art
  ].map(normalizeParentDiscipline).filter(Boolean);
  const activeDiscipline = candidates.find((candidate) => disciplineIds.includes(candidate))
    || normalizeParentDiscipline(options.fallbackDiscipline || "");
  const disciplineRecordKey = Object.keys(athlete.disciplines || {})
    .find((key) => normalizeParentDiscipline(key) === activeDiscipline);
  return {
    athleteUid,
    disciplineIds,
    activeDiscipline,
    combat: activeDiscipline
      ? (athlete.disciplines?.[disciplineRecordKey || activeDiscipline] || athlete)
      : athlete
  };
}
