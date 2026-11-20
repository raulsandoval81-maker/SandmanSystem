import { Academy, AuditEvent, AuthorizationContext, Entitlement, Location, Membership, Organization, Program } from "./contracts";
import { validateEntitlement, validateMembership, validateProgram } from "./validation";

type RecordType = Organization | Academy | Location | Program | Membership | Entitlement;
const adminActions = new Set(["academy.create", "location.create", "program.create", "membership.manage", "entitlement.manage"]);
const essentialCapabilities = new Set(["security.access", "customer_data.read"]);

/** Isolated test adapter only. This is not evidence of production persistence or Firestore tenancy. */
export class InMemoryCommercialStore {
  organizations = new Map<string, Organization>(); academies = new Map<string, Academy>(); locations = new Map<string, Location>();
  programs = new Map<string, Program>(); memberships = new Map<string, Membership>(); entitlements = new Map<string, Entitlement>(); audits: AuditEvent[] = [];
  private sequence = 0;
  audit(ctx: AuthorizationContext, action: string, resourceType: string, resourceId: string, outcome: AuditEvent["outcome"], reason?: string) {
    this.audits.push({ id: `audit-${++this.sequence}`, at: new Date().toISOString(), actorUserId: ctx.userId, selectedOrganizationId: ctx.selectedOrganizationId, action, resourceType, resourceId, outcome, reason });
  }
  put(kind: "organizations"|"academies"|"locations"|"programs"|"memberships"|"entitlements", record: RecordType) { (this[kind] as Map<string, RecordType>).set(record.id, structuredClone(record)); }
}

export class CommercialFoundation {
  constructor(readonly store = new InMemoryCommercialStore(), private readonly now = () => new Date()) {}
  private memberships(ctx: AuthorizationContext) { return [...this.store.memberships.values()].filter(m => m.userId === ctx.userId && m.organizationId === ctx.selectedOrganizationId && m.state === "active"); }
  private authorize(ctx: AuthorizationContext, action: string, resourceOrganizationId: string): void {
    if (ctx.selectedOrganizationId !== resourceOrganizationId) throw new Error("TENANT_BOUNDARY_DENIED");
    if (ctx.systemAdmin) return;
    const permitted = this.memberships(ctx).some(m => m.role === "organization_admin" && m.scopeType === "organization" && m.scopeId === resourceOrganizationId);
    if (adminActions.has(action) && !permitted) throw new Error("ROLE_DENIED");
  }
  private execute<T>(ctx: AuthorizationContext, action: string, type: string, id: string, organizationId: string, operation: () => T): T {
    try { this.authorize(ctx, action, organizationId); const result = operation(); this.store.audit(ctx, action, type, id, "permitted"); return result; }
    catch (error) { this.store.audit(ctx, action, type, id, "rejected", error instanceof Error ? error.message : "UNKNOWN"); throw error; }
  }
  createOrganization(ctx: AuthorizationContext, organization: Organization): Organization {
    if (!ctx.systemAdmin) { this.store.audit(ctx, "organization.create", "organization", organization.id, "rejected", "SYSTEM_ADMIN_REQUIRED"); throw new Error("SYSTEM_ADMIN_REQUIRED"); }
    return this.execute(ctx, "organization.create", "organization", organization.id, ctx.selectedOrganizationId, () => { if (organization.id !== ctx.selectedOrganizationId) throw new Error("INVALID_ORGANIZATION_REFERENCE"); this.store.put("organizations", organization); return organization; });
  }
  createAcademy(ctx: AuthorizationContext, academy: Academy) { return this.execute(ctx, "academy.create", "academy", academy.id, academy.organizationId, () => { if (!this.store.organizations.has(academy.organizationId)) throw new Error("INVALID_ORGANIZATION_REFERENCE"); this.store.put("academies", academy); return academy; }); }
  createLocation(ctx: AuthorizationContext, location: Location) { return this.execute(ctx, "location.create", "location", location.id, location.organizationId, () => { const academy = this.store.academies.get(location.academyId); if (!academy || academy.organizationId !== location.organizationId) throw new Error("INVALID_ACADEMY_REFERENCE"); this.store.put("locations", location); return location; }); }
  createProgram(ctx: AuthorizationContext, program: Program) { return this.execute(ctx, "program.create", "program", program.id, program.organizationId, () => { validateProgram(program); const academy = this.store.academies.get(program.academyId); if (!academy || academy.organizationId !== program.organizationId || program.locationIds.some(id => this.store.locations.get(id)?.organizationId !== program.organizationId)) throw new Error("INVALID_PROGRAM_REFERENCE"); this.store.put("programs", program); return program; }); }
  assignMembership(ctx: AuthorizationContext, membership: Membership) { return this.execute(ctx, "membership.manage", "membership", membership.id, membership.organizationId, () => { validateMembership(membership); if (membership.role === ("system_admin" as string)) throw new Error("SYSTEM_ROLE_NOT_ASSIGNABLE"); this.store.put("memberships", membership); return membership; }); }
  grantEntitlement(ctx: AuthorizationContext, entitlement: Entitlement) { return this.execute(ctx, "entitlement.manage", "entitlement", entitlement.id, entitlement.organizationId, () => { validateEntitlement(entitlement); if (essentialCapabilities.has(entitlement.capabilityId)) throw new Error("ESSENTIAL_ACCESS_NOT_PAYWALLED"); this.store.put("entitlements", entitlement); return entitlement; }); }
  revokeEntitlement(ctx: AuthorizationContext, id: string) { const e = this.store.entitlements.get(id); if (!e) throw new Error("ENTITLEMENT_NOT_FOUND"); return this.execute(ctx, "entitlement.manage", "entitlement", id, e.organizationId, () => { e.state = "revoked"; this.store.put("entitlements", e); return e; }); }
  hasCapability(ctx: AuthorizationContext, capabilityId: string): boolean { if (essentialCapabilities.has(capabilityId)) return true; return [...this.store.entitlements.values()].some(e => e.organizationId === ctx.selectedOrganizationId && e.capabilityId === capabilityId && e.state === "active" && Date.parse(e.startsAt) <= this.now().getTime() && (!e.expiresAt || Date.parse(e.expiresAt) > this.now().getTime())); }
  readProgram(ctx: AuthorizationContext, id: string) { const value = this.store.programs.get(id); if (!value) throw new Error("PROGRAM_NOT_FOUND"); return this.execute(ctx, "program.read", "program", id, value.organizationId, () => structuredClone(value)); }
}
