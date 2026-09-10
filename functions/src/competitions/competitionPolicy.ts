export const COMPETITION_EVENT_TYPE = "competition" as const;
export const COMPETITION_VISIBILITY = "internal" as const;
export const COMPETITION_TIME_ZONE = "America/Los_Angeles" as const;

export const COMPETITION_DISCIPLINES = Object.freeze([
  "wrestling", "boxing", "muay-thai", "mma", "submission-grappling", "strength-honor",
] as const);
export const COMPETITION_STATUSES = Object.freeze([
  "active", "cancelled", "completed", "archived",
] as const);
export const COMPETITION_TIME_PRECISIONS = Object.freeze(["date", "datetime"] as const);
export const COMPETITION_PUBLICATION_STATUSES = Object.freeze(["draft", "published"] as const);
export const ATHLETE_COMPETITION_STATUSES = Object.freeze(["targeted", "confirmed", "withdrawn"] as const);

export type CompetitionDisciplineId = typeof COMPETITION_DISCIPLINES[number];
export type CompetitionStatus = typeof COMPETITION_STATUSES[number];
export type CompetitionTimePrecision = typeof COMPETITION_TIME_PRECISIONS[number];
export type CompetitionPublicationStatus = typeof COMPETITION_PUBLICATION_STATUSES[number];
export type AthleteCompetitionStatus = typeof ATHLETE_COMPETITION_STATUSES[number];

export function athleteCompetitionEventId(athleteId: unknown, eventId: unknown): string {
  const athlete = cleanCompetitionValue(athleteId).toUpperCase();
  const event = cleanCompetitionValue(eventId);
  if (!athlete || !event) throw new Error("athleteId and eventId are required.");
  return `${athlete}__${event}`;
}

export type CompetitionEventInput = {
  eventId?: unknown;
  name?: unknown;
  disciplineId?: unknown;
  programScopes?: unknown;
  seasonYear?: unknown;
  startDate?: unknown;
  startAt?: unknown;
  endDate?: unknown;
  endAt?: unknown;
  timeZone?: unknown;
  timePrecision?: unknown;
  locationName?: unknown;
  address?: unknown;
  sanctionCard?: unknown;
  sanctionNote?: unknown;
  registrationUrl?: unknown;
  registrationDeadline?: unknown;
  ageGroups?: unknown;
  weightGroups?: unknown;
  locationIds?: unknown;
  teamIds?: unknown;
  status?: unknown;
  publicationStatus?: unknown;
  coachNotes?: unknown;
  parentNotes?: unknown;
  athleteNotes?: unknown;
  weighInAnchorTime?: unknown;
};

export function cleanCompetitionValue(value: unknown): string {
  return String(value ?? "").trim();
}

export function competitionAuditRole(role: unknown): "coach" | "management" | "admin" {
  const value = cleanCompetitionValue(role).toLowerCase();
  if (value === "coach") return "coach";
  if (value === "admin" || value === "system_admin") return "admin";
  return "management";
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanCompetitionValue).filter(Boolean))];
}

export function normalizeCompetitionDiscipline(value: unknown): CompetitionDisciplineId | "" {
  const normalized = cleanCompetitionValue(value).toLowerCase().replace(/[\s_]+/g, "-");
  const compatible = normalized === "kickboxing" ? "muay-thai" : normalized;
  return (COMPETITION_DISCIPLINES as readonly string[]).includes(compatible)
    ? compatible as CompetitionDisciplineId
    : "";
}

export function isIsoCalendarDate(value: unknown): value is string {
  const text = cleanCompetitionValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function competitionEventId(name: unknown, startDate: unknown): string {
  const date = cleanCompetitionValue(startDate);
  const slug = cleanCompetitionValue(name)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!isIsoCalendarDate(date) || !slug) throw new Error("A valid event name and startDate are required.");
  return `${date}-${slug}`;
}

export function normalizeCompetitionEvent(input: CompetitionEventInput) {
  const name = cleanCompetitionValue(input.name);
  const disciplineId = normalizeCompetitionDiscipline(input.disciplineId);
  const programScopes = uniqueStrings(input.programScopes).map(normalizeCompetitionDiscipline).filter(Boolean);
  const seasonYear = Number(input.seasonYear);
  const startDate = cleanCompetitionValue(input.startDate);
  const endDate = cleanCompetitionValue(input.endDate) || null;
  const timePrecision = cleanCompetitionValue(input.timePrecision || "date") as CompetitionTimePrecision;
  const status = cleanCompetitionValue(input.status || "active").toLowerCase() as CompetitionStatus;
  const publicationStatus = cleanCompetitionValue(input.publicationStatus || "draft").toLowerCase() as CompetitionPublicationStatus;
  const weighInAnchorTime = cleanCompetitionValue(input.weighInAnchorTime) || null;
  if (!name || !disciplineId || !programScopes.length) throw new Error("Name, discipline, and program scope are required.");
  if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2200) throw new Error("A valid seasonYear is required.");
  if (!isIsoCalendarDate(startDate) || (endDate && !isIsoCalendarDate(endDate)) || (endDate && endDate < startDate)) {
    throw new Error("Valid chronological startDate/endDate values are required.");
  }
  if (!(COMPETITION_TIME_PRECISIONS as readonly string[]).includes(timePrecision)) throw new Error("Invalid timePrecision.");
  if (!(COMPETITION_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid competition status.");
  if (!(COMPETITION_PUBLICATION_STATUSES as readonly string[]).includes(publicationStatus)) throw new Error("Invalid publication status.");
  if (timePrecision === "datetime" && !input.startAt) throw new Error("startAt is required for datetime precision.");
  const timeZone = cleanCompetitionValue(input.timeZone) || COMPETITION_TIME_ZONE;
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); }
  catch { throw new Error("Competition timeZone must be a valid IANA timezone."); }
  if (weighInAnchorTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(weighInAnchorTime)) throw new Error("weighInAnchorTime must use HH:MM.");
  return {
    eventId: cleanCompetitionValue(input.eventId) || competitionEventId(name, startDate),
    eventType: COMPETITION_EVENT_TYPE,
    visibility: COMPETITION_VISIBILITY,
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

export function staffCompetitionBucket(event: Record<string, unknown>, today: string, historyDays = 90): "upcoming" | "history" | "hidden" {
  if (!isIsoCalendarDate(today)) throw new Error("A valid comparison date is required.");
  const finalDate = cleanCompetitionValue(event.endDate) || cleanCompetitionValue(event.startDate);
  if (!isIsoCalendarDate(finalDate)) return "hidden";
  if (cleanCompetitionValue(event.status).toLowerCase() === "active" && finalDate >= today) return "upcoming";
  const daysPast = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${finalDate}T00:00:00Z`)) / 86400000);
  return daysPast <= historyDays ? "history" : "hidden";
}

export function isUpcomingCompetition(event: Record<string, unknown>, today: string): boolean {
  if (!isIsoCalendarDate(today)) throw new Error("A valid comparison date is required.");
  const status = cleanCompetitionValue(event.status).toLowerCase();
  const finalDate = cleanCompetitionValue(event.endDate) || cleanCompetitionValue(event.startDate);
  return status === "active" && isIsoCalendarDate(finalDate) && finalDate >= today;
}
