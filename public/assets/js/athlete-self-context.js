const normalizeAthleteId = (value) => String(value || "").trim().toUpperCase();
const preserveAthleteId = (value) => String(value || "").trim();
const ownsAthlete = (userUid, athleteId, athlete) => {
  if (!athlete) return false;
  const authUid = typeof athlete.authUid === "string" ? athlete.authUid.trim() : "";
  return authUid ? authUid === userUid : athlete.authUid == null && athleteId === userUid;
};

export async function resolveAuthenticatedAthlete({
  user,
  requestedId = "",
  rememberedId = "",
  getAthleteById,
  findAthletesByAuthUid,
} = {}) {
  if (!user?.uid || typeof getAthleteById !== "function" || typeof findAthletesByAuthUid !== "function") {
    return { athleteId: "", athlete: null, rejectedIds: [] };
  }

  const rejectedIds = [];
  const candidates = [...new Map([
    requestedId,
    rememberedId,
  ].map((value) => ({
    reportedId: normalizeAthleteId(value),
    lookups: [...new Set([
      preserveAthleteId(value),
      normalizeAthleteId(value),
    ].filter(Boolean))],
  })).filter(({ reportedId }) => reportedId).map((candidate) => [candidate.reportedId, candidate])).values()];

  for (const candidate of candidates) {
    for (const athleteId of candidate.lookups) {
      const athlete = await getAthleteById(athleteId);
      if (ownsAthlete(user.uid, athleteId, athlete)) {
        return { athleteId, athlete, rejectedIds };
      }
    }
    rejectedIds.push(candidate.reportedId);
  }

  const matches = await findAthletesByAuthUid(user.uid);
  const valid = (Array.isArray(matches) ? matches : [])
    .map((match) => ({
      athleteId: preserveAthleteId(match?.athleteId || match?.id),
      athlete: match?.athlete || match?.data || null,
    }))
    .filter((match) => match.athleteId && String(match.athlete?.authUid || "").trim() === user.uid);

  if (valid.length !== 1) {
    return { athleteId: "", athlete: null, rejectedIds, ambiguous: valid.length > 1 };
  }

  return { ...valid[0], rejectedIds };
}

export { normalizeAthleteId };
