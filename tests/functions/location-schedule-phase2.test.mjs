import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  resolveLocationScheduleLiveState,
} from "../../public/assets/js/location-schedule-live-state.js";

const read = (path) => fs.readFileSync(path, "utf8");
const scheduleSource = read("public/assets/js/location-schedule.js");

test("Santa Ynez seed contains only the approved Monday through Thursday classes", () => {
  assert.equal((scheduleSource.match(/title: /g) || []).length, 10);
  assert.doesNotMatch(scheduleSource, /day: "Friday/);
  assert.doesNotMatch(scheduleSource, /day: "Saturday/);
  assert.match(scheduleSource, /title: "Kid Fit"[\s\S]*?details: "Ages 7\+\."/);
  assert.match(scheduleSource, /title: "Teen Fit"[\s\S]*?details: "Ages 13\+\."/);
  assert.match(scheduleSource, /title: "HIIT Fit"[\s\S]*?start: "18:05"[\s\S]*?end: "18:50"[\s\S]*?Ages 12–13 allowed only with a participating parent/);
});

test("category, provider, and instructor are independent schedule fields", () => {
  assert.match(scheduleSource, /category: "fitness", provider: "yesc"/);
  assert.match(scheduleSource, /category: "combat", provider: "sandman"/);
  assert.match(scheduleSource, /instructor: "Coach Sandoval"/);
  assert.match(scheduleSource, /scheduleCategoryLabel/);
  assert.match(scheduleSource, /scheduleProviderLabel/);
});

test("Pacific schedule state resolves active, next, complete, and empty", () => {
  const rows = [
    { day: "Monday", title: "Kid Fit", start: "16:00", end: "17:00" },
    { day: "Monday", title: "Teen Fit", start: "17:00", end: "18:00" },
  ];

  const next = resolveLocationScheduleLiveState(rows, new Date("2026-09-07T22:00:00Z"));
  assert.equal(next.state, "next");
  assert.equal(next.row.title, "Kid Fit");
  assert.equal(next.minutesUntil, 60);

  const active = resolveLocationScheduleLiveState(rows, new Date("2026-09-07T23:30:00Z"));
  assert.equal(active.state, "active");
  assert.equal(active.row.title, "Kid Fit");

  const complete = resolveLocationScheduleLiveState(rows, new Date("2026-09-08T01:30:00Z"));
  assert.equal(complete.state, "complete");

  const empty = resolveLocationScheduleLiveState(rows, new Date("2026-09-09T19:00:00Z"));
  assert.equal(empty.state, "empty");
});

test("public schedule keeps admissions appointment and local Connect without pricing copy", () => {
  for (const locationId of ["santa-ynez-valley", "lompoc", "elk-grove"]) {
    const source = read(`public/locations/${locationId}/schedule.html`);
    assert.match(source, /Admissions by Appointment/);
    assert.match(source, new RegExp(`/locations/${locationId}/connect\\.html`));
    assert.doesNotMatch(source, /\$80|starting at .*month/i);
  }
});
