import { normalizeStaffRecord } from "../services/staffAuthorization";

export const ADMIN_OVERSIGHT_LOCATIONS = Object.freeze([
  { locationId: "santa-ynez-valley", locationName: "Santa Ynez Valley" },
  { locationId: "lompoc", locationName: "Lompoc" },
  { locationId: "elk-grove", locationName: "Elk Grove" },
]);

type RecordData = Record<string, any>;
export type OversightRecord = { id: string; data: RecordData };

export type AdminOversightSources = {
  messages: OversightRecord[];
  leads: OversightRecord[];
  admissionsRequests: OversightRecord[];
  appointments: OversightRecord[];
  proposals: OversightRecord[];
  intakes: OversightRecord[];
  athletes: OversightRecord[];
  practices: OversightRecord[];
  attendance: OversightRecord[];
  schedules: OversightRecord[];
  scheduleDrafts: OversightRecord[];
  staff: OversightRecord[];
};

const clean = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const upper = (value: unknown) => clean(value).toUpperCase();

function locationIdOf(data: RecordData, fallback = ""): string {
  return clean(
    data.locationId ||
    data.academyLocationId ||
    data.academyId ||
    data.location?.id ||
    data.team?.locationId ||
    fallback
  );
}

function isTerminal(data: RecordData): boolean {
  return ["closed", "resolved", "declined", "cancelled", "canceled", "archived"]
    .includes(lower(data.messageStatus || data.requestStatus || data.status));
}

function accessMode(data: RecordData): string {
  const explicit = lower(data.access?.mode);
  if (["parent_managed", "hybrid", "self_managed"].includes(explicit)) return explicit;
  return clean(data.authUid) ? "unclassified" : "parent_managed";
}

function baseLocation(locationId: string, locationName: string) {
  return {
    locationId,
    locationName,
    inbox: { pending: 0, unassigned: 0, escalated: 0, totalOpen: 0 },
    pipeline: {
      leads: 0,
      admissionsRequests: 0,
      appointments: 0,
      proposals: 0,
      paidAwaitingIntake: 0,
      pendingIntakes: 0,
    },
    members: {
      total: 0,
      active: 0,
      inactive: 0,
      directAccessActive: 0,
      directAccessInactive: 0,
      parentManaged: 0,
      hybrid: 0,
      selfManaged: 0,
      unclassified: 0,
    },
    attendance: { openPractices: 0, pendingReview: 0, finalizedToday: 0, recentFinalized: 0 },
    schedule: { status: "missing", publishedAt: null as unknown, updatedAt: null as unknown },
    staffing: { management: [] as RecordData[], coaches: [] as RecordData[] },
    exceptions: { count: 0, categories: [] as RecordData[] },
  };
}

function isToday(value: any, now: number): boolean {
  const secondsMillis = Number(value?.seconds) * 1000;
  const parsedMillis = Date.parse(clean(value));
  const millis = typeof value?.toMillis === "function"
    ? value.toMillis()
    : Number.isFinite(secondsMillis)
      ? secondsMillis
      : parsedMillis;
  if (!Number.isFinite(millis)) return false;
  const target = new Date(millis);
  const today = new Date(now);
  return target.getFullYear() === today.getFullYear()
    && target.getMonth() === today.getMonth()
    && target.getDate() === today.getDate();
}

