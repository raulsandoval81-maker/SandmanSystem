import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("first-time Athlete access preserves the coach-issued invitation gate", () => {
  const source = readFileSync("public/access/first-time/first-time.js", "utf8");
  assert.match(source, /params\.get\("id"\)/);
  assert.match(source, /params\.get\("token"\)/);
  assert.match(source, /sandman_magic_email/);
  assert.match(source, /\/athlete-onboarding\/\?id=/);
  assert.match(source, /&token=/);
});

test("Athlete auth activation uses the single first-time entry", () => {
  const html = readFileSync("public/athletes/auth/index.html", "utf8");
  const activationPanel = html.slice(html.indexOf('id="panelActivate"'));
  assert.match(activationPanel, /href="\/access\/first-time\/\?role=athlete"/);
  assert.doesNotMatch(activationPanel, /href="\/athlete-onboarding\/"/);
});

test("binding requires email-backed Auth and updates the existing athlete", () => {
  const source = readFileSync("functions/src/onboardingConfirmStep1.ts", "utf8");
  assert.match(source, /sign_in_provider/);
  assert.match(source, /signInProvider === "anonymous" \|\| !authEmail/);
  assert.match(source, /tx\.update\(athleteRef/);
  assert.doesNotMatch(source, /tx\.create\(athleteRef/);
  assert.doesNotMatch(source, /\.collection\("athletes"\)\.add/);
});

test("binding remains narrow and cannot overwrite athlete progression", () => {
  const source = readFileSync("functions/src/onboardingConfirmStep1.ts", "utf8");
  const update = source.slice(source.indexOf("tx.update(athleteRef"), source.indexOf("tx.update(tokenRef"));
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
});
