import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("denied guest approvals provide an eligibility reason without admitting the guest", () => {
  const source = readFileSync("functions/src/practice/practiceSessions.ts", "utf8");
  const block = source.slice(source.indexOf('if (action === "approve_guest") {'), source.indexOf('const checkedIn = new Map', source.indexOf('if (action === "approve_guest") {')));
  assert.match(block, /attendanceEligibility\.eligible/);
  assert.match(block, /attendanceEligibility\.kind !== "visitor"/);
  assert.match(block, /attendanceEligibility\.reason/);
  assert.ok(block.indexOf('throw new HttpsError("permission-denied"') < block.indexOf("pendingGuests.delete(athleteId)"));
});
