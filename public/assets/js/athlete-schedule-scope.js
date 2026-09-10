const clean = (value = "") => String(value || "").trim();

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeCrossTrainingAssignment(id, data = {}) {
  return {
    id: clean(id),
    athleteId: clean(data.athleteId || data.athleteUid),
    homeLocationId: clean(data.homeLocationId).toLowerCase(),
    hostLocationId: clean(data.hostLocationId).toLowerCase(),
    rosterId: clean(data.rosterId),
    disciplineIds: [...new Set([
      ...(Array.isArray(data.disciplineIds) ? data.disciplineIds : []),
      data.disciplineId,
    ].map(clean).filter(Boolean))],
    status: clean(data.status).toLowerCase(),
    approvedBy: clean(data.approvedBy),
    approvedByRole: clean(data.approvedByRole).toLowerCase(),
    activeFrom: data.activeFrom || null,
    activeTo: data.activeTo || null,
  };
}

export function isActiveCrossTrainingAssignment(assignment, now = new Date()) {
  if (!assignment || assignment.status !== "active") return false;
  if (!assignment.athleteId || !assignment.homeLocationId || !assignment.hostLocationId) return false;
  if (assignment.homeLocationId === assignment.hostLocationId) return false;
  const current = now instanceof Date ? now : new Date(now);
  const activeFrom = dateValue(assignment.activeFrom);
  const activeTo = dateValue(assignment.activeTo);
  return (!activeFrom || activeFrom <= current) && (!activeTo || activeTo >= current);
}

export function scheduleScopesForAthlete({ athleteId, homeLocationId, assignments = [], now = new Date() }) {
  const home = clean(homeLocationId).toLowerCase();
  const scopes = new Map();
  if (home) scopes.set(home, { locationId: home, kind: "home", disciplineIds: [] });
  for (const assignment of assignments) {
    if (assignment.athleteId !== clean(athleteId) || assignment.homeLocationId !== home) continue;
    if (!isActiveCrossTrainingAssignment(assignment, now)) continue;
    const previous = scopes.get(assignment.hostLocationId);
    const disciplineIds = new Set(previous?.disciplineIds || []);
    assignment.disciplineIds.forEach((id) => disciplineIds.add(id));
    scopes.set(assignment.hostLocationId, {
      locationId: assignment.hostLocationId,
      kind: "host",
      disciplineIds: [...disciplineIds],
    });
  }
  return [...scopes.values()];
}

export function mergeAthleteSchedules(scopedSchedules = []) {
  const first = scopedSchedules[0]?.schedule || {};
  const mergeRows = (key) => {
    const seen = new Set();
    return scopedSchedules.flatMap(({ schedule = {}, scope = {} }) =>
      (Array.isArray(schedule[key]) ? schedule[key] : []).map((row) => ({
        ...row,
        scheduleLocationId: schedule.locationId || scope.locationId || "",
        scheduleLocationName: schedule.locationName || scope.locationId || "",
        scheduleScope: scope.kind || "home",
      }))
    ).filter((row) => {
      const identity = [row.scheduleLocationId, row.day || row.date || "", row.start || row.label || row.time || "", row.title || ""]
        .join("|").toLowerCase();
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  };
  return {
    ...first,
    locationName: scopedSchedules.map(({ schedule }) => schedule?.locationName).filter(Boolean).join(" + "),
    weekly: mergeRows("weekly"),
    events: mergeRows("events"),
    banner: scopedSchedules.find(({ schedule }) => schedule?.banner?.active)?.schedule.banner || first.banner,
    status: scopedSchedules.some(({ schedule }) => schedule?.status === "published") ? "published" : "unpublished",
  };
}
