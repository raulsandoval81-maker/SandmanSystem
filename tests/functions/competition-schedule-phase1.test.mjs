import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const policy = require("../../functions/lib/competitions/competitionPolicy.js");
const seed = require("../../functions/lib/competitions/wrestlingPreseason2026.js");

test("2026 preseason manifest has nine stable draft events", () => {
  const events = seed.wrestlingPreseason2026Manifest();
  assert.equal(events.length, 9);
  assert.equal(new Set(events.map((event) => event.eventId)).size, 9);
  for (const event of events) {
    assert.equal(event.eventId, policy.competitionEventId(event.name, event.startDate));
    assert.equal(event.eventType, "competition");
    assert.equal(event.visibility, "internal");
    assert.equal(event.publicationStatus, "draft");
    assert.equal(event.publishedAt, null);
    assert.equal(event.publishedBy, null);
    assert.equal(event.publishedByRole, null);
    assert.equal(event.startAt, null);
    assert.equal(event.timePrecision, "date");
    assert.equal(event.timeZone, "America/Los_Angeles");
    assert.deepEqual(event.programScopes, ["wrestling"]);
  }
});

test("Cold Iron and World Challenge preserve owner classifications", () => {
  const events = seed.wrestlingPreseason2026Manifest();
  const coldIron = events.find((event) => event.name.includes("Cold Iron"));
  const worldChallenge = events.find((event) => event.name.includes("World Challenge"));
  assert.equal(coldIron.disciplineId, "strength-honor");
  assert.equal(worldChallenge.sanctionCard, null);
  assert.equal(worldChallenge.sanctionNote, "Check SCWAY");
  assert.equal(worldChallenge.endDate, "2026-10-11");
});

test("upcoming logic retains history without treating it as upcoming", () => {
  assert.equal(policy.isUpcomingCompetition({ status:"active", startDate:"2026-09-13" }, "2026-09-12"), true);
  assert.equal(policy.isUpcomingCompetition({ status:"active", startDate:"2026-09-13" }, "2026-09-14"), false);
  assert.equal(policy.isUpcomingCompetition({ status:"completed", startDate:"2026-09-13" }, "2026-09-12"), false);
  assert.equal(policy.isUpcomingCompetition({ status:"active", startDate:"2026-10-10", endDate:"2026-10-11" }, "2026-10-11"), true);
});

test("staff history retains only the most recent 90 days", () => {
  assert.equal(policy.staffCompetitionBucket({ status:"active", startDate:"2026-10-04" }, "2026-09-09"), "upcoming");
  assert.equal(policy.staffCompetitionBucket({ status:"active", startDate:"2026-08-01" }, "2026-09-09"), "history");
  assert.equal(policy.staffCompetitionBucket({ status:"completed", startDate:"2026-05-01" }, "2026-09-09"), "hidden");
  assert.equal(policy.staffCompetitionBucket({ status:"cancelled", startDate:"2026-10-04" }, "2026-09-09"), "history");
});

test("policy rejects invented or malformed date/time data", () => {
  const base = { name:"Event", disciplineId:"wrestling", programScopes:["wrestling"], seasonYear:2026, startDate:"2026-09-13" };
  assert.throws(() => policy.normalizeCompetitionEvent({ ...base, startDate:"2026-02-30" }));
  assert.throws(() => policy.normalizeCompetitionEvent({ ...base, timePrecision:"datetime", startAt:null }));
  assert.throws(() => policy.normalizeCompetitionEvent({ ...base, timeZone:"Mars/Olympus" }));
  assert.equal(policy.normalizeCompetitionEvent({ ...base, timeZone:"America/Denver" }).timeZone, "America/Denver");
  assert.throws(() => policy.normalizeCompetitionEvent({ ...base, weighInAnchorTime:"6am" }));
  assert.equal(policy.normalizeCompetitionEvent({ ...base, weighInAnchorTime:"06:00" }).weighInAnchorTime, "06:00");
  assert.equal(policy.normalizeCompetitionEvent(base).startAt, null);
});

test("athlete relationship identity is deterministic but inert in Phase 1", () => {
  assert.equal(policy.athleteCompetitionEventId("f4_0001", "2026-10-04-wild-west"), "F4_0001__2026-10-04-wild-west");
  assert.deepEqual([...policy.ATHLETE_COMPETITION_STATUSES], ["targeted", "confirmed", "withdrawn"]);
});

test("audit roles distinguish primary, fallback, and oversight actors", () => {
  assert.equal(policy.competitionAuditRole("coach"), "coach");
  assert.equal(policy.competitionAuditRole("management"), "management");
  assert.equal(policy.competitionAuditRole("location_manager"), "management");
  assert.equal(policy.competitionAuditRole("system_admin"), "admin");
});

test("Coach page uses callables and keeps publication explicit", () => {
  const js = fs.readFileSync("public/coaches/competition-schedule/competition-schedule.js", "utf8");
  assert.match(js, /upsertCompetitionEvent/);
  assert.match(js, /setCompetitionPublication/);
  assert.doesNotMatch(js, /setDoc|updateDoc|addDoc/);
  assert.match(js, /Unpublish/);
  assert.doesNotMatch(js, /data-archive/);
  assert.doesNotMatch(js, /data-publication=/);
});

test("save and publication callables use active staff authority and independent states", () => {
  const save = fs.readFileSync("functions/src/competitions/upsertCompetitionEvent.ts", "utf8");
  const publication = fs.readFileSync("functions/src/competitions/setCompetitionPublication.ts", "utf8");
  assert.match(save, /OPERATIONAL_STAFF_ROLES/);
  assert.match(save, /existing\.publicationStatus \|\| "draft"/);
  assert.match(save, /updatedByRole/);
  assert.match(publication, /OPERATIONAL_STAFF_ROLES/);
  assert.match(publication, /\['draft', 'published'\]/);
  assert.match(publication, /publishedByRole/);
  assert.match(publication, /seasonYear/);
  assert.match(publication, /programScope/);
});

test("member reader is published-only and ownership-authorized", () => {
  const source = fs.readFileSync("functions/src/competitions/listMyCompetitionEvents.ts", "utf8");
  assert.match(source, /athlete\.authUid/);
  assert.match(source, /parentAthleteLinks/);
  assert.match(source, /publicationStatus !== "published"/);
  assert.match(source, /programScopes/);
});

test("member countdowns follow thirds hierarchy and default to 06:00", async () => {
  const source = fs.readFileSync("public/assets/js/competition-events.js", "utf8");
  const browser = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const events = Array.from({ length:5 }, (_, index) => ({ name:`E${index}`, startDate:`2026-09-${String(10 + index).padStart(2,"0")}`, timeZone:"America/Los_Angeles", status:"active", publicationStatus:"published" }));
  const prepared = browser.prepareMemberCompetitionEvents(events, new Date("2026-09-09T12:00:00Z"));
  assert.deepEqual(
    prepared.map((event) => event.countdownDetail),
    ["minutes", "minutes", "hours", "hours", "days"]
  );
  assert.equal(browser.zonedEventAnchor(events[0]).getUTCHours(), 13);
  assert.equal(browser.zonedEventAnchor({ ...events[0], weighInAnchorTime:"08:30" }).getUTCHours(), 15);
  assert.equal(browser.zonedEventAnchor({ ...events[0], weighInAnchorTime:"08:30" }).getUTCMinutes(), 30);
  const activeMultiDay = browser.prepareMemberCompetitionEvents([{ ...events[0], startDate:"2026-09-08", endDate:"2026-09-09" }], new Date("2026-09-09T12:00:00Z"));
  assert.equal(activeMultiDay.length, 1);
});
