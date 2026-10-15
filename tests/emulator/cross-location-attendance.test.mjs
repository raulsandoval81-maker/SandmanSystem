import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
if (!process.env.SANDMAN_TEST_BUILD_DIR) throw new Error("Temporary Functions build required.");

const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-cross-location";
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const { Timestamp } = admin.firestore;
const practice = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/practice/practiceSessions.js`);
const xp = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/services/authoritativeXpService.js`);

const call = (fn, uid, data) => fn.run({ auth: { uid, token: {} }, data, rawRequest: {} });
const LOMPOC = "lompoc";
const SYV = "santa-ynez-valley";
const now = Date.now();

function athleteData(id, locationId, overrides = {}) {
  return {
    uid: id,
    fullName: id,
    locationId,
    homeLocationId: locationId,
    rosterStatus: "current",
    journey: "Z2H",
    program: "youth-z2h-wrestling",
    trackBase: "F8",
    primaryDiscipline: "wrestling",
    discipline: "wrestling",
    disciplineIds: ["wrestling"],
    xp: 0,
    xpCap: 800,
    stripeCount: 0,
    progressionTier: "T0",
    tier: "T0",
    rank: "Rookie",
    rankName: "Rookie",
    testing: { state: "ACTIVE" },
    tierStatus: "active",
    ...overrides,
  };
}

async function assignment(id, athleteId, homeLocationId, hostLocationId, overrides = {}) {
  await db.doc(`athleteCrossTrainingAssignments/${id}`).set({
    athleteId,
    homeLocationId,
    hostLocationId,
    disciplineIds: ["wrestling"],
    status: "active",
    activeFrom: Timestamp.fromMillis(now - 86_400_000),
    activeTo: Timestamp.fromMillis(now + 86_400_000),
    ...overrides,
  });
}

async function openPractice(uid, locationId, suffix) {
  return call(practice.openPracticeSession, uid, {
    liveSessionId: `${locationId}-${suffix}-live`,
    locationId,
    academyId: locationId,
    roomId: `${suffix}-mat`,
    discipline: "wrestling",
    journey: "Z2H",
    program: "youth-z2h-wrestling",
    sessionDateKey: "2026-10-14",
    executionMode: "manual",
    durationMinutes: 60,
  });
}

async function attendanceAward(uid, coachUid, practiceId) {
  return xp.awardXpAuthoritatively(coachUid, {
    uid,
    kind: "ATTENDANCE",
    amount: 10,
    meta: { source: "daily-grind", attendanceSessionId: practiceId, sessionId: practiceId },
  });
}

before(async () => {
  await Promise.all([
    db.doc("staff/coach-lompoc").set({ role: "coach", status: "active", locationIds: [LOMPOC] }),
    db.doc("staff/coach-syv").set({ role: "coach", status: "active", locationIds: [SYV] }),
    db.doc("staff/coach-elsewhere").set({ role: "coach", status: "active", locationIds: ["elk-grove"] }),
    db.doc("athletes/LOMPOC_HOME").set(athleteData("LOMPOC_HOME", LOMPOC)),
    db.doc("athletes/SYV_HOME").set(athleteData("SYV_HOME", SYV)),
    db.doc("athletes/LOMPOC_NO_ASSIGNMENT").set(athleteData("LOMPOC_NO_ASSIGNMENT", LOMPOC)),
    db.doc("athletes/LOMPOC_EXPIRED").set(athleteData("LOMPOC_EXPIRED", LOMPOC)),
    db.doc("athletes/LOMPOC_REVOKED").set(athleteData("LOMPOC_REVOKED", LOMPOC)),
    db.doc("athletes/LOMPOC_INACTIVE").set(athleteData("LOMPOC_INACTIVE", LOMPOC, { rosterStatus: "inactive" })),
  ]);
  await Promise.all([
    assignment("lompoc-to-syv", "LOMPOC_HOME", LOMPOC, SYV),
    assignment("syv-to-lompoc", "SYV_HOME", SYV, LOMPOC),
    assignment("lompoc-expired", "LOMPOC_EXPIRED", LOMPOC, SYV, {
      activeFrom: Timestamp.fromMillis(now - 172_800_000),
      activeTo: Timestamp.fromMillis(now - 86_400_000),
    }),
    assignment("lompoc-revoked", "LOMPOC_REVOKED", LOMPOC, SYV, { status: "revoked" }),
    assignment("lompoc-inactive", "LOMPOC_INACTIVE", LOMPOC, SYV),
  ]);
});

