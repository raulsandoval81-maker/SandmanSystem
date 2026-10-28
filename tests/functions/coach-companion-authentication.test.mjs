import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const companion = fs.readFileSync(
  new URL("../../public/coaches/execution/coach-companion/coach-companion.js", import.meta.url),
  "utf8"
);
const guard = fs.readFileSync(
  new URL("../../public/assets/js/coach-guard.js", import.meta.url),
  "utf8"
);
const companionHtml = fs.readFileSync(
  new URL("../../public/coaches/execution/coach-companion/index.html", import.meta.url),
  "utf8"
);

test("Companion requires an authorized non-anonymous Coach before protected reads", () => {
  assert.match(companion, /coachLoginUrl,[\s\S]*isCoachAuthenticationError,[\s\S]*requireCoach/);
  assert.doesNotMatch(companion, /ensureSignedIn/);
  assert.match(guard, /!user \|\| user\.isAnonymous/);

  const init = companion.slice(companion.indexOf("(async function init()"));
  const gate = init.indexOf("if (!await requireCompanionCoach()) return;");
  assert.ok(gate >= 0, "Companion must stop when Coach authorization is unavailable");
  assert.ok(gate < init.indexOf("await hydrateFromLiveSession()"));
  assert.ok(gate < init.indexOf("subscribeExecutionControl();"));
});

test("missing authentication returns through Coach Login with the complete Companion URL", () => {
  assert.match(companion, /isCoachAuthenticationError\(error\)[\s\S]*window\.location\.replace\(coachLoginUrl\(\)\)[\s\S]*return false/);
  assert.match(guard, /window\.location\.pathname\s*\+\s*window\.location\.search/);
  assert.match(guard, /"\/coaches\/auth\/login\.html\?returnUrl="\s*\+\s*encodeURIComponent\(returnUrl\)/);
  assert.match(companionHtml, /coach-companion\.js\?v=12/);
});

test("staff authorization failures stop without weakening the existing guard", () => {
  assert.match(companion, /Coach Companion authorization failed/);
  assert.match(companion, /Active Coach authorization is required/);
  assert.match(guard, /staffSnapshot\.exists\(\)/);
  assert.match(guard, /staffStatus/);
  assert.match(guard, /locationIds/);
});

test("authentication correction leaves the canonical command channel intact", () => {
  assert.match(companion, /doc\(db, "liveSessions", sessionId\)/);
  assert.match(companion, /practiceId: String\(payload\.practiceId \|\| live\.practiceId \|\| ""\)\.trim\(\)/);
  assert.match(companion, /buildExecutionCommand\([\s\S]*practiceId, sessionId: session\.sessionId/);
  assert.match(companion, /expectedVersion: executionControlVersion/);
  assert.match(companion, /operation: "execution-command"/);
});
