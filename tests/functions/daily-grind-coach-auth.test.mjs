import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../../public/coaches/daily-xp/daily-grind.js", import.meta.url),
  "utf8"
);
const client = fs.readFileSync(
  new URL("../../public/assets/js/authoritative-xp-client.js", import.meta.url),
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

test("award path revalidates through the shared authenticated XP client", () => {
  assert.match(source, /await requireDailyGrindCoach\(\)/);
  assert.match(source, /await postAuthoritativeXp\(payload\)/);
  assert.match(client, /const access = await requireCoach\(\)/);
  assert.match(client, /user\.isAnonymous/);
  assert.match(client, /await user\.getIdToken\(\)/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(client, /x-coach-uid/i);
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
