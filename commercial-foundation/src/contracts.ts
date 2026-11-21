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
export type AthleteParticipationState = "active" | "inactive" | "archived";
export interface CommercialAthlete { id: string; organizationId: string; academyId?: string; locationId?: string; programId: string; displayName: string; synthetic: true; participationState?: AthleteParticipationState; adult?: boolean; assignedCoachUserIds?: string[] }
export interface GuardianProfile { id: string; organizationId: string; userId: string; displayName: string; state: "active" | "suspended" | "revoked"; synthetic: true }
export interface GuardianAthleteLink { id: string; organizationId: string; guardianId: string; athleteId: string; state: "active" | "suspended" | "revoked"; permissions: Array<"profile" | "schedule" | "attendance" | "progression"> }
export interface AthleteIdentityLink { id: string; organizationId: string; userId: string; athleteId: string; state: "active" | "suspended" | "revoked"; access: "adult_self" | "minor_read_only" }
export type AttendanceState = "present" | "absent" | "excused";
export interface AttendanceRecord { id: string; organizationId: string; sessionId: string; athleteId: string; state: AttendanceState; recordedByUserId: string; recordedAt: string; correctedAt?: string }
export interface PracticeNote { id: string; organizationId: string; sessionId: string; authorUserId: string; body: string; createdAt: string }

export type DevelopmentPathway = "road2champion" | "path2legend";
export type XpLane = "strength" | "honor" | "adjustment" | "decay";
export type SeasonPhase = "preseason" | "in_season" | "postseason";
export interface CurriculumRank { key: string; name: string; requiredXp: number; order: number }
export interface SkillRequirement { id: string; category: string; name: string; required: boolean }
export interface CurriculumDefinition { id: string; organizationId: string; academyId: string; discipline: "wrestling" | "boxing" | "muay_thai"; version: string; pathway: DevelopmentPathway; ranks: CurriculumRank[]; skills: SkillRequirement[]; state: "active" | "retired" }
export interface CurriculumAssignment { id: string; organizationId: string; athleteId: string; curriculumId: string; assignedByUserId: string; assignedAt: string; state: "active" | "completed" | "revoked" }
export interface SkillEvaluation { id: string; organizationId: string; assignmentId: string; athleteId: string; skillId: string; coachUserId: string; status: "introduced" | "developing" | "approved"; note?: string; evaluatedAt: string; rankIndexAtEvaluation?: number }
export interface ProgressionCycle { id: string; organizationId: string; athleteId: string; assignmentId: string; pathway: DevelopmentPathway; rankIndex: number; activeXp: number; lifetimeXp: number; earnedStripes: number; seasonPhase: SeasonPhase; sequence: number; state: "active" | "completed" | "suspended" }
export interface XpEvent { id: string; organizationId: string; athleteId: string; cycleId: string; rankIndexAtAward: number; lane: XpLane; amount: number; source: string; sourceEventId: string; actorUserId: string; reason?: string; correctionOf?: string; occurredAt: string }
export interface PromotionRecord { id: string; organizationId: string; athleteId: string; cycleId: string; pathway: DevelopmentPathway; fromRank: string; toRank: string; historicalXpAtPromotion: number; promotedByUserId: string; promotedAt: string; requirementsVerified: true }
export interface AccessInvitation { id: string; organizationId: string; email: string; role: OrganizationRole; scopeType: ScopeType; scopeId: string; tokenDigest: string; state: "pending" | "accepted" | "revoked" | "expired"; invitedByUserId: string; invitedAt: string; expiresAt: string; acceptedByUserId?: string; acceptedAt?: string }
export interface RecoveryCase { id: string; organizationId: string; athleteId: string; cycleId: string; state: "evidence_pending" | "evidence_verified" | "cancelled"; openedByUserId: string; openedAt: string; verifiedPracticeIds: string[]; policyActivated: false }
export interface RecoveryPracticeEvidence { id: string; organizationId: string; recoveryCaseId: string; athleteId: string; sessionId: string; coachUserId: string; fullParticipation: true; verifiedAt: string }
export interface TransferAcceptance { id: string; organizationId: string; destinationAthleteId: string; sourceOrganizationId: string; sourceAthleteId: string; consentType: "adult" | "guardian"; packageDigest: string; pathway: DevelopmentPathway; rankIndex: number; earnedStripes: number; activeXp: number; lifetimeXp: number; promotionHistory: Array<{fromRank:string;toRank:string;promotedAt:string}>; acceptedByUserId: string; acceptedAt: string }

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
export interface VerifiedAccountProof { userId: string; verifiedEmail: string }
export interface AccountProofAuthority { verify(ctx: AuthorizationContext): VerifiedAccountProof }
