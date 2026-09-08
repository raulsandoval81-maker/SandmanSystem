import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const readers = [
  "public/parent/schedule/schedule.js",
  "public/parent/my-athlete/my-athlete.js",
  "public/communications/athlete/schedule-feed.js",
  "public/communications/coach/schedule.js",
  "public/assets/js/coaches-calendar.js",
  "public/assets/js/public-location-schedule.js",
];

test("every audience reader uses the shared location schedule adapter", () => {
  for (const path of readers) {
    const source = read(path);
    assert.match(source, /location-schedule\.js/, path);
    assert.doesNotMatch(source, /doc\(db,\s*["']system["'],\s*["']schedule["']\)/, path);
  }
});

test("Management owns separate draft and published Para-Comms documents", () => {
  const source = read("public/management/schedule/schedule.js");
  assert.match(source, /LOCATION_SCHEDULE_DRAFTS/);
  assert.match(source, /LOCATION_SCHEDULES/);
  assert.match(source, /requireManagement\(\)/);
  assert.match(source, /status:\s*["']published["']/);
});

test("canonical Para-Comms source is keyed by location", () => {
  const source = read("public/assets/js/location-schedule.js");
  assert.match(source, /LOCATION_SCHEDULES = "paraSchedule"/);
  assert.match(source, /LOCATION_SCHEDULE_DRAFTS = "paraScheduleDrafts"/);
  assert.match(source, /"santa-ynez-valley"/);
  assert.match(source, /"lompoc"/);
  assert.match(source, /"elk-grove"/);
  assert.equal((source.match(/SANTA_YNEZ_VALLEY_SCHEDULE_SEED/g) || []).length, 1);
});

test("all public location schedule pages declare their own location key", () => {
  for (const id of ["santa-ynez-valley", "lompoc", "elk-grove"]) {
    const source = read(`public/locations/${id}/schedule.html`);
    assert.match(source, new RegExp(`data-location-schedule="${id}"`));
    assert.match(source, /data-schedule-grid/);
    assert.match(source, /public-location-schedule\.js/);
  }
});

test("rules expose only published schedules and reserve writes for Management/Admin", () => {
  const rules = read("firestore.rules");
  const published = rules.match(/match \/paraSchedule\/\{locationId\}[\s\S]*?match \/paraScheduleDrafts/);
  assert.ok(published);
  assert.match(published[0], /resource\.data\.status == "published"/);
  assert.match(published[0], /isAdminOrManagement\(\)/);
  assert.match(published[0], /managementHasLocation\(locationId\)/);
  assert.doesNotMatch(published[0], /isActiveCoach/);
});

test("Lompoc and Elk Grove do not receive a seeded schedule", () => {
  const management = read("public/management/schedule/schedule.js");
  assert.match(management, /id === "santa-ynez-valley"/);
  assert.doesNotMatch(management, /id === "lompoc"[^\n]+SANTA_YNEZ/);
  assert.doesNotMatch(management, /id === "elk-grove"[^\n]+SANTA_YNEZ/);
});