after(async () => admin.app().delete());

test("server roster exposes only eligible visitors and preserves home identity", async () => {
  const opened = await openPractice("coach-syv", SYV, "roster");
  const review = await call(practice.getPracticeAttendanceReview, "coach-syv", { practiceId: opened.practiceId });
  const byId = new Map(review.roster.map((item) => [item.id, item]));
  assert.equal(byId.get("SYV_HOME").visiting, false);
  assert.equal(byId.get("SYV_HOME").homeLocationId, SYV);
  assert.equal(byId.get("LOMPOC_HOME").visiting, true);
  assert.equal(byId.get("LOMPOC_HOME").homeLocationId, LOMPOC);
  for (const denied of ["LOMPOC_NO_ASSIGNMENT", "LOMPOC_EXPIRED", "LOMPOC_REVOKED", "LOMPOC_INACTIVE"]) {
    assert.equal(byId.has(denied), false, `${denied} must not appear in the authoritative roster`);
  }
  await assert.rejects(
    () => call(practice.getPracticeAttendanceReview, "coach-elsewhere", { practiceId: opened.practiceId }),
    /outside the staff member's authorized scope/i,
  );
});

test("Lompoc athlete attends SYV with one canonical history and one XP award", async () => {
  const opened = await openPractice("coach-syv", SYV, "lompoc-visitor");
  await call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "add", athleteId: "SYV_HOME" });
  await call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "add", athleteId: "LOMPOC_HOME" });
  await call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "add", athleteId: "LOMPOC_HOME" });
  const draft = (await db.doc(`attendance_sessions/${opened.practiceId}`).get()).data();
  assert.deepEqual(draft.checkedInIds.sort(), ["LOMPOC_HOME", "SYV_HOME"]);
  await call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "submit" });
  const finalized = await call(practice.finalizePracticeAttendance, "coach-syv", {
    practiceId: opened.practiceId,
    presentIds: ["SYV_HOME", "LOMPOC_HOME"],
    notes: "Verified host and visitor",
  });
  assert.equal(finalized.idempotent, false);
  const retry = await call(practice.finalizePracticeAttendance, "coach-syv", {
    practiceId: opened.practiceId,
    presentIds: ["LOMPOC_HOME", "SYV_HOME"],
    notes: "Verified host and visitor",
  });
  assert.equal(retry.idempotent, true);

  const attendance = (await db.doc(`attendance_sessions/${opened.practiceId}`).get()).data();
  assert.equal(attendance.locationId, SYV);
  assert.deepEqual(new Set(attendance.presentIds), new Set(["LOMPOC_HOME", "SYV_HOME"]));
  const visitor = (await db.doc("athletes/LOMPOC_HOME").get()).data();
  assert.equal(visitor.locationId, LOMPOC);
  assert.equal(visitor.homeLocationId, LOMPOC);
  assert.equal(visitor.lastAttendanceSessionId, opened.practiceId);
  const history = (await db.doc(`practiceSessions/${opened.practiceId}/athletes/LOMPOC_HOME`).get()).data();
  assert.equal(history.athleteId, "LOMPOC_HOME");
  assert.equal(history.locationId, SYV);
  assert.equal(history.attendance.status, "present");

  const firstAward = await attendanceAward("LOMPOC_HOME", "coach-syv", opened.practiceId);
  const secondAward = await attendanceAward("LOMPOC_HOME", "coach-syv", opened.practiceId);
  assert.equal(firstAward.idempotent, false);
  assert.equal(secondAward.idempotent, true);
  assert.equal((await db.doc("athletes/LOMPOC_HOME").get()).get("xp"), 10);
  await attendanceAward("SYV_HOME", "coach-syv", opened.practiceId);
  const completed = await call(practice.completePracticeDailyGrind, "coach-syv", {
    practiceId: opened.practiceId,
    athleteIds: ["LOMPOC_HOME", "SYV_HOME"],
  });
  assert.equal(completed.remainingIds.includes("LOMPOC_HOME"), false);
  const completedRetry = await call(practice.completePracticeDailyGrind, "coach-syv", {
    practiceId: opened.practiceId,
    athleteIds: ["LOMPOC_HOME", "SYV_HOME"],
  });
  assert.equal(completedRetry.idempotent, true);
  const closed = await call(practice.closePracticeSession, "coach-syv", {
    practiceId: opened.practiceId,
    attendanceSessionId: opened.practiceId,
  });
  assert.equal(closed.status, "closed");
  const closedRetry = await call(practice.closePracticeSession, "coach-syv", {
    practiceId: opened.practiceId,
    attendanceSessionId: opened.practiceId,
  });
  assert.equal(closedRetry.idempotent, true);
});

