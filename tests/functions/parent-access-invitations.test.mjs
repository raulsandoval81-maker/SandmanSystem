import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertParentInvitationContext,
  assertConsumableParentInvitation,
} from "../../functions/lib/access/accessInvitationPolicy.js";
import {
  isAuthorizedStaffRecord,
  MANAGEMENT_STAFF_ROLES,
} from "../../functions/lib/services/staffAuthorization.js";

const valid = (overrides = {}) => ({
  exists: true,
  role: "parent",
  used: false,
  exp: 2000,
  now: 1000,
  invitationEmail: "parent@example.com",
  authEmail: "parent@example.com",
  invitationAthleteUid: "F8_1000",
  relationshipAthleteUid: "F8_1000",
  invitationRelationshipId: "relationship-1",
  actualRelationshipId: "relationship-1",
  relationshipEmail: "parent@example.com",
  relationshipStatus: "pending",
  existingRelationshipParentUid: "",
  existingAthleteParentUid: "",
  callerUid: "parent-auth-1",
  ...overrides,
});

test("active Management and Admin may issue Parent invitations", () => {
  for (const role of ["admin", "system_admin", "management", "manager", "location_manager"]) {
    assert.equal(isAuthorizedStaffRecord({ role, status: "active" }, MANAGEMENT_STAFF_ROLES), true);
  }
});

test("Coach, inactive staff, and missing staff authority cannot issue", () => {
  assert.equal(isAuthorizedStaffRecord({ role: "coach", status: "active" }, MANAGEMENT_STAFF_ROLES), false);
  assert.equal(isAuthorizedStaffRecord({ role: "management", status: "inactive" }, MANAGEMENT_STAFF_ROLES), false);
  const source = readFileSync("functions/src/access/issueAccessInvitation.ts", "utf8");
  assert.match(source, /if \(!req\.auth\)/);
  assert.match(source, /requireActiveStaff\(req\.auth\.uid, MANAGEMENT_STAFF_ROLES/);
});

test("issuance requires an existing approved relationship context", () => {
  assert.deepEqual(assertParentInvitationContext({
    role: "parent", email: "PARENT@example.com", athleteUid: "f8_1000", relationshipId: "link-1",
  }), { role: "parent", email: "parent@example.com", athleteUid: "F8_1000", relationshipId: "link-1" });
  assert.throws(() => assertParentInvitationContext({ role: "parent", email: "", athleteUid: "F8_1000", relationshipId: "link-1" }), /INVALID_EMAIL/);
  assert.throws(() => assertParentInvitationContext({ role: "parent", email: "p@e.com", athleteUid: "F8_1000", relationshipId: "" }), /MISSING_RELATIONSHIP/);
});

test("wrong Parent email fails consumption", () => {
  assert.throws(() => assertConsumableParentInvitation(valid({ authEmail: "other@example.com" })), /EMAIL_MISMATCH/);
});

test("wrong role fails consumption", () => {
  assert.throws(() => assertConsumableParentInvitation(valid({ role: "coach" })), /WRONG_ROLE/);
});

test("wrong athlete or relationship context fails", () => {
  assert.throws(() => assertConsumableParentInvitation(valid({ relationshipAthleteUid: "F8_OTHER" })), /ATHLETE_MISMATCH/);
  assert.throws(() => assertConsumableParentInvitation(valid({ actualRelationshipId: "other" })), /RELATIONSHIP_MISMATCH/);
  assert.throws(() => assertConsumableParentInvitation(valid({ relationshipStatus: "rejected" })), /RELATIONSHIP_NOT_APPROVED/);
});

test("expired and used invitations fail", () => {
  assert.throws(() => assertConsumableParentInvitation(valid({ exp: 999 })), /INVITATION_EXPIRED/);
  assert.throws(() => assertConsumableParentInvitation(valid({ used: true })), /INVITATION_USED/);
});

test("different existing Parent UID cannot be replaced", () => {
  assert.throws(() => assertConsumableParentInvitation(valid({ existingRelationshipParentUid: "other" })), /DIFFERENT_PARENT_UID/);
  assert.throws(() => assertConsumableParentInvitation(valid({ existingAthleteParentUid: "other" })), /DIFFERENT_PARENT_UID/);
});

test("existing correctly bound Parent account remains valid", () => {
  assert.deepEqual(assertConsumableParentInvitation(valid({
    relationshipStatus: "active",
    existingRelationshipParentUid: "parent-auth-1",
    existingAthleteParentUid: "parent-auth-1",
  })), { email: "parent@example.com", athleteUid: "F8_1000", callerUid: "parent-auth-1" });
});

test("consumption binds server-side without creating an Athlete Auth account", () => {
  const source = readFileSync("functions/src/access/consumeAccessInvitation.ts", "utf8");
  assert.match(source, /tx\.update\(relationshipRef/);
  assert.match(source, /tx\.update\(athleteRef, \{ parentUid: callerUid, updatedAt: stamp \}\)/);
  assert.doesNotMatch(source, /admin\.auth\(\)\.createUser/);
  assert.doesNotMatch(source, /authUid/);
});

test("Parent activation cannot alter athlete XP, rank, or progression", () => {
  const source = readFileSync("functions/src/access/consumeAccessInvitation.ts", "utf8");
  const update = source.slice(source.indexOf("tx.update(athleteRef"), source.indexOf("tx.set(db.doc(`parents/"));
  for (const field of ["xp", "rank", "tier", "stripeCount", "disciplines", "testing", "progression"]) {
    assert.doesNotMatch(update, new RegExp(`\\b${field}\\b`));
  }
});

test("Parent login and recovery remain token-free after activation", () => {
  const source = readFileSync("public/parent/auth.js", "utf8");
  assert.match(source, /signInWithEmailAndPassword/);
  assert.match(source, /sendPasswordResetEmail/);
  assert.match(source, /consumeParentInvitation/);
  assert.match(source, /if \(activationToken\)/);
});

test("tokenless Parent account creation cannot link an athlete", () => {
  const source = readFileSync("public/parent/auth.js", "utf8");
  assert.doesNotMatch(source, /activatePendingLinksForEmail/);
  assert.doesNotMatch(source, /mirrorParentUidToAthlete/);
  assert.doesNotMatch(source, /collection\(db, "parentAthleteLinks"\)/);
  assert.doesNotMatch(source, /updateDoc\(doc\(db, "athletes"/);
});

test("existing linked Parent login does not consume an invitation", () => {
  const source = readFileSync("public/parent/auth.js", "utf8");
  assert.match(source, /if \(activationToken\) \{\s*await consumeParentInvitation/);
  assert.match(source, /signInWithEmailAndPassword/);
});

test("hardened Athlete token path remains unchanged", () => {
  const source = readFileSync("functions/src/onboardingConfirmStep1.ts", "utf8");
  assert.match(source, /onboardingTokens/);
  assert.match(source, /decideOnboardingBinding/);
  assert.match(source, /tx\.update\(tokenRef, \{ usedAt: stamp, usedByUid: userUid \}\)/);
});
