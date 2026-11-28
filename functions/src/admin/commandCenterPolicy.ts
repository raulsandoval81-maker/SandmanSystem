import { HttpsError } from "firebase-functions/v2/https";
import { normalizeStaffRole, normalizeStaffStatus } from "../services/staffAuthorization";

export const COMMAND_CENTER_STATUSES = Object.freeze([
  "planned", "in_progress", "blocked", "built", "tested", "merged", "deployed", "verified", "archived",
] as const);
export const COMMAND_CENTER_PRIORITIES = Object.freeze(["critical", "high", "medium", "low"] as const);
export const COMMAND_CENTER_ENVIRONMENTS = Object.freeze([
  "not_applicable", "local", "development", "staging", "production",
] as const);
export const COMMAND_CENTER_MODULES = Object.freeze([
  "executive_overview", "projects_roadmaps", "development_releases", "recovery_queue",
  "testing_verification", "approvals_decisions", "completed_archive",
] as const);
export const COMMAND_CENTER_EVIDENCE_TYPES = Object.freeze([
  "test", "pull_request", "deployment", "verification", "decision",
] as const);

type ProjectStatus = typeof COMMAND_CENTER_STATUSES[number];
type Evidence = Readonly<{ type: string; label: string; result: string; url: string }>;

const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  planned: ["in_progress", "blocked"],
  in_progress: ["built", "blocked"],
  blocked: ["planned", "in_progress", "built"],
  built: ["tested", "blocked"],
  tested: ["merged", "blocked"],
  merged: ["deployed", "blocked"],
  deployed: ["verified", "blocked"],
  verified: [],
  archived: [],
};

function cleanString(value: unknown, field: string, max: number, required = false): string {
  const clean = String(value ?? "").trim();
  if (required && !clean) throw new HttpsError("invalid-argument", `${field} is required.`);
  if (clean.length > max) throw new HttpsError("invalid-argument", `${field} is too long.`);
  return clean;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  const clean = cleanString(value, field, 80, true);
  if (!allowed.includes(clean)) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return clean as T[number];
}

function stringList(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) throw new HttpsError("invalid-argument", `${field} must be an array.`);
  if (value.length > maxItems) throw new HttpsError("invalid-argument", `${field} has too many entries.`);
  return value.map((item, index) => cleanString(item, `${field}[${index}]`, maxLength, true));
}

function validHttpsUrl(value: unknown, field: string): string {
  const clean = cleanString(value, field, 500);
  if (!clean) return "";
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new HttpsError("invalid-argument", `${field} must be a valid URL.`); }
  if (parsed.protocol !== "https:") throw new HttpsError("invalid-argument", `${field} must use HTTPS.`);
  return parsed.href;
}

function evidenceList(value: unknown): Evidence[] {
  if (!Array.isArray(value)) throw new HttpsError("invalid-argument", "testEvidence must be an array.");
  if (value.length > 30) throw new HttpsError("invalid-argument", "testEvidence has too many entries.");
  return value.map((item, index) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const type = enumValue(source.type, COMMAND_CENTER_EVIDENCE_TYPES, `testEvidence[${index}].type`);
    const result = enumValue(source.result, ["pass", "fail", "pending"] as const, `testEvidence[${index}].result`);
    return {
      type,
      result,
      label: cleanString(source.label, `testEvidence[${index}].label`, 240, true),
      url: validHttpsUrl(source.url, `testEvidence[${index}].url`),
    };
  });
}

export function isCommandCenterOwnerStaff(staff: Record<string, unknown>): boolean {
  return normalizeStaffRole(staff.role) === "admin"
    && normalizeStaffStatus(staff.status) === "active"
    && staff.commandCenterOwner === true;
}

export function validateCommandCenterProject(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const status = enumValue(source.status, COMMAND_CENTER_STATUSES, "status");
  if (status === "archived") throw new HttpsError("invalid-argument", "Use the archive action after verification.");
  const evidence = evidenceList(source.testEvidence ?? []);
  const prUrl = validHttpsUrl(source.prUrl, "prUrl");
  const environment = enumValue(source.environment, COMMAND_CENTER_ENVIRONMENTS, "environment");
  const passed = (type?: string) => evidence.some((item) => item.result === "pass" && (!type || item.type === type));
  if (["tested", "merged", "deployed", "verified"].includes(status) && !passed("test")) {
    throw new HttpsError("failed-precondition", "Tested and later statuses require passing test evidence.");
  }
  if (["merged", "deployed", "verified"].includes(status) && !prUrl) {
    throw new HttpsError("failed-precondition", "Merged and later statuses require a pull request URL.");
  }
  if (["deployed", "verified"].includes(status) && (!passed("deployment") || !["staging", "production"].includes(environment))) {
    throw new HttpsError("failed-precondition", "Deployed and later statuses require deployment evidence and a deployed environment.");
  }
  if (status === "verified" && !passed("verification")) {
    throw new HttpsError("failed-precondition", "Verified status requires passing verification evidence.");
  }
  return Object.freeze({
    title: cleanString(source.title, "title", 160, true),
    summary: cleanString(source.summary, "summary", 2000),
    module: enumValue(source.module, COMMAND_CENTER_MODULES, "module"),
    status,
    priority: enumValue(source.priority, COMMAND_CENTER_PRIORITIES, "priority"),
    repository: cleanString(source.repository, "repository", 200, true),
    branch: cleanString(source.branch, "branch", 240),
    prUrl,
    environment,
    testEvidence: evidence,
    blockers: stringList(source.blockers ?? [], "blockers", 20, 500),
    nextAction: cleanString(source.nextAction, "nextAction", 1000, true),
  });
}

export function assertCommandCenterTransition(previous: unknown, next: ProjectStatus): void {
  if (previous == null) {
    if (!["planned", "in_progress", "blocked"].includes(next)) {
      throw new HttpsError("failed-precondition", "New work must start planned, in progress, or blocked.");
    }
    return;
  }
  const current = enumValue(previous, COMMAND_CENTER_STATUSES, "current status");
  if (current === next) return;
  if (!TRANSITIONS[current].includes(next)) {
    throw new HttpsError("failed-precondition", `Invalid status transition: ${current} to ${next}.`);
  }
}

export function assertArchivable(status: unknown): void {
  if (status !== "verified") throw new HttpsError("failed-precondition", "Only verified work can enter the completed archive.");
}
