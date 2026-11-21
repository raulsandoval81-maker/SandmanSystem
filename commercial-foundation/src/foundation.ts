import { AccessInvitation, Academy, AthleteIdentityLink, AttendanceRecord, AuditEvent, AuthorizationContext, CommercialAthlete, CurriculumAssignment, CurriculumDefinition, Entitlement, GuardianAthleteLink, GuardianProfile, IdentityAuthority, Location, Membership, Organization, PracticeNote, PracticeSession, Program, ProgressionCycle, PromotionRecord, RecoveryCase, RecoveryPenaltyEvent, RecoveryPracticeEvidence, SkillEvaluation, SwitchableIdentityAuthority, TransferAcceptance, VerifiedIdentity, XpEvent } from "./contracts";
import { assertId, validateEntitlement, validateMembership, validateProgram } from "./validation";

export type StoreKind = "academies" | "locations" | "programs" | "memberships" | "entitlements" | "sessions" | "athletes" | "attendance" | "practiceNotes" | "guardians" | "guardianLinks" | "athleteIdentityLinks" | "curricula" | "curriculumAssignments" | "skillEvaluations" | "progressionCycles" | "xpEvents" | "promotions" | "accessInvitations" | "recoveryCases" | "recoveryEvidence" | "recoveryPenalties" | "transferAcceptances";
export type TenantRecord = Academy | Location | Program | Membership | Entitlement | PracticeSession | CommercialAthlete | AttendanceRecord | PracticeNote | GuardianProfile | GuardianAthleteLink | AthleteIdentityLink | CurriculumDefinition | CurriculumAssignment | SkillEvaluation | ProgressionCycle | XpEvent | PromotionRecord | AccessInvitation | RecoveryCase | RecoveryPracticeEvidence | RecoveryPenaltyEvent | TransferAcceptance;
const essentialCapabilities = new Set(["security.access", "customer_data.read"]);
const key = (organizationId: string, id: string) => JSON.stringify([organizationId, id]);

/** TEST-ONLY identity issuer. Never expose mint() to an API caller or use this class as production authentication. */
export class InMemoryTestIdentityAuthority implements IdentityAuthority {
  private readonly sessions = new Map<string, VerifiedIdentity>();
  mint(userId: string, selectedOrganizationId: string, systemAdmin = false): AuthorizationContext {
    const sessionId = globalThis.crypto.randomUUID();
    this.sessions.set(sessionId, Object.freeze({ userId, selectedOrganizationId, systemAdmin }));
    return Object.freeze({ sessionId });
  }
  verify(ctx: AuthorizationContext): VerifiedIdentity {
    const identity = ctx && typeof ctx.sessionId === "string" ? this.sessions.get(ctx.sessionId) : undefined;
    if (!identity) throw new Error("UNVERIFIED_IDENTITY");
    return identity;
  }
  switchOrganization(ctx: AuthorizationContext, organizationId: string): AuthorizationContext {
    const identity = this.verify(ctx);
    return this.mint(identity.userId, organizationId, identity.systemAdmin);
  }
}

