import { HttpsError } from "firebase-functions/v2/https";
import { normalizeStaffRole, normalizeStaffStatus } from "../services/staffAuthorization";

export const COMMAND_CENTER_DIVISIONS = Object.freeze([
  "sandman_academy", "sandman_commercial", "sandman_digital_tools", "sandman_games",
  "shared_technology", "business_administration",
] as const);
export const COMMAND_CENTER_LIFECYCLE = Object.freeze([
  "backlog", "approved", "in_development", "in_review", "merged", "staging_verified",
  "production_released", "final_acceptance", "archived",
] as const);
export const COMMAND_CENTER_WORK_STATES = Object.freeze(["active", "blocked", "failed", "paused"] as const);
export const COMMAND_CENTER_PRIORITIES = Object.freeze(["critical", "high", "medium", "low"] as const);
export const COMMAND_CENTER_ENVIRONMENTS = Object.freeze([
  "not_applicable", "local", "development", "staging", "production",
] as const);
export const COMMAND_CENTER_MODULES = Object.freeze([
  "executive_overview", "projects_roadmaps", "development_releases", "unfinished_work",
  "testing_verification", "pending_decisions", "security_infrastructure", "executive_reports",
  "completed_archive",
] as const);
export const COMMAND_CENTER_EVIDENCE_TYPES = Object.freeze([
  "test", "pull_request", "staging_deployment", "production_deployment", "verification",
  "approval", "document",
] as const);

type Lifecycle = typeof COMMAND_CENTER_LIFECYCLE[number];
type WorkType = "engineering" | "non_engineering";
type Evidence = Readonly<{ id: string; type: string; label: string; result: string; url: string }>;

const ENGINEERING_TRANSITIONS: Record<Lifecycle, readonly Lifecycle[]> = {
  backlog: ["approved"], approved: ["in_development"], in_development: ["in_review"],
  in_review: ["merged"], merged: ["staging_verified"], staging_verified: ["production_released"],
  production_released: ["final_acceptance"], final_acceptance: [], archived: [],
};
const NON_ENGINEERING_TRANSITIONS: Record<Lifecycle, readonly Lifecycle[]> = {
  ...ENGINEERING_TRANSITIONS,
  in_review: ["final_acceptance"],
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

function stableId(value: unknown, field: string): string {
  const clean = cleanString(value, field, 120, true);
  if (!/^[A-Za-z0-9_-]+$/.test(clean)) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return clean;
}

function optionalRegistryProductId(value: unknown): string {
  const clean = cleanString(value, "productId", 120);
  if (clean && !/^[a-z0-9][a-z0-9-]*$/.test(clean)) {
    throw new HttpsError("invalid-argument", "productId must reference an existing registry slug.");
  }
  return clean;
}

function stringList(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) throw new HttpsError("invalid-argument", `${field} must be an array.`);
  if (value.length > maxItems) throw new HttpsError("invalid-argument", `${field} has too many entries.`);
  const values = value.map((item, index) => cleanString(item, `${field}[${index}]`, maxLength, true));
  if (new Set(values).size !== values.length) throw new HttpsError("invalid-argument", `${field} cannot contain duplicates.`);
  return values;
}

function validHttpsUrl(value: unknown, field: string): string {
  const clean = cleanString(value, field, 500);
  if (!clean) return "";
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new HttpsError("invalid-argument", `${field} must be a valid URL.`); }
  if (parsed.protocol !== "https:") throw new HttpsError("invalid-argument", `${field} must use HTTPS.`);
  return parsed.href;
}

function evidenceList(value: unknown, field: string): Evidence[] {
  if (!Array.isArray(value)) throw new HttpsError("invalid-argument", `${field} must be an array.`);
  if (value.length > 30) throw new HttpsError("invalid-argument", `${field} has too many entries.`);
  return value.map((item, index) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return Object.freeze({
      id: stableId(source.id, `${field}[${index}].id`),
      type: enumValue(source.type, COMMAND_CENTER_EVIDENCE_TYPES, `${field}[${index}].type`),
      result: enumValue(source.result, ["pass", "fail", "pending"] as const, `${field}[${index}].result`),
      label: cleanString(source.label, `${field}[${index}].label`, 240, true),
      url: validHttpsUrl(source.url, `${field}[${index}].url`),
    });
  });
}

