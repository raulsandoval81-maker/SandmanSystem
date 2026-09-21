export const LIFETIME_COMPONENT_MODES = Object.freeze([
  "wrestling",
  "boxing",
  "muay-thai",
  "submission-grappling",
  "mma",
  "strength",
  "honor",
]);

export const PUBLIC_LIFETIME_COMBAT_DISCIPLINES = Object.freeze([
  "wrestling",
  "boxing",
  "muay-thai",
]);

export const RANK_MODE_LABELS = Object.freeze({
  progression: "Combat Progression",
  lifetime: "Sandman Lifetime XP",
  wrestling: "Wrestling Lifetime XP",
  boxing: "Boxing Lifetime XP",
  "muay-thai": "Muay Thai Lifetime XP",
  "submission-grappling": "Submission Grappling Lifetime XP",
  mma: "MMA Lifetime XP",
  strength: "Strength Lifetime XP",
  honor: "Honor Lifetime XP",
});

function xp(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function canonicalAssignedDiscipline(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["muay thai", "muaythai", "muay-thai", "kickboxing"].includes(raw)) {
    return "muay-thai";
  }
  return raw;
}

export function assignedLifetimeCombatDisciplines(athlete = {}) {
  const assigned = [
    ...(Array.isArray(athlete.disciplineIds) ? athlete.disciplineIds : []),
    ...Object.keys(
      athlete.disciplines &&
      typeof athlete.disciplines === "object" &&
      !Array.isArray(athlete.disciplines)
        ? athlete.disciplines
        : {}
    ),
  ].map(canonicalAssignedDiscipline);

  return PUBLIC_LIFETIME_COMBAT_DISCIPLINES.filter((discipline) =>
    assigned.includes(discipline)
  );
}

export function lifetimeBreakdownFor(athlete = {}) {
  const assignedDisciplines = assignedLifetimeCombatDisciplines(athlete);
  return {
    lifetimeXp: xp(athlete.lifetimeXp),
    combatXp: xp(athlete.lifetimeCombatXp),
    disciplines: assignedDisciplines.map((discipline) => ({
      discipline,
      xp: xp(athlete.lifetimeCombatByDiscipline?.[discipline]),
    })),
    strengthXp: xp(athlete.lifetimeStrengthXp),
    honorXp: xp(athlete.lifetimeHonorXp),
  };
}

export function isLifetimeRankMode(mode) {
  return mode === "lifetime" || LIFETIME_COMPONENT_MODES.includes(mode);
}

export function isLifetimeComponentMode(mode) {
  return LIFETIME_COMPONENT_MODES.includes(mode);
}

export function isLifetimeCombatDisciplineMode(mode) {
  return PUBLIC_LIFETIME_COMBAT_DISCIPLINES.includes(mode);
}

export function leaderboardScore(athlete = {}, mode = "progression") {
  if (mode === "progression") return xp(athlete.xp);
  if (mode === "lifetime") return xp(athlete.lifetimeXp);
  if (mode === "strength") return xp(athlete.lifetimeStrengthXp);
  if (mode === "honor") return xp(athlete.lifetimeHonorXp);
  if (["wrestling", "boxing", "muay-thai", "submission-grappling", "mma"].includes(mode)) {
    return xp(athlete.lifetimeCombatByDiscipline?.[mode]);
  }
  return 0;
}