/** TEST-ONLY persistence. Composite keys prevent duplicate local IDs across organizations. */
export class InMemoryCommercialStore {
  organizations = new Map<string, Organization>();
  academies = new Map<string, Academy>(); locations = new Map<string, Location>();
  programs = new Map<string, Program>(); memberships = new Map<string, Membership>();
  entitlements = new Map<string, Entitlement>(); sessions = new Map<string, PracticeSession>(); athletes = new Map<string, CommercialAthlete>(); attendance = new Map<string, AttendanceRecord>(); practiceNotes = new Map<string, PracticeNote>(); guardians = new Map<string, GuardianProfile>(); guardianLinks = new Map<string, GuardianAthleteLink>(); athleteIdentityLinks = new Map<string, AthleteIdentityLink>(); curricula = new Map<string, CurriculumDefinition>(); curriculumAssignments = new Map<string, CurriculumAssignment>(); skillEvaluations = new Map<string, SkillEvaluation>(); progressionCycles = new Map<string, ProgressionCycle>(); xpEvents = new Map<string, XpEvent>(); promotions = new Map<string, PromotionRecord>(); accessInvitations = new Map<string, AccessInvitation>(); recoveryCases = new Map<string, RecoveryCase>(); recoveryEvidence = new Map<string, RecoveryPracticeEvidence>(); recoveryPenalties = new Map<string, RecoveryPenaltyEvent>(); transferAcceptances = new Map<string, TransferAcceptance>(); audits: AuditEvent[] = [];
  protected sequence = 0;
  /** Snapshot/restore protect the reference adapter from partial multi-step operations. */
  protected snapshotState() {
    return {
      organizations: new Map(this.organizations), academies: new Map(this.academies),
      locations: new Map(this.locations), programs: new Map(this.programs),
      memberships: new Map(this.memberships), entitlements: new Map(this.entitlements), sessions: new Map(this.sessions), athletes: new Map(this.athletes), attendance: new Map(this.attendance), practiceNotes: new Map(this.practiceNotes), guardians:new Map(this.guardians),guardianLinks:new Map(this.guardianLinks),athleteIdentityLinks:new Map(this.athleteIdentityLinks), curricula:new Map(this.curricula),curriculumAssignments:new Map(this.curriculumAssignments),skillEvaluations:new Map(this.skillEvaluations),progressionCycles:new Map(this.progressionCycles),xpEvents:new Map(this.xpEvents),promotions:new Map(this.promotions),accessInvitations:new Map(this.accessInvitations),recoveryCases:new Map(this.recoveryCases),recoveryEvidence:new Map(this.recoveryEvidence),recoveryPenalties:new Map(this.recoveryPenalties),transferAcceptances:new Map(this.transferAcceptances),
      audits: structuredClone(this.audits), sequence: this.sequence
    };
  }
  protected restoreState(state: ReturnType<InMemoryCommercialStore["snapshotState"]>): void {
    this.organizations = state.organizations; this.academies = state.academies;
    this.locations = state.locations; this.programs = state.programs;
    this.memberships = state.memberships; this.entitlements = state.entitlements; this.sessions = state.sessions; this.athletes = state.athletes; this.attendance = state.attendance; this.practiceNotes = state.practiceNotes;this.guardians=state.guardians;this.guardianLinks=state.guardianLinks;this.athleteIdentityLinks=state.athleteIdentityLinks;this.curricula=state.curricula;this.curriculumAssignments=state.curriculumAssignments;this.skillEvaluations=state.skillEvaluations;this.progressionCycles=state.progressionCycles;this.xpEvents=state.xpEvents;this.promotions=state.promotions;this.accessInvitations=state.accessInvitations;this.recoveryCases=state.recoveryCases;this.recoveryEvidence=state.recoveryEvidence;this.recoveryPenalties=state.recoveryPenalties;this.transferAcceptances=state.transferAcceptances;
    this.audits = state.audits; this.sequence = state.sequence;
  }
  transaction<T>(work: () => T): T {
    const previous = this.snapshotState();
    try { return work(); } catch (error) { this.restoreState(previous); throw error; }
  }
  createOrganization(record: Organization): void {
    if (this.organizations.has(record.id)) throw new Error("DUPLICATE_RECORD_ID");
    this.organizations.set(record.id, structuredClone(record));
  }
  updateOrganization(record: Organization): void {
    if (!this.organizations.has(record.id)) throw new Error("ORGANIZATION_NOT_FOUND");
    this.organizations.set(record.id, structuredClone(record));
  }
  getOrganization(id: string): Organization | undefined {
    const record = this.organizations.get(id); return record ? structuredClone(record) : undefined;
  }
  listAudits(organizationId: string): AuditEvent[] { return this.audits.filter(a => a.selectedOrganizationId === organizationId).map(a => structuredClone(a)); }
  /** Persistence-adapter hydration only; preserves monotonic audit identifiers after restart. */
  restoreAudits(records:AuditEvent[]):void { this.audits=structuredClone(records);this.sequence=records.reduce((max,a)=>{const value=/^audit-(\d+)$/.exec(a.id);return Math.max(max,value?Number(value[1]):0);},0); }
  audit(identity: VerifiedIdentity, action: string, resourceType: string, resourceId: string, outcome: AuditEvent["outcome"], reason?: string) {
    this.audits.push({ id: `audit-${++this.sequence}`, at: new Date().toISOString(), actorUserId: identity.userId, selectedOrganizationId: identity.selectedOrganizationId, action, resourceType, resourceId, outcome, reason });
  }
  get<T extends TenantRecord>(kind: StoreKind, organizationId: string, id: string): T | undefined {
    const record = this[kind].get(key(organizationId, id));
    return record ? structuredClone(record) as T : undefined;
  }
  list<T extends TenantRecord>(kind: StoreKind, organizationId: string): T[] {
    return [...this[kind].values()].filter(record => record.organizationId === organizationId).map(record => structuredClone(record)) as T[];
  }
  /** Only for service code and synthetic fixture setup; production must use a permissioned repository port. */
  put(kind: StoreKind, record: TenantRecord, replace = false): void {
    const id = key(record.organizationId, record.id);
    if (this[kind].has(id) && !replace) throw new Error("DUPLICATE_RECORD_ID");
    (this[kind] as Map<string, TenantRecord>).set(id, structuredClone(record));
  }
}

