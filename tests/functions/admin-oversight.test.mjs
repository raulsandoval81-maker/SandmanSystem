import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { buildAdminOversightSummary } = require("../../functions/lib/admin/adminOversightPolicy.js");
const empty = () => ({ messages: [], leads: [], admissionsRequests: [], appointments: [], proposals: [], intakes: [], athletes: [], practices: [], attendance: [], schedules: [], scheduleDrafts: [], staff: [] });
const record = (id, data) => ({ id, data });

test("oversight groups canonical locations and exposes summaries only", () => {
  const sources = empty();
  sources.messages.push(record("secret-message", { locationId: "lompoc", message: "private body", status: "new", priority: "urgent" }));
  sources.leads.push(record("lead-1", { locationId: "lompoc", fullName: "Private Lead", status: "new" }));
  sources.athletes.push(record("F4_0001", { locationId: "lompoc", fullName: "Private Athlete", authUid: "auth-1", access: { mode: "hybrid" } }));
  sources.practices.push(record("practice-1", { locationId: "lompoc", status: "active" }));
  sources.attendance.push(record("practice-1", { locationId: "lompoc", status: "pending_review" }));
  sources.schedules.push(record("lompoc", { status: "published", publishedAt: { seconds: 10 } }));
  sources.staff.push(record("manager-1", { role: "location_manager", status: "active", fullName: "Manager One", locationId: "lompoc" }));
  sources.staff.push(record("coach-1", { role: "coach", status: "active", fullName: "Coach One", locations: ["lompoc"] }));

  const result = buildAdminOversightSummary(sources, 1_800_000_000_000);
  assert.deepEqual(result.locations.map((item) => item.locationId), ["santa-ynez-valley", "lompoc", "elk-grove"]);
  const lompoc = result.locations.find((item) => item.locationId === "lompoc");
  assert.equal(lompoc.inbox.totalOpen, 1);
  assert.equal(lompoc.inbox.escalated, 1);
  assert.equal(lompoc.pipeline.leads, 1);
  assert.equal(lompoc.members.hybrid, 1);
  assert.equal(lompoc.attendance.openPractices, 1);
  assert.equal(lompoc.attendance.pendingReview, 1);
  assert.equal(lompoc.schedule.status, "published");
  assert.equal(lompoc.staffing.management[0].role, "management");
  assert.equal(lompoc.staffing.coaches[0].role, "coach");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private body"), false);
  assert.equal(serialized.includes("Private Lead"), false);
  assert.equal(serialized.includes("Private Athlete"), false);
});

test("unknown and missing locations surface as system exceptions", () => {
  const sources = empty();
  sources.messages.push(record("message-1", { status: "new" }));
  sources.leads.push(record("lead-1", { locationId: "unknown-city", status: "new" }));
  sources.staff.push(record("coach-1", { role: "coach", status: "active" }));
  const result = buildAdminOversightSummary(sources);
  assert.equal(result.systemExceptions.unknownLocationRecords, 3);
  assert.deepEqual(result.systemExceptions.bySource, [
    { source: "messages", count: 1 },
    { source: "leads", count: 1 },
    { source: "staff", count: 1 },
  ]);
});

test("attendance finalization and schedule draft states remain location-specific", () => {
  const now = new Date("2026-09-14T12:00:00-07:00").getTime();
  const sources = empty();
  sources.attendance.push(record("practice-1", { locationId: "elk-grove", status: "finalized", finalizedAt: new Date("2026-09-14T09:00:00-07:00") }));
  sources.scheduleDrafts.push(record("elk-grove", { status: "draft", updatedAt: new Date(now) }));
  const result = buildAdminOversightSummary(sources, now);
  const elkGrove = result.locations.find((item) => item.locationId === "elk-grove");
  assert.equal(elkGrove.attendance.finalizedToday, 1);
  assert.equal(elkGrove.attendance.recentFinalized, 1);
  assert.equal(elkGrove.schedule.status, "draft");
});

test("the callable uses the shared Admin-only authorization boundary", () => {
  const source = fs.readFileSync("functions/src/admin/getAdminOversightSummary.ts", "utf8");
  assert.match(source, /requireActiveStaff\(request\.auth\.uid, \["admin"\]/);
  assert.equal(source.includes("MANAGEMENT_STAFF_ROLES"), false);
  assert.equal(source.includes("OPERATIONAL_STAFF_ROLES"), false);
});
