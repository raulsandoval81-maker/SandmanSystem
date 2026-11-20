import { AuthorizationContext, EntitlementSource, Membership, OrganizationRole } from "./contracts";
import { CommercialFoundation } from "./foundation";

export interface OrganizationOnboardingRequest {
  organizationId: string; organizationName: string; academyId: string; academyName: string;
  locationId: string; locationName: string; programId: string; programName: string;
  disciplines: string[]; administratorUserId: string; coachUserId: string;
  packageSource: Extract<EntitlementSource, "Core" | "Plus" | "Pro">; capabilityIds: string[];
  startsAt: string; expiresAt?: string;
}

/** Minimal backend workflow; callers must already hold a verified system-admin session. */
export class OrganizationOnboardingService {
  constructor(private readonly foundation: CommercialFoundation) {}
  onboard(ctx: AuthorizationContext, request: OrganizationOnboardingRequest) {
    // Every onboarding write, including audit records, commits or rolls back together.
    return this.foundation.transaction(() => {
      const org = request.organizationId;
      const organization = this.foundation.createOrganization(ctx, { id: org, displayName: request.organizationName, state: "active" });
      const administrator = this.foundation.assignMembership(ctx, this.membership(org, request.administratorUserId, "organization_admin", "administrator"));
      const academy = this.foundation.createAcademy(ctx, { id: request.academyId, organizationId: org, name: request.academyName, state: "active" });
      const location = this.foundation.createLocation(ctx, { id: request.locationId, organizationId: org, academyId: academy.id, name: request.locationName, state: "active" });
      const program = this.foundation.createProgram(ctx, { id: request.programId, organizationId: org, academyId: academy.id, locationIds: [location.id], name: request.programName, disciplines: request.disciplines, state: "active" });
      const coach = this.foundation.assignMembership(ctx, this.membership(org, request.coachUserId, "coach", "coach"));
      const entitlements = request.capabilityIds.map((capabilityId, index) => this.foundation.grantEntitlement(ctx, {
        id: `package-${index + 1}-${capabilityId.replace(/\./g, "-")}`, organizationId: org, capabilityId,
        source: request.packageSource, state: "active", startsAt: request.startsAt, expiresAt: request.expiresAt
      }));
      return { organization, academy, location, program, administrator, coach, entitlements };
    });
  }
  private membership(organizationId: string, userId: string, role: OrganizationRole, suffix: string): Membership {
    return { id: `member-${suffix}`, userId, organizationId, role, scopeType: "organization", scopeId: organizationId, state: "active" };
  }
}
