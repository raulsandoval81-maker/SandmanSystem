export const CROSS_TRAINING_STAFF_ROLES = Object.freeze([
  "admin", "system_admin", "management", "manager", "location_manager", "coach",
]);

export function cleanScheduleValue(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeScheduleLocationId(value: unknown): string {
  return cleanScheduleValue(value).toLowerCase();
}

export function normalizeScheduleDisciplineId(value: unknown): string {
  const id = cleanScheduleValue(value).toLowerCase().replace(/_/g, "-").replace(/ /g, "-");
  return ({ bjj: "submission-grappling", grappling: "submission-grappling", submission: "submission-grappling", submissiongrappling: "submission-grappling", muaythai: "muay-thai" } as Record<string, string>)[id] || id;
}

export function athleteScheduleDisciplineIds(athlete: Record<string, any>): string[] {
  const mapped = athlete.disciplines && typeof athlete.disciplines === "object" && !Array.isArray(athlete.disciplines)
    ? Object.keys(athlete.disciplines) : [];
  const raw = [
    ...(Array.isArray(athlete.disciplineIds) ? athlete.disciplineIds : []),
    ...mapped,
    ...(Array.isArray(athlete.disciplines) ? athlete.disciplines : []),
    athlete.activeDiscipline, athlete.primaryDiscipline, athlete.discipline,
  ];
  const ids = new Set(raw.map(normalizeScheduleDisciplineId).filter(Boolean));
  if (ids.has("kickboxing") || ids.has("muay-thai")) {
    ids.add("kickboxing");
    ids.add("muay-thai");
  }
  return [...ids];
}

export function staffLocationIds(staff: Record<string, unknown>): string[] {
  const values = new Set<string>();
  for (const raw of [staff.locationIds, staff.locations, staff.locationId]) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      const locationId = normalizeScheduleLocationId(value);
      if (locationId) values.add(locationId);
    }
  }
  return [...values];
}

export function athleteHomeLocationId(athlete: Record<string, any>): string {
  const direct = normalizeScheduleLocationId(
    athlete.locationId || athlete.location?.id || athlete.academyLocationId
  );
  if (direct) return direct;
  const disciplines: Record<string, any> = athlete.disciplines && typeof athlete.disciplines === "object"
    ? athlete.disciplines : {};
  const active = cleanScheduleValue(athlete.activeDiscipline || athlete.primaryDiscipline);
  return normalizeScheduleLocationId(
    disciplines[active]?.locationId ||
    Object.values(disciplines).find((item) => item?.locationId)?.locationId
  );
}

export function canStaffManageCrossTraining(
  role: string,
  staff: Record<string, unknown>,
  homeLocationId: string,
  hostLocationId: string
): boolean {
  if (["admin", "system_admin"].includes(role)) return true;
  const locations = staffLocationIds(staff);
  if (["management", "manager", "location_manager"].includes(role)) {
    return locations.includes(homeLocationId);
  }
  return role === "coach" && locations.includes(hostLocationId);
}

export function crossTrainingAssignmentId(athleteId: string, hostLocationId: string, rosterId = ""): string {
  const roster = cleanScheduleValue(rosterId).replace(/[^A-Za-z0-9_-]/g, "_") || "general";
  return `${cleanScheduleValue(athleteId)}_${normalizeScheduleLocationId(hostLocationId)}_${roster}`;
}

export function canReadAthleteScheduleScope(
  callerUid: unknown,
  athleteAuthUid: unknown,
  activeParentUids: unknown[] = []
): boolean {
  const caller = cleanScheduleValue(callerUid);
  return Boolean(caller) && (
    caller === cleanScheduleValue(athleteAuthUid)
    || activeParentUids.map(cleanScheduleValue).includes(caller)
  );
}
