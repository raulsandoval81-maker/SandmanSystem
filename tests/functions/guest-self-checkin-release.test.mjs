import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const backend = await readFile(new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../../public/coaches/attendance/session.js", import.meta.url), "utf8");

test("guest arrivals remain pending until an authorized coach verifies eligibility", () => {
  assert.match(backend, /requireActiveStaff\(request\.auth\.uid, PRACTICE_STAFF_ROLES/);
  assert.match(backend, /action === "request_guest"[\s\S]*status: "pending-verification"/);
  assert.match(backend, /action === "approve_guest"[\s\S]*attendanceEligibility\.kind !== "visitor"/);
  assert.match(backend, /Guest requires an approved, active cross-training assignment before verification/);
  assert.match(backend, /\(action === "add" \|\| action === "approve_guest"\)[\s\S]*checkedIn\.set/);
});

test("pending and rejected guests are never treated as checked in", () => {
  const pendingWrite = backend.indexOf("pendingGuests.set(athleteId");
  const checkedInWrite = backend.indexOf("checkedIn.set(athleteId");
  assert.ok(pendingWrite > -1 && checkedInWrite > pendingWrite);
  assert.match(backend, /if \(action === "remove_guest"\) pendingGuests\.delete\(athleteId\)/);
  assert.match(backend, /pendingGuests: \[\.\.\.pendingGuests\.values\(\)\]/);
  assert.doesNotMatch(backend.slice(pendingWrite, backend.indexOf('if (action === "approve_guest")')), /checkedIn\.set/);
});

test("duplicate arrival submissions are idempotent and the client waits for coach review", () => {
  assert.match(backend, /const pendingGuests = new Map/);
  assert.match(backend, /pendingGuests\.set\(athleteId,/);
  assert.match(client, /pendingGuests\.has\(candidate\.id\) \? "Arrival Recorded"/);
  assert.match(client, /action:"request_guest"/);
  assert.match(client, /Arrival recorded\. Coach verifies your eligibility on the next screen\./);
  assert.match(client, /\["approve_guest", "Verify & Check In"\], \["remove_guest", "Remove Request"\]/);
});
