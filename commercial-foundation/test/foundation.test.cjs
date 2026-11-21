const test = require("node:test");
const assert = require("node:assert/strict");
const { CommercialFoundation, InMemoryCommercialStore, InMemoryTestIdentityAuthority, validateProductRegistry } = require("../lib");

const at = new Date("2026-11-20T20:00:00Z");
const ORG_A = "org-example", ORG_B = "org-example-2";
const academy = (organizationId, id = "academy-local") => ({ id, organizationId, name: "Academy", state: "active" });
const location = (organizationId, academyId = "academy-local", id = "location-local") => ({ id, organizationId, academyId, name: "Gym", state: "active" });
const program = (organizationId, academyId = "academy-local", id = "program-local", locationIds = ["location-local"]) => ({ id, organizationId, academyId, locationIds, name: "Wrestling", disciplines: ["wrestling"], state: "active" });
const membership = (organizationId, userId, role, scopeType = "organization", scopeId = organizationId, id = "member-local", state = "active") => ({ id, organizationId, userId, role, scopeType, scopeId, state });
function fixture() {
  const store = new InMemoryCommercialStore();
  const identity = new InMemoryTestIdentityAuthority();
  const service = new CommercialFoundation(store, identity, () => at);
  const rootA = identity.mint("system-owner", ORG_A, true), rootB = identity.mint("system-owner", ORG_B, true);
  service.createOrganization(rootA, { id: ORG_A, displayName: "Example Combat Academy", state: "active" });
  service.createOrganization(rootB, { id: ORG_B, displayName: "Example Wrestling Club", state: "active" });
  store.put("memberships", membership(ORG_A, "shared-admin", "organization_admin"));
  store.put("memberships", membership(ORG_B, "shared-admin", "coach"));
  return { store, identity, service, rootA, rootB,
    adminA: identity.mint("shared-admin", ORG_A),
    coachB: identity.mint("shared-admin", ORG_B),
    outsider: identity.mint("outsider", ORG_A) };
}
const seed = (f, org, ctx) => {
  f.service.createAcademy(ctx, academy(org));
  f.service.createLocation(ctx, location(org));
  f.service.createProgram(ctx, program(org));
};

test("creates fictional organizations, academies, locations and programs", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA);
  assert.equal(f.service.readProgram(f.adminA, "program-local").name, "Wrestling");
});

test("denies forged administrator privilege and unissued sessions", () => {
  const f = fixture();
  assert.throws(() => f.service.createOrganization({ userId: "system-owner", selectedOrganizationId: "forged", systemAdmin: true }, {id: "forged", displayName: "Bad", state: "active"}), /UNVERIFIED_IDENTITY/);
  assert.throws(() => f.service.createAcademy({ sessionId: "fabricated", systemAdmin: true }, academy(ORG_A)), /UNVERIFIED_IDENTITY/);
  assert.throws(() => f.service.createOrganization(f.outsider, {id: ORG_A, displayName: "Bad", state: "active"}), /MEMBERSHIP_REQUIRED|SYSTEM_ADMIN_REQUIRED/);
});

test("nonmembers cannot read records or receive even essential capabilities", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA);
  assert.throws(() => f.service.readProgram(f.outsider, "program-local"), /MEMBERSHIP_REQUIRED/);
  assert.throws(() => f.service.hasCapability(f.outsider, "security.access"), /MEMBERSHIP_REQUIRED/);
});

test("tenant-safe keys permit identical local IDs across independent organizations", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA); seed(f, ORG_B, f.rootB);
  assert.equal(f.store.programs.size, 2);
  assert.equal(f.service.readProgram(f.adminA, "program-local").organizationId, ORG_A);
  assert.equal(f.service.readProgram(f.coachB, "program-local").organizationId, ORG_B);
  assert.equal(f.store.locations.size, 2);
});

test("organization and academy scope cannot be used to read another organization", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA);
  assert.throws(() => f.service.readProgram(f.coachB, "program-local"), /PROGRAM_NOT_FOUND/);
  assert.equal(f.store.audits.at(-1).outcome, "rejected");
});

