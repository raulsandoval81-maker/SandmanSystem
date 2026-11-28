// Routing decisions are only made after resolveSignedInAthlete verifies ownership.
// Do not use a URL parameter or remembered ID as proof of athlete identity.
const code = value => {
  const raw = value && typeof value === "object"
    ? value.code || value.name || value.slug || value.value || ""
    : value;
  return String(raw || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
};

export function athleteJourney(athlete = {}) {
  const values = [athlete.programTrack, athlete.journey, athlete.track, athlete.trackCode, athlete.program];
  const known = new Set(["road2champion", "r2c", "z2h", "zero2hero", "path2legend", "p2l", "quest2mastery", "q2m"]);
  return values.map(code).find(value => known.has(value)) || "";
}

export function athleteExperience(athlete = {}, verifiedId = "") {
  const journey = athleteJourney(athlete);
  if (["road2champion", "r2c", "z2h", "zero2hero"].includes(journey)) return "mini";
  if (["path2legend", "p2l", "quest2mastery", "q2m"].includes(journey)) return "full";
  // Legacy prefix fallback only after the caller has verified the athlete record.
  const id = String(verifiedId).toUpperCase();
  if (id.startsWith("F8_")) return "mini";
  if (id.startsWith("F4_")) return "full";
  return "";
}

export function athleteProfilePage(athlete = {}, verifiedId = "") {
  if (athleteExperience(athlete, verifiedId) === "mini") return "/athletes/profile/mini-profile.html";
  const journey = athleteJourney(athlete);
  const profileType = code(athlete.profileType);
  const discipline = code(athlete.art || athlete.primaryDiscipline || athlete.discipline);
  if (["quest2mastery", "q2m"].includes(journey) || profileType === "adult" || discipline === "mma") {
    return "/athletes/profile/adult-profile.html";
  }
  return "/athletes/profile/athlete-profile.html";
}

export function athleteArsenalPage(athlete = {}, verifiedId = "") {
  const experience = athleteExperience(athlete, verifiedId);
  return experience === "mini" ? "/athletes/arsenal/mini-arsenal.html"
    : experience === "full" ? "/athletes/arsenal/arsenal.html" : "";
}

export function canonicalAthleteHref(path, verifiedId, discipline = "") {
  const params = new URLSearchParams({ id: verifiedId });
  if (discipline && /^[a-z0-9_-]{1,40}$/i.test(discipline)) params.set("discipline", discipline);
  return path + "?" + params.toString();
}

export function persistVerifiedAthleteId(id) {
  const value = String(id || "").trim();
  if (!value) return;
  for (const key of ["sandman_lastAthleteUid", "currentAthleteId"]) {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  }
}

export function clearUnverifiedAthleteId() {
  for (const key of ["sandman_lastAthleteUid", "currentAthleteId"]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