export function buildAdminOversightSummary(sources: AdminOversightSources, now = Date.now()) {
  const locations = new Map(
    ADMIN_OVERSIGHT_LOCATIONS.map(({ locationId, locationName }) => [locationId, baseLocation(locationId, locationName)])
  );
  const unknownBySource: Record<string, number> = {};
  const unknownRecords = new Set<string>();

  const markUnknown = (source: string, recordId: string) => {
    const key = `${source}:${recordId}`;
    if (unknownRecords.has(key)) return;
    unknownRecords.add(key);
    unknownBySource[source] = (unknownBySource[source] || 0) + 1;
  };

  const resolve = (source: string, record: OversightRecord, fallback = "") => {
    const locationId = locationIdOf(record.data, fallback);
    const location = locations.get(locationId);
    if (!location) markUnknown(source, record.id);
    return location;
  };

  for (const record of sources.messages) {
    const location = resolve("messages", record);
    if (!location || isTerminal(record.data)) continue;
    location.inbox.pending += 1;
    location.inbox.totalOpen += 1;
    if (!clean(record.data.assignedManagerUid)) location.inbox.unassigned += 1;
    const escalated = ["ESCALATED", "ADMIN_REVIEW", "PENDING_ADMIN"].includes(
      upper(record.data.routingStage || record.data.assignmentStatus)
    ) || ["urgent", "high"].includes(lower(record.data.priority));
    if (escalated) location.inbox.escalated += 1;
  }

  const countPipeline = (source: keyof AdminOversightSources, field: keyof ReturnType<typeof baseLocation>["pipeline"]) => {
    for (const record of sources[source]) {
      const location = resolve(String(source), record);
      if (location && !isTerminal(record.data)) location.pipeline[field] += 1;
    }
  };
  countPipeline("leads", "leads");
  countPipeline("admissionsRequests", "admissionsRequests");
  countPipeline("appointments", "appointments");
  countPipeline("proposals", "proposals");

  for (const record of sources.proposals) {
    const location = resolve("proposals", record);
    if (!location) continue;
    const paid = [record.data.status, record.data.paymentStatus, record.data.checkoutStatus]
      .some((value) => upper(value) === "PAID");
    if (paid && !["activated", "completed"].includes(lower(record.data.enrollmentStatus))) {
      location.pipeline.paidAwaitingIntake += 1;
    }
  }
  for (const record of sources.intakes) {
    const location = resolve("intakes", record);
    if (!location) continue;
    if (!["approved", "activated", "completed", "closed"].includes(lower(record.data.status))) {
      location.pipeline.pendingIntakes += 1;
    }
  }

  for (const record of sources.athletes) {
    const location = resolve("athletes", record);
    if (!location) continue;
    const inactive = record.data.active === false || ["inactive", "archived"].includes(lower(record.data.rosterStatus || record.data.memberStatus || record.data.status));
    const mode = accessMode(record.data);
    location.members.total += 1;
    location.members[inactive ? "inactive" : "active"] += 1;
    location.members[clean(record.data.authUid) ? "directAccessActive" : "directAccessInactive"] += 1;
    if (mode in location.members) (location.members as Record<string, number>)[mode] += 1;
  }

  const practices = new Map(sources.practices.map((record) => [record.id, record.data]));
  for (const record of sources.practices) {
    const location = resolve("practiceSessions", record);
    if (location && lower(record.data.status) === "active") location.attendance.openPractices += 1;
  }
  for (const record of sources.attendance) {
    const practice = practices.get(record.id) || {};
    const location = resolve("attendance_sessions", record, locationIdOf(practice));
    if (!location) continue;
    const status = lower(record.data.status);
    if (status === "pending_review") location.attendance.pendingReview += 1;
    if (status === "finalized") {
      location.attendance.recentFinalized += 1;
      if (isToday(record.data.finalizedAt, now)) location.attendance.finalizedToday += 1;
    }
  }

  for (const record of sources.schedules) {
    const location = resolve("paraSchedule", record, record.id);
    if (!location) continue;
    location.schedule = {
      status: lower(record.data.status) || "unpublished",
      publishedAt: record.data.publishedAt || null,
      updatedAt: record.data.updatedAt || null,
    };
  }
  for (const record of sources.scheduleDrafts) {
    const location = resolve("paraScheduleDrafts", record, record.id);
    if (location && location.schedule.status === "missing") {
      location.schedule.status = "draft";
      location.schedule.updatedAt = record.data.updatedAt || null;
    }
  }

  for (const record of sources.staff) {
    const staff: Record<string, any> = normalizeStaffRecord(record.data);
    if (staff.status !== "active" || !["management", "coach"].includes(staff.role)) continue;
    const identity = {
      uid: record.id,
      name: clean(staff.fullName || staff.displayName || record.id),
      role: staff.role,
      status: staff.status,
    };
    if (!staff.scope.locationIds.length) markUnknown("staff", record.id);
    for (const locationId of staff.scope.locationIds) {
      const location = locations.get(locationId);
      if (!location) {
        markUnknown("staff", record.id);
        continue;
      }
      (staff.role === "management" ? location.staffing.management : location.staffing.coaches).push(identity);
    }
  }

  for (const location of locations.values()) {
    const categories = [
      { code: "INBOX_ESCALATED", label: "Escalated messages", count: location.inbox.escalated, severity: "attention" },
      { code: "ATTENDANCE_PENDING", label: "Attendance awaiting review", count: location.attendance.pendingReview, severity: "attention" },
      { code: "SCHEDULE_NOT_PUBLISHED", label: "Schedule not published", count: location.schedule.status === "published" ? 0 : 1, severity: "warning" },
      { code: "NO_MANAGEMENT_ASSIGNED", label: "No active Management assigned", count: location.staffing.management.length ? 0 : 1, severity: "warning" },
      { code: "NO_COACH_ASSIGNED", label: "No active Coach assigned", count: location.staffing.coaches.length ? 0 : 1, severity: "warning" },
    ].filter((item) => item.count > 0);
    location.exceptions.categories = categories;
    location.exceptions.count = categories.reduce((sum, item) => sum + item.count, 0);
    location.staffing.management.sort((a, b) => a.name.localeCompare(b.name));
    location.staffing.coaches.sort((a, b) => a.name.localeCompare(b.name));
  }

  const unknownEntries = Object.entries(unknownBySource).map(([source, count]) => ({ source, count }));
  return {
    ok: true,
    generatedAt: now,
    locations: [...locations.values()],
    systemExceptions: {
      unknownLocationRecords: unknownEntries.reduce((sum, item) => sum + item.count, 0),
      bySource: unknownEntries,
    },
  };
}
