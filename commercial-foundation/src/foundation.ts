import { Academy, AuditEvent, AuthorizationContext, Entitlement, IdentityAuthority, Location, Membership, Organization, Program, VerifiedIdentity } from "./contracts";
import { assertId, validateEntitlement, validateMembership, validateProgram } from "./validation";

type StoreKind = "academies" | "locations" | "programs" | "memberships" | "entitlements";
type TenantRecord = Academy | Location | Program | Membership | Entitlement;
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
}

/** TEST-ONLY persistence. Composite keys prevent duplicate local IDs across organizations. */
export class InMemoryCommercialStore {
  organizations = new Map<string, Organization>();
  academies = new Map<string, Academy>(); locations = new Map<string, Location>();
  programs = new Map<string, Program>(); memberships = new Map<string, Membership>();
  entitlements = new Map<string, Entitlement>(); audits: AuditEvent[] = [];
  private sequence = 0;
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

export class CommercialFoundation {
  constructor(readonly store: InMemoryCommercialStore, private readonly authority: IdentityAuthority, private readonly now = () => new Date()) {}
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
    const org = this.store.organizations.get(resourceOrg);
    if (!org || org.state !== "active") throw new Error("ORGANIZATION_INACTIVE");
    const members = this.memberships(identity).filter(m => this.validScope(m));
    if (!members.length) throw new Error("MEMBERSHIP_REQUIRED");
    const orgAdmin = members.some(m => m.role === "organization_admin" && m.scopeType === "organization");
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
      const result = operation(identity);
      this.store.audit(identity, action, type, id, "permitted");
      return result;
    } catch (error) {
      this.store.audit(identity, action, type, id, "rejected", error instanceof Error ? error.message : "UNKNOWN");
      throw error;
    }
  }
  createOrganization(ctx: AuthorizationContext, organization: Organization): Organization {
    const identity = this.identity(ctx);
    return this.execute(ctx, "organization.create", "organization", organization.id, organization.id, () => {
      if (!identity.systemAdmin) throw new Error("SYSTEM_ADMIN_REQUIRED");
      assertId(organization.id);
      if (this.store.organizations.has(organization.id)) throw new Error("DUPLICATE_RECORD_ID");
      this.store.organizations.set(organization.id, structuredClone(organization));
      return structuredClone(organization);
    });
  }
  createAcademy(ctx: AuthorizationContext, academy: Academy): Academy {
    return this.execute(ctx, "academy.create", "academy", academy.id, academy.organizationId, () => {
      assertId(academy.id); assertId(academy.organizationId);
      if (!this.store.organizations.has(academy.organizationId)) throw new Error("INVALID_ORGANIZATION_REFERENCE");
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
  hasCapability(ctx: AuthorizationContext, capabilityId: string): boolean {
    const identity = this.identity(ctx);
    this.authorize(identity, "capability.read", identity.selectedOrganizationId);
    if (essentialCapabilities.has(capabilityId)) return true;
    const time = this.now().getTime();
    return this.store.list<Entitlement>("entitlements", identity.selectedOrganizationId).some(e =>
      e.capabilityId === capabilityId && e.state === "active" &&
      Date.parse(e.startsAt) <= time && (!e.expiresAt || Date.parse(e.expiresAt) > time));
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
