import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertAthleteInvitationContext,
  assertConsumableAthleteInvitation,
} from "../../functions/lib/access/accessInvitationPolicy.js";

const consumable = (overrides = {}) => ({
  exists: true,
  role: "athlete",
  used: false,
  exp: 2000,
  now: 1000,
  invitationEmail: "athlete@example.com",
  authEmail: "athlete@example.com",
  invitationAthleteUid: "F8_0001",
  actualAthleteUid: "F8_0001",
  accessMode: "self_managed",
  parentApproved: false,
  existingAthleteAuthUid: "",
  callerUid: "athlete-auth-1",
  callerAthleteIds: [],
  ...overrides,
});

test("first-time Athlete access preserves the coach-issued invitation gate", () => {
  const source = readFileSync("public/access/first-time/first-time.js", "utf8");
  assert.match(source, /params\.get\("id"\)/);
  assert.match(source, /params\.get\("token"\)/);
  assert.match(source, /\/athletes\/auth\/\?mode=activate&id=/);
  assert.match(source, /&token=/);
  assert.match(source, /&email=/);
  assert.doesNotMatch(source, /\/athlete-onboarding\/\?id=/);
});

test("Athlete auth activation is handled in Athlete Auth rather than onboarding", () => {
  const html = readFileSync("public/athletes/auth/index.html", "utf8");
  const activationPanel = html.slice(html.indexOf('id="panelActivate"'));
  assert.match(activationPanel, /id="activateAccessBtn"/);
  assert.doesNotMatch(activationPanel, /href="\/athlete-onboarding\/"/);
});

