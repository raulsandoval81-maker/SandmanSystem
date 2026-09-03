const normalizeAthleteId = (value) => String(value || "").trim().toUpperCase();

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
  const candidates = [...new Set([
    normalizeAthleteId(requestedId),
    normalizeAthleteId(rememberedId),
  ].filter(Boolean))];

  for (const athleteId of candidates) {
    const athlete = await getAthleteById(athleteId);
    if (athlete && String(athlete.authUid || "").trim() === user.uid) {
      return { athleteId, athlete, rejectedIds };
    }
    rejectedIds.push(athleteId);
  }

  const matches = await findAthletesByAuthUid(user.uid);
  const valid = (Array.isArray(matches) ? matches : [])
    .map((match) => ({
      athleteId: normalizeAthleteId(match?.athleteId || match?.id),
      athlete: match?.athlete || match?.data || null,
    }))
    .filter((match) => match.athleteId && String(match.athlete?.authUid || "").trim() === user.uid);

  if (valid.length !== 1) {
    return { athleteId: "", athlete: null, rejectedIds, ambiguous: valid.length > 1 };
  }

  return { ...valid[0], rejectedIds };
}

export { normalizeAthleteId };