test("academy and location scoped membership reads only matching programs", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA);
  f.service.createAcademy(f.adminA, academy(ORG_A, "academy-two"));
  f.service.createLocation(f.adminA, location(ORG_A, "academy-two", "location-two"));
  f.service.createProgram(f.adminA, program(ORG_A, "academy-two", "program-two", ["location-two"]));
  f.store.put("memberships", membership(ORG_A, "academy-coach", "coach", "academy", "academy-local", "member-academy"));
  f.store.put("memberships", membership(ORG_A, "location-coach", "coach", "location", "location-two", "member-location"));
  const ac = f.identity.mint("academy-coach", ORG_A), loc = f.identity.mint("location-coach", ORG_A);
  assert.equal(f.service.readProgram(ac, "program-local").id, "program-local");
  assert.throws(() => f.service.readProgram(ac, "program-two"), /SCOPE_DENIED/);
  assert.equal(f.service.readProgram(loc, "program-two").id, "program-two");
  assert.throws(() => f.service.readProgram(loc, "program-local"), /SCOPE_DENIED/);
  assert.throws(() => f.service.createProgram(ac, program(ORG_A, "academy-local", "new-program")), /ROLE_DENIED/);
});

test("invalid academy and location membership references are rejected", () => {
  const f = fixture();
  assert.throws(() => f.service.assignMembership(f.adminA, membership(ORG_A, "coach-x", "coach", "academy", "does-not-exist")), /INVALID_MEMBERSHIP_SCOPE/);
  assert.throws(() => f.service.assignMembership(f.adminA, membership(ORG_A, "coach-x", "organization_admin", "location", "whatever")), /INVALID_ADMIN_SCOPE/);
});

test("coach cannot self-promote and organization admin cannot grant system authority", () => {
  const f = fixture();
  assert.throws(() => f.service.assignMembership(f.coachB, membership(ORG_B, "shared-admin", "organization_admin", "organization", ORG_B, "escalation")), /ROLE_DENIED/);
  assert.throws(() => f.service.assignMembership(f.adminA, {...membership(ORG_A, "shared-admin", "coach", "organization", ORG_A, "global"), role: "system_admin"}), /INVALID_MEMBERSHIP/);
});

test("suspended and revoked memberships lose access immediately", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA);
  f.store.put("memberships", membership(ORG_A, "suspended-user", "coach", "organization", ORG_A, "suspended", "suspended"));
  f.store.put("memberships", membership(ORG_A, "revoked-user", "coach", "organization", ORG_A, "revoked", "revoked"));
  assert.throws(() => f.service.readProgram(f.identity.mint("suspended-user", ORG_A), "program-local"), /MEMBERSHIP_REQUIRED/);
  assert.throws(() => f.service.readProgram(f.identity.mint("revoked-user", ORG_A), "program-local"), /MEMBERSHIP_REQUIRED/);
});

test("entitlements require membership and revoked grants retain records", () => {
  const f = fixture(); const grant = {id:"ent-active", organizationId:ORG_A, capabilityId:"coach.workspace", source:"Plus", state:"active", startsAt:"2026-01-01T00:00:00Z", expiresAt:"2027-01-01T00:00:00Z"};
  f.service.grantEntitlement(f.adminA, grant);
  assert.equal(f.service.hasCapability(f.adminA, "coach.workspace"), true);
  assert.throws(() => f.service.hasCapability(f.outsider, "coach.workspace"), /MEMBERSHIP_REQUIRED/);
  assert.equal(f.service.hasCapability(f.coachB, "coach.workspace"), false);
  f.service.revokeEntitlement(f.adminA, ORG_A, "ent-active");
  assert.equal(f.service.hasCapability(f.adminA, "coach.workspace"), false);
  assert.equal(f.store.get("entitlements", ORG_A, "ent-active").state, "revoked");
  assert.equal(f.service.hasCapability(f.adminA, "security.access"), true);
});

test("expired entitlements are denied and unauthorized grants fail", () => {
  const f = fixture();
  f.service.grantEntitlement(f.adminA, {id:"expired", organizationId:ORG_A, capabilityId:"advanced.reporting", source:"Pro", state:"active", startsAt:"2025-01-01T00:00:00Z", expiresAt:"2026-01-01T00:00:00Z"});
  assert.equal(f.service.hasCapability(f.adminA,"advanced.reporting"), false);
  assert.throws(() => f.service.grantEntitlement(f.coachB, {id:"x", organizationId:ORG_B, capabilityId:"coach.workspace", source:"Plus", state:"active", startsAt:"2026-01-01T00:00:00Z"}), /ROLE_DENIED/);
  assert.throws(() => f.service.grantEntitlement(f.outsider, {id:"x", organizationId:ORG_A, capabilityId:"coach.workspace", source:"Plus", state:"active", startsAt:"2026-01-01T00:00:00Z"}), /MEMBERSHIP_REQUIRED/);
});

