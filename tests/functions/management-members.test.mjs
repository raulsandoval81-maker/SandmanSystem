import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  managementLocationScope,
  mapManagementMember,
  memberMatchesSearch,
} from "../../functions/lib/access/managementMemberPolicy.js";

test("existing F4 athlete maps to a compact searchable Member result", () => {
  const member = mapManagementMember("F4_0001", {
    fullName: "R. Maximus Sandoval", rosterStatus: "active",
    programTrack: "path2legend", primaryDiscipline: "wrestling",
    locationId: "santa-ynez-valley", access: { mode: "hybrid" }, authUid: "auth-f4",
  }, [{ status: "active", parentUid: "parent-1" }]);
  assert.equal(member.athleteId, "F4_0001");
  assert.equal(member.name, "R. Maximus Sandoval");
  assert.equal(member.accessMode, "hybrid");
  assert.equal(member.directAccessActive, true);
  assert.equal(member.parentLinkStatus, "active");
  assert.equal(memberMatchesSearch(member, "maximus"), true);
});

test("existing unbound F8 athlete maps as Parent Managed and remains searchable by public name", () => {
  const member = mapManagementMember("F8_0001", {
    publicName: "Shadow Athlete", active: true, programTrack: "road2champion",
    activeDiscipline: "boxing", locationId: "lompoc",
  });
  assert.equal(member.accessMode, "parent_managed");
  assert.equal(member.directAccessActive, false);
  assert.equal(memberMatchesSearch(member, "F8_0001"), true);
  assert.equal(memberMatchesSearch(member, "shadow"), true);
});

test("Management member search respects existing location scope", () => {
  assert.deepEqual(managementLocationScope({ locationIds: ["lompoc", "elk-grove"] }, "management"), ["lompoc", "elk-grove"]);
  assert.deepEqual(managementLocationScope({ locationId: "lompoc" }, "location_manager"), ["lompoc"]);
  assert.equal(managementLocationScope({}, "admin"), null);
  assert.deepEqual(managementLocationScope({}, "management"), []);
});

test("Members browser uses guarded search and existing access callables only", () => {
  const source = readFileSync("public/management/members/members.js", "utf8");
  assert.match(source, /requireManagement\(\)/);
  assert.match(source, /searchManagementMembers/);
  assert.match(source, /issueAccessInvitation/);
  assert.match(source, /transitionAthleteAccessMode/);
  assert.doesNotMatch(source, /updateDoc|setDoc|addDoc|deleteDoc/);
});

test("bound athletes cannot receive duplicate invitations in the Members UI", () => {
  const source = readFileSync("public/management/members/members.js", "utf8");
  assert.match(source, /Duplicate invitations are disabled/);
  assert.match(source, /active \? renderActiveAccess\(member\) : renderInvitationForm\(member\)/);
});

test("hybrid invitations require Parent approval while self-managed invitations do not", () => {
  const source = readFileSync("public/management/members/members.js", "utf8");
  assert.match(source, /accessMode === "hybrid" && .*parentApproval/);
  assert.match(source, /Record Parent approval before issuing hybrid access/);
  assert.match(source, /<option value="self_managed">Self Managed<\/option>/);
});

test("Members summary and transition code do not mutate progression or Parent relationships", () => {
  const browser = readFileSync("public/management/members/members.js", "utf8");
  const transition = readFileSync("functions/src/access/transitionAthleteAccessMode.ts", "utf8");
  assert.match(transition, /\{ "access\.mode": decision\.targetMode \}/);
  for (const field of ["xp", "rank", "tier", "stripe", "progression", "history", "parentUid", "parentAthleteLinks"]) {
    assert.doesNotMatch(browser + transition, new RegExp(`\\b${field}\\b`, "i"));
  }
});

test("existing Parent invitation branch remains covered and unchanged", () => {
  const source = readFileSync("functions/src/access/issueAccessInvitation.ts", "utf8");
  assert.match(source, /assertParentInvitationContext/);
  assert.match(source, /source: "management_parent_access"/);
});