function locationAcademyId(store: InMemoryCommercialStore, organizationId: string, locationId: string): string | undefined {
  return store.get<Location>("locations", organizationId, locationId)?.academyId;
}

export class CommercialFoundation {
  constructor(readonly store: InMemoryCommercialStore, private readonly authority: IdentityAuthority, private readonly now = () => new Date()) {}
  transaction<T>(work: () => T): T { return this.store.transaction(work); }
  private identity(ctx: AuthorizationContext): VerifiedIdentity { return this.authority.verify(ctx); }
  private memberships(identity: VerifiedIdentity): Membership[] {
    return this.store.list<Membership>("memberships", identity.selectedOrganizationId)
      .filter(m => m.userId === identity.userId && m.state === "active");
  }
  private validScope(m: Membership): boolean {
    if (m.scopeType === "organization") return m.scopeId === m.organizationId;
    if (m.scopeType === "academy") return !!this.store.get<Academy>("academies", m.organizationId, m.scopeId);
    if (m.scopeType === "location") return !!this.store.get<Location>("locations", m.organizationId, m.scopeId);
    return false;
  }
  private authorize(identity: VerifiedIdentity, action: string, resourceOrg: string, academyId?: string, locationIds: string[] = []): void {
    if (identity.selectedOrganizationId !== resourceOrg) throw new Error("TENANT_BOUNDARY_DENIED");
    if (identity.systemAdmin) return;
    const org = this.store.getOrganization(resourceOrg);
    if (!org || org.state !== "active") throw new Error("ORGANIZATION_INACTIVE");
    const members = this.memberships(identity).filter(m => this.validScope(m));
    if (!members.length) throw new Error("MEMBERSHIP_REQUIRED");
    const orgAdmin = members.some(m => m.role === "organization_admin" && m.scopeType === "organization");
    const scoped = (m: Membership) => m.scopeType === "organization" || (m.scopeType === "academy" && m.scopeId === academyId) || (m.scopeType === "location" && locationIds.includes(m.scopeId));
    const manager = members.some(m => (m.role === "organization_admin" || m.role === "management") && scoped(m));
    const coach = members.some(m => m.role === "coach" && scoped(m));
    if (action === "capability.read") return; // membership verified; grants remain organization-scoped
    if (["management.overview", "management.schedule", "management.athlete"].includes(action)) { if (manager) return; throw new Error("ROLE_DENIED"); }
    if (["session.read", "attendance.record", "practice-note.manage", "coach.workspace"].includes(action)) { if (manager || coach) return; throw new Error("ROLE_DENIED"); }
    if (action === "membership.invite") { if (manager) return; throw new Error("ROLE_DENIED"); }
    if (action === "family.manage") { if (manager) return; throw new Error("ROLE_DENIED"); }
    if (action === "parent.hub") { if (members.some(m=>m.role==="parent"&&scoped(m))) return; throw new Error("ROLE_DENIED"); }
    if (action === "athlete.self") { if (members.some(m=>(m.role==="athlete"||m.role==="adult_athlete")&&scoped(m))) return; throw new Error("ROLE_DENIED"); }
    if (action === "xp.manage") { if (manager) return; throw new Error("ROLE_DENIED"); }
    if (action === "xp.coach") { if (coach) return; throw new Error("ROLE_DENIED"); }
    if (action === "identity.invite") { if (manager) return; throw new Error("ROLE_DENIED"); }
    if (action === "transfer.accept") { if (manager) return; throw new Error("ROLE_DENIED"); }
    if (action === "program.read") {
      if (orgAdmin || members.some(m =>
        m.scopeType === "organization" ||
        (m.scopeType === "academy" && m.scopeId === academyId) ||
        (m.scopeType === "location" && locationIds.includes(m.scopeId))
      )) return;
      throw new Error("SCOPE_DENIED");
    }
    if (orgAdmin) return;
    throw new Error("ROLE_DENIED");
  }
  private execute<T>(ctx: AuthorizationContext, action: string, type: string, id: string, organizationId: string, operation: (identity: VerifiedIdentity) => T, academyId?: string, locationIds: string[] = []): T {
    const identity = this.identity(ctx); // unverified claims are never used or audited as trusted identities
    try {
      this.authorize(identity, action, organizationId, academyId, locationIds);
      if (action !== "organization.create" && this.store.getOrganization(organizationId)?.state !== "active") throw new Error("ORGANIZATION_INACTIVE");
      const result = operation(identity);
      this.store.audit(identity, action, type, id, "permitted");
      return result;
    } catch (error) {
      this.store.audit(identity, action, type, id, "rejected", error instanceof Error ? error.message : "UNKNOWN");
      throw error;
    }
  }
  /**
   * Authorize a known operational action, without executing caller-provided callbacks.
   * The unexported adapter executor in operations.ts owns the actual operation.
   * Never expose this foundation or its test-only mutable store to untrusted clients.
   */
  authorizeOperational(ctx: AuthorizationContext, action: "management.overview" | "management.schedule" | "management.athlete" | "session.read" | "attendance.record" | "practice-note.manage" | "coach.workspace" | "family.manage" | "parent.hub" | "athlete.self" | "xp.manage" | "xp.coach" | "identity.invite" | "transfer.accept", type: string, id: string, organizationId: string, academyId?: string, locationIds: string[] = []): VerifiedIdentity {
    const identity = this.identity(ctx);
    try {
      const allowed = ["management.overview", "management.schedule", "management.athlete", "session.read", "attendance.record", "practice-note.manage", "coach.workspace", "family.manage", "parent.hub", "athlete.self", "xp.manage", "xp.coach", "identity.invite", "transfer.accept"];
      if (!allowed.includes(action)) throw new Error("UNSUPPORTED_OPERATION_ACTION");
      this.authorize(identity, action, organizationId, academyId, locationIds);
      if (this.store.getOrganization(organizationId)?.state !== "active") throw new Error("ORGANIZATION_INACTIVE");
      return identity;
    } catch (error) {
      this.store.audit(identity, action, type, id, "rejected", error instanceof Error ? error.message : "UNKNOWN");
      throw error;
    }
  }
  auditOperational(identity: VerifiedIdentity, action: string, type: string, id: string, outcome: AuditEvent["outcome"], reason?: string): void {
    this.store.audit(identity, action, type, id, outcome, reason);
  }
  createOrganization(ctx: AuthorizationContext, organization: Organization): Organization {
    const identity = this.identity(ctx);
    return this.execute(ctx, "organization.create", "organization", organization.id, organization.id, () => {
      if (!identity.systemAdmin) throw new Error("SYSTEM_ADMIN_REQUIRED");
      assertId(organization.id);
      this.store.createOrganization(organization);
      return structuredClone(organization);
    });
  }
  createAcademy(ctx: AuthorizationContext, academy: Academy): Academy {
    return this.execute(ctx, "academy.create", "academy", academy.id, academy.organizationId, () => {
      assertId(academy.id); assertId(academy.organizationId);
      if (!this.store.getOrganization(academy.organizationId)) throw new Error("INVALID_ORGANIZATION_REFERENCE");
      this.store.put("academies", academy);
      return structuredClone(academy);
    });
  }
  createLocation(ctx: AuthorizationContext, location: Location): Location {
    return this.execute(ctx, "location.create", "location", location.id, location.organizationId, () => {
      assertId(location.id);
      const academy = this.store.get<Academy>("academies", location.organizationId, location.academyId);
      if (!academy || academy.state !== "active") throw new Error("INVALID_ACADEMY_REFERENCE");
      this.store.put("locations", location);
      return structuredClone(location);
    });
  }
  createProgram(ctx: AuthorizationContext, program: Program): Program {
    return this.execute(ctx, "program.create", "program", program.id, program.organizationId, () => {
      validateProgram(program);
      const academy = this.store.get<Academy>("academies", program.organizationId, program.academyId);
      if (!academy || academy.state !== "active" || program.locationIds.some(id => {
        const location = this.store.get<Location>("locations", program.organizationId, id);
        return !location || location.academyId !== program.academyId || location.state !== "active";
      })) throw new Error("INVALID_PROGRAM_REFERENCE");
      this.store.put("programs", program);
      return structuredClone(program);
    });
  }
  assignMembership(ctx: AuthorizationContext, membership: Membership): Membership {
    return this.execute(ctx, "membership.manage", "membership", membership.id, membership.organizationId, () => {
      validateMembership(membership);
      if (!this.validScope(membership)) throw new Error("INVALID_MEMBERSHIP_SCOPE");
      this.store.put("memberships", membership);
      return structuredClone(membership);
    });
  }
  /**
   * Prepare a location-scoped staff invitation. This deliberately creates ONLY an
   * invited membership; production identity/email verification and acceptance
   * must happen in a separate trusted workflow before any role becomes active.
   */
  inviteLocationStaff(ctx: AuthorizationContext, invitation: Membership): Membership {
    return this.execute(ctx, "membership.invite", "membership", invitation.id, invitation.organizationId, identity => {
      validateMembership(invitation);
      if (invitation.state !== "invited" || invitation.scopeType !== "location" ||
          !["coach", "management"].includes(invitation.role)) {
        throw new Error("INVALID_STAFF_INVITATION");
      }
      const location = this.store.get<Location>("locations", invitation.organizationId, invitation.scopeId);
      if (!location || location.state !== "active") throw new Error("INVALID_INVITATION_LOCATION");
      if (!identity.systemAdmin) {
        const actorRoles = this.memberships(identity).filter(m => this.validScope(m));
        const organizationAdmin = actorRoles.some(m => m.role === "organization_admin" &&
          m.scopeType === "organization");
        const scopedManager = actorRoles.some(m => m.role === "management" &&
          m.scopeType === "location" && m.scopeId === invitation.scopeId);
        if (!organizationAdmin && !scopedManager) throw new Error("INVITATION_SCOPE_DENIED");
      }
      if (this.store.list<Membership>("memberships", invitation.organizationId).some(m =>
        m.userId === invitation.userId && m.role === invitation.role &&
        m.scopeType === "location" && m.scopeId === invitation.scopeId &&
        ["active", "invited"].includes(m.state))) {
        throw new Error("DUPLICATE_STAFF_INVITATION");
      }
      this.store.put("memberships", invitation);
      return structuredClone(invitation);
    }, locationAcademyId(this.store, invitation.organizationId, invitation.scopeId), [invitation.scopeId]);
  }
  grantEntitlement(ctx: AuthorizationContext, entitlement: Entitlement): Entitlement {
    return this.execute(ctx, "entitlement.manage", "entitlement", entitlement.id, entitlement.organizationId, () => {
      validateEntitlement(entitlement);
      if (essentialCapabilities.has(entitlement.capabilityId)) throw new Error("ESSENTIAL_ACCESS_NOT_PAYWALLED");
      this.store.put("entitlements", entitlement);
      return structuredClone(entitlement);
    });
  }
  revokeEntitlement(ctx: AuthorizationContext, organizationId: string, id: string): Entitlement {
    return this.execute(ctx, "entitlement.manage", "entitlement", id, organizationId, () => {
      const entitlement = this.store.get<Entitlement>("entitlements", organizationId, id);
      if (!entitlement) throw new Error("ENTITLEMENT_NOT_FOUND");
      entitlement.state = "revoked";
      this.store.put("entitlements", entitlement, true);
      return structuredClone(entitlement);
    });
  }
  revokeMembership(ctx: AuthorizationContext, organizationId: string, id: string): Membership {
    return this.execute(ctx, "membership.manage", "membership", id, organizationId, () => {
      const membership = this.store.get<Membership>("memberships", organizationId, id);
      if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");
      membership.state = "revoked";
      this.store.put("memberships", membership, true);
      return structuredClone(membership);
    });
  }
  suspendOrganization(ctx: AuthorizationContext, organizationId: string): Organization {
    return this.execute(ctx, "organization.suspend", "organization", organizationId, organizationId, identity => {
      if (!identity.systemAdmin) throw new Error("SYSTEM_ADMIN_REQUIRED");
      const organization = this.store.getOrganization(organizationId);
      if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");
      organization.state = "suspended";
      this.store.updateOrganization(organization);
      return structuredClone(organization);
    });
  }
  switchOrganization(ctx: AuthorizationContext, organizationId: string): AuthorizationContext {
    assertId(organizationId, "organizationId");
    const identity = this.identity(ctx);
    const authority = this.authority as IdentityAuthority & Partial<SwitchableIdentityAuthority>;
    if (!authority.switchOrganization) throw new Error("ORGANIZATION_SWITCH_UNSUPPORTED");
    const target = this.store.getOrganization(organizationId);
    if (!target || target.state !== "active") throw new Error("ORGANIZATION_INACTIVE");
    if (!identity.systemAdmin && !this.store.list<Membership>("memberships", organizationId).some(m => m.userId === identity.userId && m.state === "active" && this.validScope(m))) throw new Error("MEMBERSHIP_REQUIRED");
    const next = authority.switchOrganization(ctx, organizationId);
    this.store.audit({ ...identity, selectedOrganizationId: organizationId }, "organization.switch", "organization", organizationId, "permitted");
    return next;
  }
  hasCapability(ctx: AuthorizationContext, capabilityId: string): boolean {
    const identity = this.identity(ctx);
    return this.execute(ctx, "capability.read", "capability", capabilityId, identity.selectedOrganizationId, () => {
      if (essentialCapabilities.has(capabilityId)) return true;
      const time = this.now().getTime();
      return this.store.list<Entitlement>("entitlements", identity.selectedOrganizationId).some(e =>
        e.capabilityId === capabilityId && e.state === "active" &&
        Date.parse(e.startsAt) <= time && (!e.expiresAt || Date.parse(e.expiresAt) > time));
    });
  }
  readProgram(ctx: AuthorizationContext, id: string): Program {
    const identity = this.identity(ctx);
    const value = this.store.get<Program>("programs", identity.selectedOrganizationId, id);
    return this.execute(ctx, "program.read", "program", id, identity.selectedOrganizationId, () => {
      if (!value) throw new Error("PROGRAM_NOT_FOUND");
      return structuredClone(value);
    }, value?.academyId, value?.locationIds ?? []);
  }
}