test("rejects duplicate membership grants, record replacement and cross-academy locations", () => {
  const f = fixture(); seed(f, ORG_A, f.adminA);
  assert.throws(() => f.service.assignMembership(f.adminA, membership(ORG_A,"another","organization_admin")), /DUPLICATE_RECORD_ID/);
  assert.throws(() => f.service.createProgram(f.adminA, program(ORG_A,"academy-local","program-other", ["not-owned"])), /INVALID_PROGRAM_REFERENCE/);
  f.service.createAcademy(f.adminA, academy(ORG_A,"another-academy"));
  assert.throws(() => f.service.createProgram(f.adminA, program(ORG_A,"another-academy","invalid",["location-local"])), /INVALID_PROGRAM_REFERENCE/);
  assert.throws(() => f.service.createAcademy(f.adminA, academy(ORG_A)), /DUPLICATE_RECORD_ID/);
});

test("rejects arbitrary cross-tenant membership creation and entitlement revocation", () => {
  const f = fixture();
  assert.throws(() => f.service.assignMembership(f.adminA, membership(ORG_B,"bad","organization_admin")), /TENANT_BOUNDARY_DENIED/);
  assert.throws(() => f.service.revokeEntitlement(f.adminA, ORG_B, "missing"), /TENANT_BOUNDARY_DENIED/);
});

test("registered products are not automatically approved for release", () => {
  const registry = validateProductRegistry({ schema:"sandman.commercial.registry.v1", products:[{id:"head-coach-wtm",owner:"Head Coach WTM",lifecycle:"private_preview",capabilityIds:["wtm.access"],integrationType:"optional_adapter",dataBoundary:"independent_wtm",compatibilityVersion:"1.0.0",approvedRelease:false}]});
  assert.equal(registry.products[0].approvedRelease,false);
});

test("location manager can invite location staff but cannot activate them",()=>{
  const f=fixture();seed(f,ORG_A,f.adminA);
  f.service.createAcademy(f.adminA,academy(ORG_A,"academy-two"));
  f.service.createLocation(f.adminA,location(ORG_A,"academy-two","location-two"));
  f.store.put("memberships",membership(ORG_A,"manager-one","management","location","location-local","member-manager"));
  const manager=f.identity.mint("manager-one",ORG_A);
  const invite=membership(ORG_A,"new-coach","coach","location","location-local","invite-one","invited");
  assert.equal(f.service.inviteLocationStaff(manager,invite).state,"invited");
  assert.throws(()=>f.service.assignMembership(manager,{...invite,id:"activate-one",state:"active"}),/ROLE_DENIED/);
  assert.throws(()=>f.service.inviteLocationStaff(manager,{...invite,id:"other-site",scopeId:"location-two"}),/ROLE_DENIED|INVITATION_SCOPE_DENIED/);
  assert.throws(()=>f.service.inviteLocationStaff(manager,{...invite,id:"admin-invite",role:"organization_admin",scopeType:"organization",scopeId:ORG_A}),/ROLE_DENIED|INVALID_STAFF_INVITATION/);
  assert.throws(()=>f.service.inviteLocationStaff(manager,{...invite,id:"repeat"}),/DUPLICATE_STAFF_INVITATION/);
  assert.equal(f.store.list("memberships",ORG_A).filter(m=>m.userId==="new-coach").length,1);
});
test("organization admin may invite staff to its locations but not other organizations",()=>{
  const f=fixture();seed(f,ORG_A,f.adminA);seed(f,ORG_B,f.rootB);
  const invite=membership(ORG_A,"new-coach","coach","location","location-local","invite-two","invited");
  assert.equal(f.service.inviteLocationStaff(f.adminA,invite).state,"invited");
  assert.throws(()=>f.service.inviteLocationStaff(f.adminA,{...invite,id:"cross-tenant",organizationId:ORG_B}),/TENANT_BOUNDARY_DENIED/);
  assert.throws(()=>f.service.inviteLocationStaff(f.adminA,{...invite,id:"active-invite",userId:"new-user",state:"active"}),/INVALID_STAFF_INVITATION/);
  assert.throws(()=>f.service.inviteLocationStaff(f.coachB,{...invite,id:"coach-cross",organizationId:ORG_B,userId:"new-other"}),/ROLE_DENIED/);
});
