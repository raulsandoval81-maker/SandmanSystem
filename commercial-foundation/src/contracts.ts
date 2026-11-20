export type OrganizationRole = "organization_admin" | "management" | "coach" | "parent" | "adult_athlete" | "athlete";
export type ScopeType = "organization" | "academy" | "location";
export type MembershipState = "invited" | "active" | "suspended" | "revoked";
export type LifecycleState = "active" | "suspended" | "archived";

export interface Organization { id: string; displayName: string; state: LifecycleState }
export interface Academy { id: string; organizationId: string; name: string; state: LifecycleState }
export interface Location { id: string; organizationId: string; academyId: string; name: string; state: LifecycleState }
export interface Program { id: string; organizationId: string; academyId: string; locationIds: string[]; name: string; disciplines: string[]; state: LifecycleState }
export interface Membership {
  id: string; userId: string; organizationId: string; role: OrganizationRole;
  scopeType: ScopeType; scopeId: string; state: MembershipState;
}
export type PracticeSessionState = "scheduled" | "completed" | "cancelled";
export interface PracticeSession { id: string; organizationId: string; academyId: string; locationId: string; programId: string; coachUserIds: string[]; startsAt: string; endsAt: string; state: PracticeSessionState }
export interface CommercialAthlete { id: string; organizationId: string; programId: string; displayName: string; synthetic: true }
export type AttendanceState = "present" | "absent" | "excused";
export interface AttendanceRecord { id: string; organizationId: string; sessionId: string; athleteId: string; state: AttendanceState; recordedByUserId: string; recordedAt: string; correctedAt?: string }
export interface PracticeNote { id: string; organizationId: string; sessionId: string; authorUserId: string; body: string; createdAt: string }

export type ProductLifecycle = "proposed" | "private_preview" | "prelaunch" | "released" | "retired" | "unverified";
export type IntegrationType = "none" | "planned" | "optional_adapter" | "native";
export interface ProductDefinition {
  id: string; owner: string; lifecycle: ProductLifecycle; capabilityIds: string[];
  integrationType: IntegrationType; dataBoundary: string; compatibilityVersion: string;
  approvedRelease: boolean;
}
export interface ProductRegistry { schema: "sandman.commercial.registry.v1"; products: ProductDefinition[] }

export type EntitlementSource = "Core" | "Plus" | "Pro" | "add_on" | "product";
export type EntitlementState = "active" | "suspended" | "revoked" | "expired";
export interface Entitlement {
  id: string; organizationId: string; capabilityId: string; source: EntitlementSource;
  productId?: string; state: EntitlementState; startsAt: string; expiresAt?: string;
}
export interface AuditEvent {
  id: string; at: string; actorUserId: string; selectedOrganizationId: string;
  action: string; resourceType: string; resourceId: string; outcome: "permitted" | "rejected";
  reason?: string;
}

/** Opaque request credential; user/role/organization claims are resolved by trusted server authority. */
export interface AuthorizationContext { sessionId: string }
export interface VerifiedIdentity { userId: string; selectedOrganizationId: string; systemAdmin: boolean }
export interface IdentityAuthority { verify(ctx: AuthorizationContext): VerifiedIdentity }
export interface SwitchableIdentityAuthority extends IdentityAuthority {
  switchOrganization(ctx: AuthorizationContext, organizationId: string): AuthorizationContext;
}