test("shared Athlete activation requires email-backed Auth and updates the existing athlete", () => {
  const source = readFileSync("functions/src/access/consumeAccessInvitation.ts", "utf8");
  assert.match(source, /sign_in_provider/);
  assert.match(source, /sign_in_provider === "anonymous"/);
  assert.match(source, /tx\.update\(athleteRef/);
  assert.doesNotMatch(source, /tx\.create\(athleteRef/);
  assert.doesNotMatch(source, /\.collection\("athletes"\)\.add/);
});

test("Athlete invitation validates access modes and hybrid Parent approval", () => {
  assert.deepEqual(assertAthleteInvitationContext({
    role: "athlete", email: "ATHLETE@example.com", athleteUid: "f8_0001",
    accessMode: "hybrid", parentApproved: true,
  }), {
    role: "athlete", email: "athlete@example.com", athleteUid: "F8_0001",
    accessMode: "hybrid", parentApproved: true,
  });
  assert.throws(() => assertAthleteInvitationContext({
    role: "athlete", email: "athlete@example.com", athleteUid: "F8_0001",
    accessMode: "hybrid", parentApproved: false,
  }), /PARENT_APPROVAL_REQUIRED/);
  assert.throws(() => assertAthleteInvitationContext({
    role: "athlete", email: "", athleteUid: "F8_0001",
    accessMode: "parent_managed", parentApproved: false,
  }), /INVALID_EMAIL|DIRECT_ACCESS_NOT_ALLOWED/);
  for (const accessMode of ["hybrid", "self_managed"]) {
    assert.doesNotThrow(() => assertAthleteInvitationContext({
      role: "athlete", email: "athlete@example.com", athleteUid: "F8_0001",
      accessMode, parentApproved: accessMode === "hybrid",
    }));
  }
});

test("Athlete invitation is expiring, single-use, email-bound, and athlete-bound", () => {
  assert.throws(() => assertConsumableAthleteInvitation(consumable({ used: true })), /INVITATION_USED/);
  assert.throws(() => assertConsumableAthleteInvitation(consumable({ exp: 999 })), /INVITATION_EXPIRED/);
  assert.throws(() => assertConsumableAthleteInvitation(consumable({ authEmail: "other@example.com" })), /EMAIL_MISMATCH/);
  assert.throws(() => assertConsumableAthleteInvitation(consumable({ actualAthleteUid: "F8_OTHER" })), /ATHLETE_MISMATCH/);
});

test("conflicting Athlete Auth bindings fail closed", () => {
  assert.throws(() => assertConsumableAthleteInvitation(consumable({ existingAthleteAuthUid: "different-auth" })), /DIFFERENT_ATHLETE_UID/);
  assert.throws(() => assertConsumableAthleteInvitation(consumable({ callerAthleteIds: ["F8_OTHER"] })), /CALLER_ALREADY_BOUND/);
  assert.doesNotThrow(() => assertConsumableAthleteInvitation(consumable({
    existingAthleteAuthUid: "athlete-auth-1", callerAthleteIds: ["F8_0001"],
  })));
});

test("binding remains narrow and cannot overwrite athlete progression or relationships", () => {
  const source = readFileSync("functions/src/access/consumeAccessInvitation.ts", "utf8");
  const update = source.slice(source.indexOf("tx.update(athleteRef"), source.indexOf("tx.update(invitationRef"));
  for (const field of ["xp", "lifetimeXp", "xpCap", "stripeCount", "tier",
    "progressionTier", "curriculumTier", "rank", "rankName", "disciplines", "parentUid"]) {
    assert.doesNotMatch(update, new RegExp(`\\b${field}\\b`));
  }
});

test("normal sign-in retains password-only recovery", () => {
  const source = readFileSync("public/athletes/auth/auth.js", "utf8");
  const onboarding = readFileSync("public/athlete-onboarding/onboarding.js", "utf8");
  assert.match(source, /sendPasswordResetEmail/);
  assert.match(source, /signInWithEmailAndPassword/);
  assert.match(onboarding, /signInWithEmailLink/);
  assert.match(onboarding, /updatePassword\(auth\.currentUser, password\)/);
  assert.match(onboarding, /consumeAccessInvitation/);
  assert.match(source, /If an activated athlete account exists/);
});

test("Athlete Auth owns magic-link activation and preserves invitation context in the URL", () => {
  const source = readFileSync("public/athletes/auth/auth.js", "utf8");
  assert.match(source, /sendSignInLinkToEmail/);
  assert.match(source, /signInWithEmailLink/);
  assert.match(source, /url\.searchParams\.set\("id", activationAthleteId\)/);
  assert.match(source, /url\.searchParams\.set\("token", activationToken\)/);
  assert.match(source, /url\.searchParams\.set\("email", activationEmail\)/);
  assert.match(source, /consume\(\{ tokenId: activationToken \}\)/);
  assert.doesNotMatch(source, /sessionStorage/);
});

test("completed legacy onboarding routes to Athlete Home and is not restarted", () => {
  const source = readFileSync("public/athletes/auth/auth.js", "utf8");
  assert.match(source, /function onboardingIsComplete/);
  assert.match(source, /onboarding\.status === "complete"/);
  assert.match(source, /onboarding\.completedAt/);
  assert.match(source, /`\/athletes\/hub\/\?id=/);
});

test("activation failures expose the failing stage instead of generic profile loading", () => {
  const source = readFileSync("public/athletes/auth/auth.js", "utf8");
  assert.doesNotMatch(source, /Error loading profile/);
  for (const stage of ["verifying the emailed sign-in link", "creating the Athlete password", "binding direct access to the existing Athlete"]) {
    assert.match(source, new RegExp(stage, "i"));
  }
});

test("successful legacy activation preserves onboarding and consumes once", () => {
  const source = readFileSync("functions/src/access/consumeAccessInvitation.ts", "utf8");
  const athleteBranch = source.slice(source.indexOf('if (String(invitation.role || "") === "athlete")'), source.indexOf("const relationshipId"));
  assert.match(athleteBranch, /authUid: callerUid/);
  assert.match(athleteBranch, /mode: decision\.accessMode/);
  assert.match(athleteBranch, /parentApproved: decision\.parentApproved/);
  assert.match(athleteBranch, /activatedAt: stamp/);
  assert.match(athleteBranch, /invitationId: tokenId/);
  assert.match(athleteBranch, /used: true, usedAt: stamp, usedBy: callerUid/);
  assert.doesNotMatch(athleteBranch, /onboarding|parentUid|parentAthleteLinks|\bxp\b|\brank\b|\btier\b|stripe|history/);
});

test("Management issues Athlete access through the shared invitation service", () => {
  const source = readFileSync("public/intake-management/management.intake.js", "utf8");
  assert.match(source, /role: "athlete"/);
  assert.match(source, /accessMode, parentApproved/);
  assert.doesNotMatch(source, /createAthleteOnboardingToken/);
});

test("parent-managed access needs neither athlete email nor Auth binding", () => {
  const source = readFileSync("functions/src/access/accessInvitationPolicy.ts", "utf8");
  assert.match(source, /"parent_managed", "hybrid", "self_managed"/);
  assert.match(source, /DIRECT_ATHLETE_ACCESS_MODES/);
  assert.throws(() => assertAthleteInvitationContext({
    role: "athlete", email: "athlete@example.com", athleteUid: "F8_0001",
    accessMode: "parent_managed", parentApproved: false,
  }), /DIRECT_ACCESS_NOT_ALLOWED/);
});

test("hybrid to self-managed transition retains athlete identity and relationships", async () => {
  const { assertAthleteAccessTransition } = await import("../../functions/lib/access/accessInvitationPolicy.js");
  assert.deepEqual(assertAthleteAccessTransition({
    currentMode: "hybrid", targetMode: "self_managed", existingAuthUid: "athlete-auth-1",
  }), { currentMode: "hybrid", targetMode: "self_managed", already: false });
  assert.equal(assertAthleteAccessTransition({
    currentMode: "self_managed", targetMode: "self_managed", existingAuthUid: "athlete-auth-1",
  }).already, true);
  const source = readFileSync("functions/src/access/transitionAthleteAccessMode.ts", "utf8");
  assert.match(source, /tx\.update\(athleteRef, \{ "access\.mode": decision\.targetMode \}\)/);
  assert.doesNotMatch(source, /tx\.create|authUid:|parentUid|parentAthleteLinks/);
  for (const field of ["xp", "rank", "tier", "stripe", "progression", "history", "disciplines"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${field}\\b`, "i"));
  }
});
