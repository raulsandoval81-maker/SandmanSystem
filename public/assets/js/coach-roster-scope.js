const clean = (value) => String(value || "").trim();
const list = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value) ? [clean(value)] : [];

export function classifyCoachAthleteScope(context = {}, athlete = {}) {
  if (context.isSystemAdmin) return { included: true, reason: "admin" };

  const coachUid = clean(context.uid);
  const locations = list(context.scope?.locationIds);
  const athleteLocation = clean(athlete.locationId);
  const coachIds = list(athlete.coachIds);
  const legacyCoachUid = clean(athlete.coachUid);

  if (coachUid && (coachIds.includes(coachUid) || legacyCoachUid === coachUid)) {
    return { included: true, reason: "coach-assignment" };
  }
  if (athleteLocation && locations.includes(athleteLocation)) {
    return { included: true, reason: "location" };
  }
  if (!athleteLocation && !coachIds.length && !legacyCoachUid) {
    return { included: false, reason: "unassigned-legacy" };
  }
  return { included: false, reason: "outside-scope" };
}

export function scopeCoachRoster(context, athletes = []) {
  return athletes.reduce((result, row) => {
    const classification = classifyCoachAthleteScope(context, row.athlete || row.data || {});
    const item = { ...row, scopeReason: classification.reason };
    if (classification.included) result.athletes.push(item);
    else if (classification.reason === "unassigned-legacy") result.unassigned.push(item);
    return result;
  }, { athletes: [], unassigned: [] });
}
