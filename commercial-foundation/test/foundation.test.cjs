const test = require("node:test");
const assert = require("node:assert/strict");
const { CommercialFoundation, InMemoryCommercialStore, validateProductRegistry } = require("../lib");

const at = new Date("2026-11-20T20:00:00Z");
function fixture() {
  const store = new InMemoryCommercialStore();
  const service = new CommercialFoundation(store, () => at);
  const systemA = { userId: "system-owner", selectedOrganizationId: "org-example", systemAdmin: true };
  const systemB = { userId: "system-owner", selectedOrganizationId: "org-example-2", systemAdmin: true };
  service.createOrganization(systemA, { id: "org-example", displayName: "Example Combat Academy", state: "active" });
  service.createOrganization(systemB, { id: "org-example-2", displayName: "Example Wrestling Club", state: "active" });
  store.put("memberships", { id: "member-admin-a", userId: "shared-admin", organizationId: "org-example", role: "organization_admin", scopeType: "organization", scopeId: "org-example", state: "active" });
  store.put("memberships", { id: "member-coach-b", userId: "shared-admin", organizationId: "org-example-2", role: "coach", scopeType: "organization", scopeId: "org-example-2", state: "active" });
  return { store, service, adminA: { userId: "shared-admin", selectedOrganizationId: "org-example" }, coachB: { userId: "shared-admin", selectedOrganizationId: "org-example-2" } };
}

test("creates the minimum organization, academy, location, program and disciplines", () => {
  const { service, adminA } = fixture();
  service.createAcademy(adminA, { id: "academy-local", organizationId: "org-example", name: "Main", state: "active" });
  service.createLocation(adminA, { id: "location-local", organizationId: "org-example", academyId: "academy-local", name: "Downtown", state: "active" });
  const program = service.createProgram(adminA, { id: "program-local", organizationId: "org-example", academyId: "academy-local", locationIds: ["location-local"], name: "Youth Combat", disciplines: ["wrestling", "boxing"], state: "active" });
  assert.deepEqual(program.disciplines, ["wrestling", "boxing"]);
});

test("blocks cross-tenant reads even when local identifiers overlap", () => {
  const { service, adminA, coachB, store } = fixture();
  service.createAcademy(adminA, { id: "academy-local", organizationId: "org-example", name: "Shared Name", state: "active" });
  service.createLocation(adminA, { id: "location-local", organizationId: "org-example", academyId: "academy-local", name: "Shared Name", state: "active" });
  service.createProgram(adminA, { id: "program-local", organizationId: "org-example", academyId: "academy-local", locationIds: ["location-local"], name: "Shared Name", disciplines: ["wrestling"], state: "active" });
  assert.throws(() => service.readProgram(coachB, "program-local"), /TENANT_BOUNDARY_DENIED/);
  assert.equal(store.audits.at(-1).outcome, "rejected");
});

test("a coach cannot self-escalate and an organization admin cannot assign system authority", () => {
  const { service, adminA, coachB } = fixture();
  assert.throws(() => service.assignMembership(coachB, { id: "escalation", userId: "shared-admin", organizationId: "org-example-2", role: "organization_admin", scopeType: "organization", scopeId: "org-example-2", state: "active" }), /ROLE_DENIED/);
  assert.throws(() => service.assignMembership(adminA, { id: "global-escalation", userId: "shared-admin", organizationId: "org-example", role: "system_admin", scopeType: "organization", scopeId: "org-example", state: "active" }), /SYSTEM_ROLE_NOT_ASSIGNABLE/);
});

test("selected organization limits a multi-membership user", () => {
  const { service, adminA, coachB } = fixture();
  service.createAcademy(adminA, { id: "academy-a", organizationId: "org-example", name: "A", state: "active" });
  assert.throws(() => service.createAcademy(coachB, { id: "academy-b", organizationId: "org-example-2", name: "B", state: "active" }), /ROLE_DENIED/);
});

test("rejects invalid organization references", () => {
  const { service, adminA } = fixture();
  assert.throws(() => service.createAcademy(adminA, { id: "bad-academy", organizationId: "org-missing", name: "Bad", state: "active" }), /TENANT_BOUNDARY_DENIED/);
});

test("enforces active and unexpired entitlements without deleting data on revoke", () => {
  const { service, adminA, store } = fixture();
  service.grantEntitlement(adminA, { id: "ent-active", organizationId: "org-example", capabilityId: "coach.workspace", source: "Plus", state: "active", startsAt: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" });
  service.grantEntitlement(adminA, { id: "ent-expired", organizationId: "org-example", capabilityId: "advanced.reporting", source: "Pro", state: "active", startsAt: "2025-01-01T00:00:00Z", expiresAt: "2026-01-01T00:00:00Z" });
  assert.equal(service.hasCapability(adminA, "coach.workspace"), true);
  assert.equal(service.hasCapability(adminA, "advanced.reporting"), false);
  service.revokeEntitlement(adminA, "ent-active");
  assert.equal(service.hasCapability(adminA, "coach.workspace"), false);
  assert.equal(store.entitlements.has("ent-active"), true);
  assert.equal(service.hasCapability(adminA, "security.access"), true);
});

test("registry validation separates registration from release approval", () => {
  const registry = validateProductRegistry({ schema: "sandman.commercial.registry.v1", products: [{ id: "head-coach-wtm", owner: "Head Coach WTM", lifecycle: "private_preview", capabilityIds: ["wtm.access"], integrationType: "optional_adapter", dataBoundary: "independent_wtm", compatibilityVersion: "1.0.0", approvedRelease: false }] });
  assert.equal(registry.products[0].approvedRelease, false);
  assert.equal(Object.prototype.hasOwnProperty.call(registry.products[0], "customerData"), false);
});