function workBreakdown(value: unknown) {
  if (!Array.isArray(value)) throw new HttpsError("invalid-argument", "milestones must be an array.");
  if (value.length > 20) throw new HttpsError("invalid-argument", "milestones has too many entries.");
  return value.map((milestone, milestoneIndex) => {
    const source = milestone && typeof milestone === "object" ? milestone as Record<string, unknown> : {};
    if (!Array.isArray(source.sprints) || source.sprints.length > 20) throw new HttpsError("invalid-argument", `milestones[${milestoneIndex}].sprints is invalid.`);
    return Object.freeze({
      id: stableId(source.id, `milestones[${milestoneIndex}].id`),
      title: cleanString(source.title, `milestones[${milestoneIndex}].title`, 160, true),
      sprints: source.sprints.map((sprint, sprintIndex) => {
        const sprintSource = sprint && typeof sprint === "object" ? sprint as Record<string, unknown> : {};
        if (!Array.isArray(sprintSource.tasks) || sprintSource.tasks.length > 50) throw new HttpsError("invalid-argument", `sprints[${sprintIndex}].tasks is invalid.`);
        return Object.freeze({
          id: stableId(sprintSource.id, `sprints[${sprintIndex}].id`),
          title: cleanString(sprintSource.title, `sprints[${sprintIndex}].title`, 160, true),
          tasks: sprintSource.tasks.map((task, taskIndex) => {
            const taskSource = task && typeof task === "object" ? task as Record<string, unknown> : {};
            return Object.freeze({
              id: stableId(taskSource.id, `tasks[${taskIndex}].id`),
              title: cleanString(taskSource.title, `tasks[${taskIndex}].title`, 240, true),
              status: enumValue(taskSource.status, ["backlog", "ready", "in_progress", "blocked", "done"] as const, `tasks[${taskIndex}].status`),
              owner: cleanString(taskSource.owner, `tasks[${taskIndex}].owner`, 160),
              teamAssignments: stringList(taskSource.teamAssignments ?? [], `tasks[${taskIndex}].teamAssignments`, 20, 160),
              dependencies: stringList(taskSource.dependencies ?? [], `tasks[${taskIndex}].dependencies`, 30, 160),
              evidence: evidenceList(taskSource.evidence ?? [], `tasks[${taskIndex}].evidence`),
            });
          }),
        });
      }),
    });
  });
}

function approvalList(value: unknown) {
  if (!Array.isArray(value) || value.length > 30) throw new HttpsError("invalid-argument", "approvals is invalid.");
  return value.map((approval, index) => {
    const source = approval && typeof approval === "object" ? approval as Record<string, unknown> : {};
    return Object.freeze({
      id: stableId(source.id, `approvals[${index}].id`),
      decision: cleanString(source.decision, `approvals[${index}].decision`, 500, true),
      status: enumValue(source.status, ["pending", "approved", "rejected"] as const, `approvals[${index}].status`),
      owner: cleanString(source.owner, `approvals[${index}].owner`, 160, true),
      evidenceUrl: validHttpsUrl(source.evidenceUrl, `approvals[${index}].evidenceUrl`),
    });
  });
}

export function isCommandCenterOwnerStaff(staff: Record<string, unknown>): boolean {
  return normalizeStaffRole(staff.role) === "admin"
    && normalizeStaffStatus(staff.status) === "active"
    && staff.commandCenterOwner === true;
}

