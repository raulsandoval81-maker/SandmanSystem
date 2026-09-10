"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CROSS_TRAINING_STAFF_ROLES = void 0;
exports.cleanScheduleValue = cleanScheduleValue;
exports.normalizeScheduleLocationId = normalizeScheduleLocationId;
exports.normalizeScheduleDisciplineId = normalizeScheduleDisciplineId;
exports.athleteScheduleDisciplineIds = athleteScheduleDisciplineIds;
exports.staffLocationIds = staffLocationIds;
exports.athleteHomeLocationId = athleteHomeLocationId;
exports.canStaffManageCrossTraining = canStaffManageCrossTraining;
exports.crossTrainingAssignmentId = crossTrainingAssignmentId;
exports.canReadAthleteScheduleScope = canReadAthleteScheduleScope;
exports.CROSS_TRAINING_STAFF_ROLES = Object.freeze([
    "admin", "system_admin", "management", "manager", "location_manager", "coach",
]);
function cleanScheduleValue(value) {
    return String(value ?? "").trim();
}
function normalizeScheduleLocationId(value) {
    return cleanScheduleValue(value).toLowerCase();
}
function normalizeScheduleDisciplineId(value) {
    const id = cleanScheduleValue(value).toLowerCase().replace(/_/g, "-").replace(/ /g, "-");
    return { bjj: "submission-grappling", grappling: "submission-grappling", submission: "submission-grappling", submissiongrappling: "submission-grappling", muaythai: "muay-thai" }[id] || id;
}
function athleteScheduleDisciplineIds(athlete) {
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
function staffLocationIds(staff) {
    const values = new Set();
    for (const raw of [staff.locationIds, staff.locations, staff.locationId]) {
        for (const value of Array.isArray(raw) ? raw : [raw]) {
            const locationId = normalizeScheduleLocationId(value);
            if (locationId)
                values.add(locationId);
        }
    }
    return [...values];
}
function athleteHomeLocationId(athlete) {
    const direct = normalizeScheduleLocationId(athlete.locationId || athlete.location?.id || athlete.academyLocationId);
    if (direct)
        return direct;
    const disciplines = athlete.disciplines && typeof athlete.disciplines === "object"
        ? athlete.disciplines : {};
    const active = cleanScheduleValue(athlete.activeDiscipline || athlete.primaryDiscipline);
    return normalizeScheduleLocationId(disciplines[active]?.locationId ||
        Object.values(disciplines).find((item) => item?.locationId)?.locationId);
}
function canStaffManageCrossTraining(role, staff, homeLocationId, hostLocationId) {
    if (["admin", "system_admin"].includes(role))
        return true;
    const locations = staffLocationIds(staff);
    if (["management", "manager", "location_manager"].includes(role)) {
        return locations.includes(homeLocationId);
    }
    return role === "coach" && locations.includes(hostLocationId);
}
function crossTrainingAssignmentId(athleteId, hostLocationId, rosterId = "") {
    const roster = cleanScheduleValue(rosterId).replace(/[^A-Za-z0-9_-]/g, "_") || "general";
    return `${cleanScheduleValue(athleteId)}_${normalizeScheduleLocationId(hostLocationId)}_${roster}`;
}
function canReadAthleteScheduleScope(callerUid, athleteAuthUid, activeParentUids = []) {
    const caller = cleanScheduleValue(callerUid);
    return Boolean(caller) && (caller === cleanScheduleValue(athleteAuthUid)
        || activeParentUids.map(cleanScheduleValue).includes(caller));
}
