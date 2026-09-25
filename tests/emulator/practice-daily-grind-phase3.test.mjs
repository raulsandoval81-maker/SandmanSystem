import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
if (!process.env.SANDMAN_TEST_BUILD_DIR) throw new Error("Temporary Functions build required.");
const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-practice-phase3";
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const practice = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/practice/practiceSessions.js`);
const xp = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/services/authoritativeXpService.js`);
const call = (fn, uid, data) => fn.run({ auth: { uid, token: {} }, data, rawRequest: {} });
const stateKey = (...parts) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

async function athlete(id) {
  await db.doc(`athletes/${id}`).set({
    fullName: id, locationId: "santa-ynez-valley", rosterStatus: "current",
    journey: "Z2H", trackBase: "F8", primaryDiscipline: "wrestling",
    discipline: "wrestling", disciplineIds: ["wrestling"], xp: 0, xpCap: 800,
    stripeCount: 0, progressionTier: "T0", tier: "T0", rankName: "Rookie",
    testing: { state: "ACTIVE" }, tierStatus: "active",
  });
}

async function reconstructed(id, entryMode, date, key) {
  const created = await call(practice.createOrRecoverCanonicalPractice, "coach-phase3", {
    entryMode, sessionDateKey: date, locationId: "santa-ynez-valley",
    discipline: "wrestling", program: "youth-z2h-wrestling", practiceKey: key,
  });
  await call(practice.finalizePracticeAttendance, "coach-phase3", {
    practiceId: created.practiceId, presentIds: [id], notes: "Verified",
  });
  return created.practiceId;
}

async function attendanceAward(id, practiceId) {
  return xp.awardXpAuthoritatively("coach-phase3", {
    uid: id, kind: "ATTENDANCE", amount: 10,
    meta: { source: "daily-grind", attendanceSessionId: practiceId, sessionId: practiceId },
  });
}

before(async () => {
  await db.doc("staff/coach-phase3").set({ role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
  await Promise.all(["F8_P3_NORMAL", "F8_P3_DIRECTED", "F8_P3_AFTER", "F8_P3_ABSENT", "F8_P3_OVERLAP", "F8_P3_AMBIGUOUS"].map(athlete));
});
after(async () => admin.app().delete());

test("Normal, Coach-Directed, and After-the-Fact finalized attendance use one XP path", async () => {
  const normal = await call(practice.openPracticeSession, "coach-phase3", {
    liveSessionId: "p3-normal-live", locationId: "santa-ynez-valley", roomId: "mat-1",
    discipline: "wrestling", journey: "Z2H", program: "youth-z2h-wrestling",
    sessionDateKey: "2026-09-21", durationMinutes: 60,
  });
  await db.doc("liveSessions/p3-normal-live").set({ practiceId: normal.practiceId, status: "ready" }, { merge: true });
  await call(practice.finalizePracticeAttendance, "coach-phase3", { practiceId: normal.practiceId, presentIds: ["F8_P3_NORMAL"], notes: "Normal" });
  const directedId = await reconstructed("F8_P3_DIRECTED", "coach-directed", "2026-09-22", "directed-am");
  const afterId = await reconstructed("F8_P3_AFTER", "after-the-fact", "2026-09-23", "after-pm");

  for (const [id, practiceId, date] of [
    ["F8_P3_NORMAL", normal.practiceId, "2026-09-21"],
    ["F8_P3_DIRECTED", directedId, "2026-09-22"],
    ["F8_P3_AFTER", afterId, "2026-09-23"],
  ]) {
    const first = await attendanceAward(id, practiceId);
    const retry = await attendanceAward(id, practiceId);
    assert.equal(first.idempotent, false);
    assert.equal(retry.idempotent, true);
    assert.equal((await db.doc(`xpLogs/${first.logId}`).get()).get("meta.sessionDateKey"), date);
    assert.equal((await db.doc(`xpLogs/${first.logId}`).get()).get("meta.discipline"), "wrestling");
    const completed = await call(practice.completePracticeDailyGrind, "coach-phase3", { practiceId, athleteIds: [id] });
    assert.equal(completed.readyForDailyGrind, false);
    assert.equal((await db.doc(`practiceSessions/${practiceId}`).get()).get("status"), "active");
  }
  assert.equal((await db.doc("liveSessions/p3-normal-live").get()).get("status"), "ready");
});

test("absent athlete fails and readiness remains recoverable", async () => {
  const practiceId = await reconstructed("F8_P3_AFTER", "after-the-fact", "2026-09-24", "absent-check");
  await assert.rejects(() => attendanceAward("F8_P3_ABSENT", practiceId), /ATHLETE_NOT_PRESENT/);
  assert.equal((await db.doc(`attendance_sessions/${practiceId}`).get()).get("readyForDailyGrind"), true);
});

test("exact Coach-Verified overlap aliases idempotently without a second award", async () => {
  const id = "F8_P3_OVERLAP";
  const coachAward = await xp.awardXpAuthoritatively("coach-phase3", {
    uid: id, kind: "ATTENDANCE", amount: 10,
    meta: { source: "coach-verified-practice", sessionDateKey: "2026-09-21", discipline: "wrestling", practiceKey: "overlap-am" },
  });
  const practiceId = await reconstructed(id, "after-the-fact", "2026-09-21", "overlap-am");
  const attendance = await attendanceAward(id, practiceId);
  assert.equal(attendance.idempotent, true);
  assert.equal(attendance.delta, 0);
  assert.equal(attendance.logId, coachAward.logId);
  assert.equal((await db.doc(`athletes/${id}`).get()).get("xp"), 10);
  const completed = await call(practice.completePracticeDailyGrind, "coach-phase3", { practiceId, athleteIds: [id] });
  assert.equal(completed.readyForDailyGrind, false);
});

test("ambiguous legacy Coach-Verified state fails closed", async () => {
  const id = "F8_P3_AMBIGUOUS";
  const date = "2026-09-22";
  await db.doc(`f8PracticeDayState/${stateKey(id, date, "wrestling")}`).set({ uid: id, dayKey: date, discipline: "wrestling", count: 1, xp: 10 });
  const practiceId = await reconstructed(id, "after-the-fact", date, "legacy-unknown");
  await assert.rejects(() => attendanceAward(id, practiceId), /AMBIGUOUS_LEGACY_COACH_VERIFIED_PRACTICE_OVERLAP/);
  assert.equal((await db.doc(`attendance_sessions/${practiceId}`).get()).get("readyForDailyGrind"), true);
});