export function validateCommandCenterProject(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const lifecycleStatus = enumValue(source.lifecycleStatus, COMMAND_CENTER_LIFECYCLE, "lifecycleStatus");
  if (lifecycleStatus === "archived") throw new HttpsError("invalid-argument", "Use the archive action after final acceptance.");
  const workType = enumValue(source.workType, ["engineering", "non_engineering"] as const, "workType") as WorkType;
  const milestones = workBreakdown(source.milestones ?? []);
  const allEvidence = milestones.flatMap((milestone) => milestone.sprints.flatMap((sprint) => sprint.tasks.flatMap((task) => task.evidence)));
  const passed = (evidenceType: string) => allEvidence.some((item) => item.type === evidenceType && item.result === "pass");
  const prUrl = validHttpsUrl(source.prUrl, "prUrl");
  const environment = enumValue(source.environment, COMMAND_CENTER_ENVIRONMENTS, "environment");
  if (workType === "engineering") {
    if (["merged", "staging_verified", "production_released", "final_acceptance"].includes(lifecycleStatus)
      && (!passed("test") || !passed("pull_request") || !prUrl)) {
      throw new HttpsError("failed-precondition", "Merged and later engineering work requires passing test and pull-request evidence.");
    }
    if (["staging_verified", "production_released", "final_acceptance"].includes(lifecycleStatus)
      && (!passed("staging_deployment") || !passed("verification"))) {
      throw new HttpsError("failed-precondition", "Staging verified and later engineering work requires staging deployment and verification evidence.");
    }
    if (["production_released", "final_acceptance"].includes(lifecycleStatus)
      && (!passed("production_deployment") || environment !== "production")) {
      throw new HttpsError("failed-precondition", "Production released and later engineering work requires production deployment evidence.");
    }
  }
  if (lifecycleStatus === "final_acceptance" && !passed("verification")) {
    throw new HttpsError("failed-precondition", "Final acceptance requires passing verification evidence.");
  }
  return Object.freeze({
    title: cleanString(source.title, "title", 160, true),
    productId: optionalRegistryProductId(source.productId),
    productRegistrySchema: "sandman.umbrella.registry.v1",
    summary: cleanString(source.summary, "summary", 2000),
    division: enumValue(source.division, COMMAND_CENTER_DIVISIONS, "division"),
    module: enumValue(source.module, COMMAND_CENTER_MODULES, "module"),
    workType,
    lifecycleStatus,
    workState: enumValue(source.workState, COMMAND_CENTER_WORK_STATES, "workState"),
    priority: enumValue(source.priority, COMMAND_CENTER_PRIORITIES, "priority"),
    projectOwner: cleanString(source.projectOwner, "projectOwner", 160, true),
    teamAssignments: stringList(source.teamAssignments ?? [], "teamAssignments", 30, 160),
    dependencies: stringList(source.dependencies ?? [], "dependencies", 50, 200),
    approvals: approvalList(source.approvals ?? []),
    repository: cleanString(source.repository, "repository", 200, workType === "engineering"),
    branch: cleanString(source.branch, "branch", 240),
    prUrl,
    environment,
    blockers: stringList(source.blockers ?? [], "blockers", 20, 500),
    nextAction: cleanString(source.nextAction, "nextAction", 1000, true),
    milestones,
  });
}

export function assertCommandCenterTransition(previous: unknown, next: Lifecycle, workType: WorkType): void {
  if (previous == null) {
    if (next !== "backlog") throw new HttpsError("failed-precondition", "New work must begin in backlog.");
    return;
  }
  const current = enumValue(previous, COMMAND_CENTER_LIFECYCLE, "current lifecycle status");
  if (current === next) return;
  const transitions = workType === "engineering" ? ENGINEERING_TRANSITIONS : NON_ENGINEERING_TRANSITIONS;
  if (!transitions[current].includes(next)) {
    throw new HttpsError("failed-precondition", `Invalid ${workType} lifecycle transition: ${current} to ${next}.`);
  }
}

export function assertArchivable(status: unknown): void {
  if (status !== "final_acceptance") throw new HttpsError("failed-precondition", "Only final-acceptance work can be archived.");
}
