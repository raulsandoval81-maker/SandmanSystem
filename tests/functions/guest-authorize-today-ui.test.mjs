import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui=readFileSync("public/coaches/attendance/session.js","utf8");
const assignment=readFileSync("functions/src/schedules/upsertAthleteCrossTrainingAssignment.ts","utf8");

test("guest authorization is an explicit coach action, not automatic on ordinary approval",()=>{
  assert.match(ui,/\["authorize_guest", "Authorize Today & Check In"\]/);
  const authorize=ui.slice(ui.indexOf("async function authorizeGuestForTodayAndCheckIn"),ui.indexOf("async function updatePendingGuest"));
  assert.match(authorize,/upsertAthleteCrossTrainingAssignment/);
  assert.match(authorize,/activeTo: expiresAt\.toISOString\(\)/);
  assert.match(authorize,/rosterId: activePractice\.practiceId/);
  assert.match(authorize,/await updatePendingGuest\("approve_guest", id\)/);
  assert.ok(authorize.indexOf("await authorize(")<authorize.indexOf('await updatePendingGuest("approve_guest", id)'));
});
test("authorization backend retains coach scope and enrolled-discipline checks",()=>{
  assert.match(assignment,/requireActiveStaff/);
  assert.match(assignment,/canStaffManageCrossTraining/);
  assert.match(assignment,/athleteDisciplines\.has\(id\)/);
});
