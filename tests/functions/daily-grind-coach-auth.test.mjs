import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../../public/coaches/daily-xp/daily-grind.js", import.meta.url),
  "utf8"
);

test("Daily Grind uses the protected Coach guard and never generic anonymous auth", () => {
  assert.match(source, /from "\/assets\/js\/coach-guard\.js"/);
  assert.match(source, /requireCoach/);
  assert.match(source, /coachLoginUrl/);
  assert.doesNotMatch(source, /ensureSignedIn/);
  assert.doesNotMatch(source, /signInAnonymously/);
});

test("startup subscribes only after Coach authorization succeeds", () => {
  assert.match(
    source,
    /async function bootstrapDailyGrind\(\)[\s\S]*await requireDailyGrindCoach\(\);[\s\S]*subscribe\(\);/
  );
  assert.match(source, /await bootstrapDailyGrind\(\)/);
});

test("award path revalidates and uses the verified non-anonymous Coach user", () => {
  assert.match(source, /const access = await requireDailyGrindCoach\(\)/);
  assert.match(source, /const user = access\.user/);
  assert.match(source, /user\.isAnonymous/);
  assert.match(source, /"Authorization": `Bearer \$\{idToken\}`/);
});

test("authentication failure chooses one Coach login destination", () => {
  assert.match(source, /let coachLoginRedirectStarted = false/);
  assert.match(source, /if \(coachLoginRedirectStarted\) return/);
  assert.match(source, /window\.location\.replace\(coachLoginUrl\(\)\)/);
  assert.match(source, /isCoachAuthenticationError\(error\)/);
});

test("snapshot initialization errors are caught without reload or resubscribe", () => {
  assert.match(source, /void initializeDailyGrind\(\)\.catch/);
  assert.match(source, /Daily Grind could not load Coach data/);
});

test("Coach-Verified Practice fallback remains present", () => {
  assert.match(source, /COACH_VERIFIED_PRACTICE_SOURCE = "coach-verified-practice"/);
  assert.match(source, /Coach-Verified Mode · \$\{filtered\.length\} available/);
  assert.match(source, /requestCoachVerifiedPracticeEvidence\(\)/);
});
