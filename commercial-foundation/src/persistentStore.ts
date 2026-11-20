import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AuditEvent, Organization, VerifiedIdentity } from "./contracts";
import { InMemoryCommercialStore, StoreKind, TenantRecord } from "./foundation";
import { assertId, validateEntitlement, validateMembership, validateProgram } from "./validation";

interface PersistedState {
  schema: "sandman.commercial.local-store.v1";
  organizations: Organization[];
  academies: TenantRecord[]; locations: TenantRecord[]; programs: TenantRecord[];
  memberships: TenantRecord[]; entitlements: TenantRecord[]; sessions: TenantRecord[]; athletes: TenantRecord[]; attendance: TenantRecord[]; practiceNotes: TenantRecord[]; audits: AuditEvent[];
}

/**
 * Durable local reference adapter for isolated development and restart tests.
 * It atomically replaces one mode-0600 JSON file and never connects to Firebase.
 * This single-process adapter is not a production database or concurrency boundary.
 */
export class PersistentJsonCommercialStore extends InMemoryCommercialStore {
  readonly filePath: string;
  private inTransaction = false;
  constructor(filePath: string) {
    super();
    this.filePath = resolve(filePath);
    if (!existsSync(dirname(this.filePath))) throw new Error("PERSISTENCE_DIRECTORY_NOT_FOUND");
    if (existsSync(this.filePath)) this.load();
  }
  private load(): void {
    const state = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedState;
    if (state.schema !== "sandman.commercial.local-store.v1") throw new Error("INVALID_PERSISTENCE_SCHEMA");
    if (![state.organizations, state.academies, state.locations, state.programs, state.memberships, state.entitlements, state.sessions, state.athletes, state.attendance, state.practiceNotes, state.audits].every(Array.isArray)) throw new Error("INVALID_PERSISTENCE_SHAPE");
    for (const record of state.organizations) { assertId(record.id); if (!record.displayName?.trim() || !["active","suspended","archived"].includes(record.state)) throw new Error("INVALID_PERSISTED_ORGANIZATION"); super.createOrganization(record); }
    for (const record of state.academies as TenantRecord[]) { assertId(record.id); assertId(record.organizationId,"organizationId"); if (!this.getOrganization(record.organizationId)) throw new Error("INVALID_PERSISTED_TENANT_REFERENCE"); super.put("academies",record); }
    for (const record of state.locations as TenantRecord[]) { assertId(record.id); const value = record as import("./contracts").Location; if (!this.get<import("./contracts").Academy>("academies",value.organizationId,value.academyId)) throw new Error("INVALID_PERSISTED_ACADEMY_REFERENCE"); super.put("locations",record); }
    for (const record of state.programs as TenantRecord[]) { validateProgram(record as import("./contracts").Program); super.put("programs",record); }
    for (const record of state.memberships as TenantRecord[]) { validateMembership(record as import("./contracts").Membership); super.put("memberships",record); }
    for (const record of state.entitlements as TenantRecord[]) { validateEntitlement(record as import("./contracts").Entitlement); super.put("entitlements",record); }
    for (const record of state.sessions as TenantRecord[]) super.put("sessions", record);
    for (const record of state.athletes as TenantRecord[]) super.put("athletes", record);
    for (const record of state.attendance as TenantRecord[]) super.put("attendance", record);
    for (const record of state.practiceNotes as TenantRecord[]) super.put("practiceNotes", record);
    // Loading is fail-closed: every child and authorization scope must resolve inside its own tenant.
    for (const academy of this.academies.values()) {
      if (!this.getOrganization(academy.organizationId) || !academy.name?.trim() || !["active", "suspended", "archived"].includes(academy.state)) throw new Error("INVALID_PERSISTED_ACADEMY");
    }
    for (const location of this.locations.values()) {
      const parent = this.get<import("./contracts").Academy>("academies", location.organizationId, location.academyId);
      if (!parent || !location.name?.trim() || !["active", "suspended", "archived"].includes(location.state)) throw new Error("INVALID_PERSISTED_LOCATION");
    }
    for (const program of this.programs.values()) {
      const academy = this.get<import("./contracts").Academy>("academies", program.organizationId, program.academyId);
      if (!academy || program.locationIds.some(id => {
        const location = this.get<import("./contracts").Location>("locations", program.organizationId, id);
        return !location || location.academyId !== program.academyId;
      }) || !["active", "suspended", "archived"].includes(program.state)) throw new Error("INVALID_PERSISTED_PROGRAM_REFERENCE");
    }
    for (const member of this.memberships.values()) {
      if (!this.getOrganization(member.organizationId)) throw new Error("INVALID_PERSISTED_MEMBERSHIP_ORGANIZATION");
      if (member.scopeType === "academy" && !this.get("academies", member.organizationId, member.scopeId)) throw new Error("INVALID_PERSISTED_MEMBERSHIP_SCOPE");
      if (member.scopeType === "location" && !this.get("locations", member.organizationId, member.scopeId)) throw new Error("INVALID_PERSISTED_MEMBERSHIP_SCOPE");
    }
    for (const grant of this.entitlements.values()) {
      if (!this.getOrganization(grant.organizationId)) throw new Error("INVALID_PERSISTED_ENTITLEMENT_ORGANIZATION");
    }
    for (const session of this.sessions.values()) {
      const academy = this.get("academies", session.organizationId, session.academyId) as import("./contracts").Academy | undefined;
      const location = this.get("locations", session.organizationId, session.locationId) as import("./contracts").Location | undefined;
      const program = this.get("programs", session.organizationId, session.programId) as import("./contracts").Program | undefined;
      if (!academy || !location || !program || location.academyId !== academy.id || program.academyId !== academy.id || !program.locationIds.includes(location.id)) throw new Error("INVALID_PERSISTED_SESSION_REFERENCE");
    }
    for (const athlete of this.athletes.values()) {
      const program = this.get<import("./contracts").Program>("programs", athlete.organizationId, athlete.programId);
      if (!program || athlete.synthetic !== true || typeof athlete.displayName !== "string" || !athlete.displayName.trim()) throw new Error("INVALID_PERSISTED_ATHLETE_REFERENCE");
    }
    const validDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
    for (const session of this.sessions.values()) {
      if (!["scheduled", "completed", "cancelled"].includes(session.state) || !validDate(session.startsAt) || !validDate(session.endsAt) || Date.parse(session.endsAt) <= Date.parse(session.startsAt) ||
        !Array.isArray(session.coachUserIds) || !session.coachUserIds.length || new Set(session.coachUserIds).size !== session.coachUserIds.length ||
        session.coachUserIds.some(userId => typeof userId !== "string" || !this.list<import("./contracts").Membership>("memberships", session.organizationId).some(m =>
          m.userId === userId && m.role === "coach" && (m.scopeType === "organization" || (m.scopeType === "academy" && m.scopeId === session.academyId) || (m.scopeType === "location" && m.scopeId === session.locationId))))) {
        throw new Error("INVALID_PERSISTED_SESSION_STATE");
      }
    }
    for (const attendance of this.attendance.values()) {
      const session = this.get<import("./contracts").PracticeSession>("sessions", attendance.organizationId, attendance.sessionId);
      const athlete = this.get<import("./contracts").CommercialAthlete>("athletes", attendance.organizationId, attendance.athleteId);
      if (!session || !athlete || athlete.programId !== session.programId) throw new Error("INVALID_PERSISTED_ATTENDANCE_REFERENCE");
      if (attendance.id !== `${attendance.sessionId}--${attendance.athleteId}` || !["present", "absent", "excused"].includes(attendance.state) ||
        typeof attendance.recordedByUserId !== "string" || !attendance.recordedByUserId || !validDate(attendance.recordedAt) ||
        (attendance.correctedAt !== undefined && !validDate(attendance.correctedAt))) throw new Error("INVALID_PERSISTED_ATTENDANCE_STATE");
    }
    for (const note of this.practiceNotes.values()) {
      const session = this.get<import("./contracts").PracticeSession>("sessions", note.organizationId, note.sessionId);
      if (!session) throw new Error("INVALID_PERSISTED_NOTE_REFERENCE");
      if (typeof note.authorUserId !== "string" || !note.authorUserId || typeof note.body !== "string" || !note.body.trim() || note.body.length > 2000 || !validDate(note.createdAt)) throw new Error("INVALID_PERSISTED_NOTE_STATE");
    }
    if (state.audits.some(event => !event || typeof event.id !== "string" || !/^audit-[1-9][0-9]*$/.test(event.id) || !this.getOrganization(event.selectedOrganizationId) ||
      typeof event.actorUserId !== "string" || !["permitted", "rejected"].includes(event.outcome))) throw new Error("INVALID_PERSISTED_AUDIT");
    if (new Set(state.audits.map(event => event.id)).size !== state.audits.length) throw new Error("DUPLICATE_PERSISTED_AUDIT");
    this.audits = state.audits.map(event => structuredClone(event));
    this.sequence = this.audits.reduce((max, event) => Math.max(max, Number(event.id.replace(/^audit-/, "")) || 0), 0);
  }
  private flush(): void {
    const state: PersistedState = {
      schema: "sandman.commercial.local-store.v1",
      organizations: [...this.organizations.values()],
      academies: [...this.academies.values()], locations: [...this.locations.values()], programs: [...this.programs.values()],
      memberships: [...this.memberships.values()], entitlements: [...this.entitlements.values()], sessions: [...this.sessions.values()], athletes: [...this.athletes.values()], attendance: [...this.attendance.values()], practiceNotes: [...this.practiceNotes.values()], audits: this.audits
    };
    const temporary = `${this.filePath}.${globalThis.crypto.randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      renameSync(temporary, this.filePath);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  /** Single-process all-or-nothing batch: no file is changed until the full operation succeeds. */
  override transaction<T>(work: () => T): T {
    if (this.inTransaction) throw new Error("NESTED_TRANSACTION_UNSUPPORTED");
    const previous = this.snapshotState();
    this.inTransaction = true;
    try {
      const result = work();
      this.flush();
      return result;
    } catch (error) {
      this.restoreState(previous);
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
  /** Roll back in-memory state when disk replacement fails; never acknowledge unpersisted writes. */
  private mutate(work: () => void): void {
    const previous = this.snapshotState();
    try {
      work();
      if (!this.inTransaction) this.flush();
    } catch (error) {
      this.restoreState(previous);
      throw error;
    }
  }
  override createOrganization(record: Organization): void { this.mutate(() => super.createOrganization(record)); }
  override updateOrganization(record: Organization): void { this.mutate(() => super.updateOrganization(record)); }
  override put(kind: StoreKind, record: TenantRecord, replace = false): void {
    this.mutate(() => super.put(kind, record, replace));
  }
  override audit(identity: VerifiedIdentity, action: string, resourceType: string, resourceId: string, outcome: AuditEvent["outcome"], reason?: string): void {
    this.mutate(() => super.audit(identity, action, resourceType, resourceId, outcome, reason));
  }
}
