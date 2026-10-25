import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("public/coaches/attendance/session.js", "utf8");
const backend = readFileSync("functions/src/practice/practiceSessions.ts", "utf8");

test("guest approval moves from pending to canonical checked-in attendance", () => {
  const approval = backend.slice(backend.indexOf('if (action === "approve_guest") {'));
  assert.match(approval, /pendingGuests\.delete\(athleteId\)/);
  assert.match(approval, /action === "add" \|\| action === "approve_guest"/);
  assert.match(approval, /checkedIn\.set\(athleteId,/);
  assert.match(approval, /checkedIn: values, checkedInIds: ids, checkedInCount: ids\.length/);
  assert.match(approval, /pendingGuests: \[\.\.\.pendingGuests\.values\(\)\]/);
});

test("client verifies authoritative approval response before updating the regular roster", () => {
  const handler = client.slice(client.indexOf("async function updatePendingGuest("), client.indexOf("function renderPendingGuestReview()"));
  assert.match(handler, /nextCheckedIn\.has\(id\)/);
  assert.match(handler, /nextPendingGuests\.has\(id\)/);
  assert.ok(handler.indexOf("nextCheckedIn.has(id)") < handler.indexOf("checkedIn = nextCheckedIn"));
  assert.match(handler, /renderCheckedIn\(\)/);
  assert.match(client, /if \(count\) count\.textContent = `\$\{checkedIn\.size\} checked in`/);
});
