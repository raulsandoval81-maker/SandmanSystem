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
  const candidatesById = new Map();
  for (const candidate of [
    requestedId,
    rememberedId,
  ].map((value) => ({
    reportedId: normalizeAthleteId(value),
    lookups: [...new Set([
      preserveAthleteId(value),
      normalizeAthleteId(value),
    ].filter(Boolean))],
  })).filter(({ reportedId }) => reportedId)) {
    // A remembered alias must never replace an explicit URL candidate.
    if (!candidatesById.has(candidate.reportedId)) candidatesById.set(candidate.reportedId, candidate);
  }
  const candidates = [...candidatesById.values()];

  for (const candidate of candidates) {
    for (const athleteId of candidate.lookups) {
      let athlete;
      try {
        athlete = await getAthleteById(athleteId);
      } catch (error) {
        // A poisoned link may name another protected record. Continue looking
        // for the signed-in athlete, but never hide network or server errors.
        if (!/permission-denied|insufficient permissions/i.test(String(error?.code || error?.message || ""))) throw error;
        continue;
      }
      if (ownsAthlete(user.uid, athleteId, athlete)) {
        return { athleteId, athlete, rejectedIds };
      }
    }
    rejectedIds.push(candidate.reportedId);
  }

  // Older Athlete documents can use the authenticated UID as their exact
  // Firestore document key without storing an authUid field. Recover by that
  // trusted UID after rejecting untrusted URL/storage IDs, before querying
  // authUid (which cannot find these legacy documents).
  //
  // Firestore IDs are case-sensitive: never uppercase the authenticated UID.
  try {
    const athlete = await getAthleteById(user.uid);
    if (ownsAthlete(user.uid, user.uid, athlete)) {
      return { athleteId: user.uid, athlete, rejectedIds };
    }
  } catch (error) {
    // A rules denial is not ownership evidence; do not hide other failures.
    if (!/permission-denied|insufficient permissions/i.test(String(error?.code || error?.message || ""))) throw error;
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
