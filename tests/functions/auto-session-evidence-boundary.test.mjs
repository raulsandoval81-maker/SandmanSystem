import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync(new URL("../../public/coaches/execution/session-builder/session-builder.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../../functions/src/modules/skillCheckCoachCall.ts", import.meta.url), "utf8");

test("AUTO never treats the first curriculum wave as verified progression", () => {
  assert.match(builder, /const progressionVerified = false;/);
  assert.match(builder, /!canLaunchAuto\(payload\.trainingGroups, payload\.groupPrescriptions\)/);
  assert.match(readFileSync(new URL("../../public/coaches/execution/session-builder/group-decision-policy.js", import.meta.url), "utf8"), /p\.progressionVerified === true/);
});

test("server group preview remains diagnostic and cannot authorize AUTO", () => {
  assert.match(server, /action === "preview-group-lessons"/);
  assert.match(server, /diagnosticOnly: true/);
  assert.match(server, /eligibleForAuto: false/);
  assert.match(server, /coverageComplete: false, evidenceApproved: false/);
});
