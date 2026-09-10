"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATHLETE_COMPETITION_STATUSES = exports.COMPETITION_PUBLICATION_STATUSES = exports.COMPETITION_TIME_PRECISIONS = exports.COMPETITION_STATUSES = exports.COMPETITION_DISCIPLINES = exports.COMPETITION_TIME_ZONE = exports.COMPETITION_VISIBILITY = exports.COMPETITION_EVENT_TYPE = void 0;
exports.athleteCompetitionEventId = athleteCompetitionEventId;
exports.cleanCompetitionValue = cleanCompetitionValue;
exports.competitionAuditRole = competitionAuditRole;
exports.normalizeCompetitionDiscipline = normalizeCompetitionDiscipline;
exports.isIsoCalendarDate = isIsoCalendarDate;
exports.competitionEventId = competitionEventId;
exports.normalizeCompetitionEvent = normalizeCompetitionEvent;
exports.staffCompetitionBucket = staffCompetitionBucket;
exports.isUpcomingCompetition = isUpcomingCompetition;
exports.COMPETITION_EVENT_TYPE = "competition";
exports.COMPETITION_VISIBILITY = "internal";
exports.COMPETITION_TIME_ZONE = "America/Los_Angeles";
exports.COMPETITION_DISCIPLINES = Object.freeze([
    "wrestling", "boxing", "muay-thai", "mma", "submission-grappling", "strength-honor",
]);
exports.COMPETITION_STATUSES = Object.freeze([
    "active", "cancelled", "completed", "archived",
]);
exports.COMPETITION_TIME_PRECISIONS = Object.freeze(["date", "datetime"]);
exports.COMPETITION_PUBLICATION_STATUSES = Object.freeze(["draft", "published"]);
exports.ATHLETE_COMPETITION_STATUSES = Object.freeze(["targeted", "confirmed", "withdrawn"]);
function athleteCompetitionEventId(athleteId, eventId) {
    const athlete = cleanCompetitionValue(athleteId).toUpperCase();
    const event = cleanCompetitionValue(eventId);
    if (!athlete || !event)
        throw new Error("athleteId and eventId are required.");
    return `${athlete}__${event}`;
}
function cleanCompetitionValue(value) {
    return String(value ?? "").trim();
}
function competitionAuditRole(role) {
    const value = cleanCompetitionValue(role).toLowerCase();
    if (value === "coach")
        return "coach";
    if (value === "admin" || value === "system_admin")
        return "admin";
    return "management";
}
function uniqueStrings(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(cleanCompetitionValue).filter(Boolean))];
}
function normalizeCompetitionDiscipline(value) {
    const normalized = cleanCompetitionValue(value).toLowerCase().replace(/[\s_]+/g, "-");
    const compatible = normalized === "kickboxing" ? "muay-thai" : normalized;
    return exports.COMPETITION_DISCIPLINES.includes(compatible)
        ? compatible
        : "";
}
function isIsoCalendarDate(value) {
    const text = cleanCompetitionValue(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
        return false;
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function competitionEventId(name, startDate) {
    const date = cleanCompetitionValue(startDate);
    const slug = cleanCompetitionValue(name)
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!isIsoCalendarDate(date) || !slug)
        throw new Error("A valid event name and startDate are required.");
    return `${date}-${slug}`;
}
function normalizeCompetitionEvent(input) {
    const name = cleanCompetitionValue(input.name);
    const disciplineId = normalizeCompetitionDiscipline(input.disciplineId);
    const programScopes = uniqueStrings(input.programScopes).map(normalizeCompetitionDiscipline).filter(Boolean);
    const seasonYear = Number(input.seasonYear);
    const startDate = cleanCompetitionValue(input.startDate);
    const endDate = cleanCompetitionValue(input.endDate) || null;
    const timePrecision = cleanCompetitionValue(input.timePrecision || "date");
    const status = cleanCompetitionValue(input.status || "active").toLowerCase();
    const publicationStatus = cleanCompetitionValue(input.publicationStatus || "draft").toLowerCase();
    const weighInAnchorTime = cleanCompetitionValue(input.weighInAnchorTime) || null;
    if (!name || !disciplineId || !programScopes.length)
        throw new Error("Name, discipline, and program scope are required.");
    if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2200)
        throw new Error("A valid seasonYear is required.");
    if (!isIsoCalendarDate(startDate) || (endDate && !isIsoCalendarDate(endDate)) || (endDate && endDate < startDate)) {
        throw new Error("Valid chronological startDate/endDate values are required.");
    }
    if (!exports.COMPETITION_TIME_PRECISIONS.includes(timePrecision))
        throw new Error("Invalid timePrecision.");
    if (!exports.COMPETITION_STATUSES.includes(status))
        throw new Error("Invalid competition status.");
    if (!exports.COMPETITION_PUBLICATION_STATUSES.includes(publicationStatus))
        throw new Error("Invalid publication status.");
    if (timePrecision === "datetime" && !input.startAt)
        throw new Error("startAt is required for datetime precision.");
    const timeZone = cleanCompetitionValue(input.timeZone) || exports.COMPETITION_TIME_ZONE;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    }
    catch {
        throw new Error("Competition timeZone must be a valid IANA timezone.");
    }
    if (weighInAnchorTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(weighInAnchorTime))
        throw new Error("weighInAnchorTime must use HH:MM.");
    return {
        eventId: cleanCompetitionValue(input.eventId) || competitionEventId(name, startDate),
        eventType: exports.COMPETITION_EVENT_TYPE,
        visibility: exports.COMPETITION_VISIBILITY,
        name,
        disciplineId,
        programScopes,
        seasonYear,
        startDate,
        startAt: timePrecision === "date" ? null : input.startAt,
        endDate,
        endAt: timePrecision === "date" ? null : input.endAt || null,
        timeZone,
        timePrecision,
        locationName: cleanCompetitionValue(input.locationName),
        address: cleanCompetitionValue(input.address),
        sanctionCard: cleanCompetitionValue(input.sanctionCard) || null,
        sanctionNote: cleanCompetitionValue(input.sanctionNote) || null,
        registrationUrl: cleanCompetitionValue(input.registrationUrl) || null,
        registrationDeadline: cleanCompetitionValue(input.registrationDeadline) || null,
        ageGroups: uniqueStrings(input.ageGroups),
        weightGroups: uniqueStrings(input.weightGroups),
        locationIds: uniqueStrings(input.locationIds),
        teamIds: uniqueStrings(input.teamIds),
        status,
        publicationStatus,
        coachNotes: cleanCompetitionValue(input.coachNotes),
        parentNotes: cleanCompetitionValue(input.parentNotes),
        athleteNotes: cleanCompetitionValue(input.athleteNotes),
        weighInAnchorTime,
    };
}
function staffCompetitionBucket(event, today, historyDays = 90) {
    if (!isIsoCalendarDate(today))
        throw new Error("A valid comparison date is required.");
    const finalDate = cleanCompetitionValue(event.endDate) || cleanCompetitionValue(event.startDate);
    if (!isIsoCalendarDate(finalDate))
        return "hidden";
    if (cleanCompetitionValue(event.status).toLowerCase() === "active" && finalDate >= today)
        return "upcoming";
    const daysPast = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${finalDate}T00:00:00Z`)) / 86400000);
    return daysPast <= historyDays ? "history" : "hidden";
}
function isUpcomingCompetition(event, today) {
    if (!isIsoCalendarDate(today))
        throw new Error("A valid comparison date is required.");
    const status = cleanCompetitionValue(event.status).toLowerCase();
    const finalDate = cleanCompetitionValue(event.endDate) || cleanCompetitionValue(event.startDate);
    return status === "active" && isIsoCalendarDate(finalDate) && finalDate >= today;
}
