import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertAthleteInvitationContext,
  assertConsumableAthleteInvitation,
} from "../../functions/lib/access/accessInvitationPolicy.js";
import {
  readAthleteActivationContext,
  athleteActivationReturnUrl,
  athleteHomeUrl,
} from "../../public/athletes/access/activate/activation-context.js";

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

test("first-time access remains a role chooser and sends Athlete access to the dedicated route", () => {
  const source = readFileSync("public/access/first-time/first-time.js", "utf8");
  const html = readFileSync("public/access/first-time/index.html", "utf8");
  assert.match(source, /href: "\/athletes\/access\/activate\/"/);
  assert.doesNotMatch(source, /athleteOnboardingUrl|athleteActivationUrl|\/athlete-onboarding/);
  assert.doesNotMatch(html, /id="athleteActivationFields"|id="athleteToken"/);
});

test("normal Athlete Auth contains sign-in and recovery but no activation engine", () => {
  const html = readFileSync("public/athletes/auth/index.html", "utf8");
  const source = readFileSync("public/athletes/auth/auth.js", "utf8");
  assert.match(html, /id="loginForm"/);
  assert.doesNotMatch(html, /id="panelActivate"|id="activateAccessBtn"/);
  assert.doesNotMatch(source, /consumeAccessInvitation|sendSignInLinkToEmail|athlete-onboarding/);
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

test("normal sign-in retains password-only recovery and onboarding remains separately available", () => {
  const source = readFileSync("public/athletes/auth/auth.js", "utf8");
  const onboarding = readFileSync("public/athlete-onboarding/onboarding.js", "utf8");
  assert.match(source, /sendPasswordResetEmail/);
  assert.match(source, /signInWithEmailAndPassword/);
  assert.match(onboarding, /signInWithEmailLink/);
  assert.match(onboarding, /updatePassword\(auth\.currentUser, password\)/);
  assert.match(onboarding, /consumeAccessInvitation/);
  assert.match(source, /If an activated athlete account exists/);
});

test("dedicated existing-Athlete access owns magic-link activation and preserves URL context", () => {
  const source = readFileSync("public/athletes/access/activate/activate.js", "utf8");
  assert.match(source, /sendSignInLinkToEmail/);
  assert.match(source, /signInWithEmailLink/);
  assert.match(source, /consume\(\{ tokenId: context\.tokenId \}\)/);
  assert.doesNotMatch(source, /sessionStorage/);
  const context = readAthleteActivationContext("?id=f4_0001&token=private-token&email=ATHLETE%40example.com");
  assert.deepEqual(context, { athleteId: "F4_0001", tokenId: "private-token", email: "athlete@example.com" });
  assert.equal(
    athleteActivationReturnUrl(context, "https://sandman.example"),
    "https://sandman.example/athletes/access/activate/?id=F4_0001&token=private-token&email=athlete%40example.com"
  );
});

test("completed F4 and F8 legacy access always routes to Athlete Home without onboarding", () => {
  const source = readFileSync("public/athletes/access/activate/activate.js", "utf8");
  assert.equal(athleteHomeUrl("F4_0001"), "/athletes/hub/?id=F4_0001");
  assert.equal(athleteHomeUrl("F8_0001"), "/athletes/hub/?id=F8_0001");
  assert.match(source, /window\.location\.replace\(athleteHomeUrl\(context\.athleteId\)\)/);
  assert.doesNotMatch(source, /athlete-onboarding|onboardingIsComplete|completedAt|locks/);
});

test("activation failures expose the failing stage instead of generic profile loading", () => {
  const source = readFileSync("public/athletes/access/activate/activate.js", "utf8");
  assert.doesNotMatch(source, /Error loading profile/);
  for (const stage of ["verifying the secure Athlete sign-in", "creating the Athlete password", "connecting the login to the existing Athlete profile"]) {
    assert.match(source, new RegExp(stage, "i"));
  }
});

test("Management Members links existing Athletes directly to the dedicated activation route", () => {
  const source = readFileSync("public/management/members/members.js", "utf8");
  assert.match(source, /\/athletes\/access\/activate\/\?id=/);
  assert.doesNotMatch(source, /\/access\/first-time\/\?role=athlete/);
});

test("dedicated activation rejects an unrelated signed-in Auth identity before binding", () => {
  const source = readFileSync("public/athletes/access/activate/activate.js", "utf8");
  assert.match(source, /hasSignedInCollision/);
  assert.match(source, /!invitedEmailMatches\(user\)/);
  assert.match(source, /different account is signed in/i);
  assert.match(source, /private window/i);
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
