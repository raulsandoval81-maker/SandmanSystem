import { Timestamp } from "firebase-admin/firestore";

const LOMPOC_LOCATION_ID = "lompoc";
const SANTA_YNEZ_LOCATION_ID = "santa-ynez-valley";
const WRESTLING_DISCIPLINE_ID = "wrestling";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalize(value: unknown): string {
  return clean(value).toLowerCase().replace(/[\s_]+/g, "-");
}

function dateKeyInLosAngeles(value: unknown): string {
  if (!(value instanceof Timestamp)) return "";
  const date = value.toDate();
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDateKey(value: unknown): string {
  const key = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]) ? key : "";
}

function practiceRosterId(practice: Record<string, any>): string {
  const explicitRosterId = clean(practice.rosterId);
  if (explicitRosterId) return explicitRosterId;
  return ({
    "youth-z2h-wrestling": "youth-wrestling",
    "teen-p2l-wrestling": "teen-wrestling",
  } as Record<string, string>)[clean(practice.program)] || "";
}

export function isApprovedLompocVisitorForSantaYnez(args: {
  assignment: Record<string, any>;
  athlete: Record<string, any>;
  athleteId: string;
  practice: Record<string, any>;
  practiceDateKey: string;
  disciplineId: string;
}): boolean {
  const { assignment, athlete, athleteId, practice } = args;
  const practiceDateKey = validDateKey(args.practiceDateKey);
  if (!practiceDateKey || normalize(args.disciplineId) !== WRESTLING_DISCIPLINE_ID) return false;
  if (normalize(practice.locationId || practice.academyId) !== SANTA_YNEZ_LOCATION_ID) return false;
  if (normalize(athlete.locationId) !== LOMPOC_LOCATION_ID) return false;
  if (normalize(athlete.rosterStatus) !== "current") return false;

  if (!clean(assignment.athleteId) || clean(assignment.athleteId) !== athleteId) return false;
  if (normalize(assignment.homeLocationId) !== LOMPOC_LOCATION_ID) return false;
  if (normalize(assignment.hostLocationId) !== SANTA_YNEZ_LOCATION_ID) return false;
  if (normalize(assignment.status) !== "active" || !clean(assignment.approvedBy)) return false;
  const disciplineIds = Array.isArray(assignment.disciplineIds)
    ? assignment.disciplineIds.map(normalize).filter(Boolean) : [];
  if (!disciplineIds.includes(WRESTLING_DISCIPLINE_ID)) return false;

  const activeFrom = dateKeyInLosAngeles(assignment.activeFrom);
  if (!activeFrom || activeFrom > practiceDateKey) return false;
  if (assignment.activeTo !== null && assignment.activeTo !== undefined && assignment.activeTo !== "") {
    const activeTo = dateKeyInLosAngeles(assignment.activeTo);
    if (!activeTo || activeTo < practiceDateKey || activeTo < activeFrom) return false;
  }

  const assignmentRosterId = clean(assignment.rosterId);
  if (assignmentRosterId && assignmentRosterId !== practiceRosterId(practice)) return false;
  return true;
}

export function visitorDisciplineForCheckIn(practice: Record<string, any>): string {
  const discipline = normalize(practice.discipline);
  return discipline === "unassigned" && clean(practice.program) === "attendance-routed"
    ? WRESTLING_DISCIPLINE_ID
    : discipline;
}
