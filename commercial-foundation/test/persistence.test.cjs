const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { CommercialFoundation, InMemoryTestIdentityAuthority, OrganizationOnboardingService, PersistentJsonCommercialStore } = require("../lib");

const ORG_A = "org-example", ORG_B = "org-example-2";
const now = () => new Date("2026-11-20T20:00:00Z");
const request = (organizationId, organizationName) => ({
  organizationId, organizationName, academyId:"academy-local", academyName:"Shared Academy",
  locationId:"location-local", locationName:"Shared Gym", programId:"program-local", programName:"Shared Program",
  disciplines:["wrestling","boxing"], administratorUserId:`admin-${organizationId}`, coachUserId:"shared-coach",
  packageSource:"Plus", capabilityIds:["programs.manage","coach.workspace"], startsAt:"2026-01-01T00:00:00Z", expiresAt:"2027-01-01T00:00:00Z"
});
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "sandman-commercial-"));
  const file = join(directory, "commercial.json");
  const identity = new InMemoryTestIdentityAuthority();
  const store = new PersistentJsonCommercialStore(file);
  const foundation = new CommercialFoundation(store, identity, now);
  const onboarding = new OrganizationOnboardingService(foundation);
  return { directory, file, identity, store, foundation, onboarding };
}

test("onboards two durable organizations with overlapping record identifiers", () => {
  const f = setup();
  f.onboarding.onboard(f.identity.mint("system-owner", ORG_A, true), request(ORG_A,"Example Combat Academy"));
  f.onboarding.onboard(f.identity.mint("system-owner", ORG_B, true), request(ORG_B,"Example Wrestling Club"));
  assert.equal(f.store.programs.size, 2);
  assert.equal(f.store.listAudits(ORG_A).every(event => event.selectedOrganizationId === ORG_A), true);
  assert.equal(f.store.listAudits(ORG_B).every(event => event.selectedOrganizationId === ORG_B), true);
  assert.equal(statSync(f.file).mode & 0o777, 0o600);
});

test("records, entitlements and audits survive adapter restart", () => {
  const f = setup(); const root = f.identity.mint("system-owner", ORG_A, true);
  f.onboarding.onboard(root, request(ORG_A,"Example Combat Academy"));
  const before = f.store.listAudits(ORG_A).length;
  const restarted = new PersistentJsonCommercialStore(f.file);
  const authority = new InMemoryTestIdentityAuthority();
  const service = new CommercialFoundation(restarted, authority, now);
  const admin = authority.mint(`admin-${ORG_A}`, ORG_A);
  assert.equal(service.readProgram(admin,"program-local").disciplines.length, 2);
  assert.equal(service.hasCapability(admin,"coach.workspace"), true);
  assert.equal(restarted.listAudits(ORG_A).length, before + 2);
  assert.doesNotThrow(() => JSON.parse(readFileSync(f.file,"utf8")));
});

test("authentication fails closed and switching requires active target membership", () => {
  const f = setup();
  f.onboarding.onboard(f.identity.mint("system-owner", ORG_A, true), request(ORG_A,"A"));
  f.onboarding.onboard(f.identity.mint("system-owner", ORG_B, true), request(ORG_B,"B"));
  const coachA = f.identity.mint("shared-coach", ORG_A);
  assert.throws(() => f.foundation.readProgram({sessionId:"forged"},"program-local"), /UNVERIFIED_IDENTITY/);
  const coachB = f.foundation.switchOrganization(coachA, ORG_B);
  assert.equal(f.foundation.readProgram(coachB,"program-local").organizationId, ORG_B);
  assert.throws(() => f.foundation.switchOrganization(f.identity.mint("outsider",ORG_A), ORG_B), /MEMBERSHIP_REQUIRED/);
});

test("revocation is immediate and persists across restart", () => {
  const f = setup(); const root = f.identity.mint("system-owner", ORG_A, true);
  f.onboarding.onboard(root, request(ORG_A,"A"));
  const coach = f.identity.mint("shared-coach", ORG_A);
  assert.equal(f.foundation.readProgram(coach,"program-local").id,"program-local");
  f.foundation.revokeMembership(f.identity.mint(`admin-${ORG_A}`, ORG_A), ORG_A, "member-coach");
  assert.throws(() => f.foundation.readProgram(coach,"program-local"), /MEMBERSHIP_REQUIRED/);
  const restarted = new PersistentJsonCommercialStore(f.file);
  assert.equal(restarted.get("memberships",ORG_A,"member-coach").state,"revoked");
});

test("suspended organizations deny operational writes", () => {
  const f = setup(); const root = f.identity.mint("system-owner", ORG_A, true);
  f.onboarding.onboard(root, request(ORG_A,"A"));
  f.foundation.suspendOrganization(root, ORG_A);
  const admin = f.identity.mint(`admin-${ORG_A}`, ORG_A);
  assert.throws(() => f.foundation.createAcademy(admin,{id:"second-academy",organizationId:ORG_A,name:"No",state:"active"}), /ORGANIZATION_INACTIVE/);
});

test("durable store rejects corrupt schemas and duplicate records", () => {
  const f = setup(); const root = f.identity.mint("system-owner", ORG_A, true);
  f.onboarding.onboard(root, request(ORG_A,"A"));
  assert.throws(() => f.foundation.createAcademy(f.identity.mint(`admin-${ORG_A}`,ORG_A),{id:"academy-local",organizationId:ORG_A,name:"Overwrite",state:"active"}), /DUPLICATE_RECORD_ID/);
  const corrupt = join(f.directory,"corrupt.json");
  writeFileSync(corrupt, JSON.stringify({schema:"unknown"}));
  assert.throws(() => new PersistentJsonCommercialStore(corrupt), /INVALID_PERSISTENCE_SCHEMA/);
});