test("SYV athlete attends Lompoc and denied visitors cannot bypass assignment policy", async () => {
  const opened = await openPractice("coach-lompoc", LOMPOC, "syv-visitor");
  await call(practice.updatePracticeCheckIn, "coach-lompoc", { practiceId: opened.practiceId, action: "add", athleteId: "SYV_HOME" });
  for (const denied of ["LOMPOC_NO_ASSIGNMENT", "LOMPOC_EXPIRED", "LOMPOC_REVOKED"]) {
    await assert.rejects(
      () => call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "add", athleteId: denied }),
      /outside the staff member's authorized scope/i,
    );
  }
  await assert.rejects(
    () => call(practice.updatePracticeCheckIn, "coach-elsewhere", { practiceId: opened.practiceId, action: "add", athleteId: "SYV_HOME" }),
    /outside the staff member's authorized scope/i,
  );
  await call(practice.updatePracticeCheckIn, "coach-lompoc", { practiceId: opened.practiceId, action: "submit" });
  await call(practice.finalizePracticeAttendance, "coach-lompoc", {
    practiceId: opened.practiceId,
    presentIds: ["SYV_HOME"],
    notes: "Verified visitor",
  });
  const attendance = (await db.doc(`attendance_sessions/${opened.practiceId}`).get()).data();
  assert.equal(attendance.locationId, LOMPOC);
  const athlete = (await db.doc("athletes/SYV_HOME").get()).data();
  assert.equal(athlete.locationId, SYV);
  assert.equal(athlete.homeLocationId, SYV);
  const history = (await db.doc(`practiceSessions/${opened.practiceId}/athletes/SYV_HOME`).get()).data();
  assert.equal(history.locationId, LOMPOC);
  const firstAward = await attendanceAward("SYV_HOME", "coach-lompoc", opened.practiceId);
  const secondAward = await attendanceAward("SYV_HOME", "coach-lompoc", opened.practiceId);
  assert.equal(firstAward.idempotent, false);
  assert.equal(secondAward.idempotent, true);
  assert.equal((await db.doc("athletes/SYV_HOME").get()).get("xp"), 20);
  await call(practice.completePracticeDailyGrind, "coach-lompoc", {
    practiceId: opened.practiceId,
    athleteIds: ["SYV_HOME"],
  });
  const closed = await call(practice.closePracticeSession, "coach-lompoc", {
    practiceId: opened.practiceId,
    attendanceSessionId: opened.practiceId,
  });
  assert.equal(closed.status, "closed");
});

test("host Coach rejects missing, expired, revoked, and inactive visiting athletes", async () => {
  const opened = await openPractice("coach-syv", SYV, "denials");
  for (const athleteId of ["LOMPOC_NO_ASSIGNMENT", "LOMPOC_EXPIRED", "LOMPOC_REVOKED"]) {
    await assert.rejects(
      () => call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "add", athleteId }),
      /no authorized assignment/i,
    );
  }
  await assert.rejects(
    () => call(practice.updatePracticeCheckIn, "coach-syv", { practiceId: opened.practiceId, action: "add", athleteId: "LOMPOC_INACTIVE" }),
    /not on the current roster/i,
  );
});

test("home-location attendance remains authorized without cross-training assignment", async () => {
  const opened = await openPractice("coach-lompoc", LOMPOC, "home");
  await call(practice.updatePracticeCheckIn, "coach-lompoc", {
    practiceId: opened.practiceId,
    action: "add",
    athleteId: "LOMPOC_NO_ASSIGNMENT",
  });
  await call(practice.updatePracticeCheckIn, "coach-lompoc", { practiceId: opened.practiceId, action: "submit" });
  const result = await call(practice.finalizePracticeAttendance, "coach-lompoc", {
    practiceId: opened.practiceId,
    presentIds: ["LOMPOC_NO_ASSIGNMENT"],
    notes: "Verified home athlete",
  });
  assert.equal(result.status, "finalized");
});
