import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relative) {
  return fs.readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
}

const directClients = [
  "public/coaches/daily-xp/daily-grind.js",
  "public/coaches/attendance/attendance.js",
  "public/coaches/arena-xp/weekend-arena.js",
  "public/coaches/arena-xp/duel-arena.js",
  "public/coaches/arena-xp/declared-championship.js",
  "public/coaches/tools/arena-log.html",
  "public/coaches/lanes/conditioning/review.js",
  "public/coaches/lanes/strength/review.js",
  "public/coaches/lanes/honor/review.js",
];

test("every active HTTP XP producer uses the shared authenticated client", () => {
  for (const path of directClients) {
    const source = read(path);
    assert.match(source, /postAuthoritativeXp/, `${path} uses shared XP transport`);
    assert.doesNotMatch(source, /x-coach-uid/i, `${path} never trusts a Coach identity header`);
    assert.doesNotMatch(source, /fetch\(XP_URL/, `${path} has no unguarded XP fetch`);
  }
});

test("shared HTTP client requires a non-anonymous Coach and reports only server success", () => {
  const source = read("public/assets/js/authoritative-xp-client.js");
  assert.match(source, /await requireCoach\(\)/);
  assert.match(source, /user\.isAnonymous/);
  assert.match(source, /await user\.getIdToken\(\)/);
  assert.match(source, /Authorization: `Bearer \$\{token\}`/);
  assert.match(source, /!response\.ok \|\| !data\?\.ok/);
  assert.match(source, /throw new AuthoritativeXpRequestError/);
});

test("the active callable XP gateway requires the protected Coach guard", () => {
  const gateway = read("public/assets/js/xp-api.js");
  assert.match(gateway, /await requireCoach\(\);[\s\S]*await _incrementXp\(payload\)/);
  assert.doesNotMatch(gateway, /signInAnonymously/);
});

test("Arena Log supplies canonical kind and stable tournament identity", () => {
  const source = read("public/coaches/tools/arena-log.html");
  assert.match(source, /\bkind,/);
  assert.match(source, /tournamentId,/);
  assert.doesNotMatch(source, /event:\s*kind/);
  assert.match(source, /XP rejected:/);
});

test("Coach Weekly is documented as a preserved placeholder outside V1 certification", () => {
  const inventory = read("docs/releases/xp-client-recovery.md");
  assert.match(inventory, /coach-weekly\.html[^\n]*owner-confirmed placeholder/i);
  assert.match(inventory, /excluded from V1 XP release certification/i);
});

test("failed optimistic Championship awards restore the displayed XP", () => {
  const source = read("public/coaches/arena-xp/championship-arena.js");
  assert.match(source, /catch \(error\) \{[\s\S]*a\.xp = before;[\s\S]*ok: false/);
});

test("legacy Coach Daily shortcut is no longer an active navigation target", () => {
  const tools = read("public/coaches/tools/index.html");
  assert.match(tools, /href="\.\.\/daily-xp\/daily-grind\.html"/);
  assert.doesNotMatch(tools, /href="\.\/coach-daily\.html"/);
});
