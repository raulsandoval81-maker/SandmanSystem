import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
if (!process.env.SANDMAN_TEST_BUILD_DIR) throw new Error("Temporary Functions build required.");

const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-practice-phase2";
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const practiceModule = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/practice/practiceSessions.js`);

const call = (fn, uid, data) => fn.run({ auth: { uid, token: {} }, data, rawRequest: {} });
const afterFactInput = (practiceKey) => ({
  entryMode: "after-the-fact",
  sessionDateKey: "2026-09-20",
  locationId: "santa-ynez-valley",
  discipline: "wrestling",
  program: "youth-z2h-wrestling",
  practiceKey,
});

before(async () => {
  await Promise.all([
    db.doc("staff/coach-phase2").set({ role: "coach", status: "active", locationIds: ["santa-ynez-valley"] }),
    db.doc("staff/coach-wrong-phase2").set({ role: "coach", status: "active", locationIds: ["lompoc"] }),
    db.doc("staff/admin-phase2").set({ role: "admin", status: "active" }),
    db.doc("athletes/F8_PHASE2_A").set({ fullName: "Athlete A", locationId: "santa-ynez-valley", rosterStatus: "current", journey: "Z2H", rank: "White", tier: "T0" }),
    db.doc("athletes/F8_PHASE2_B").set({ fullName: "Athlete B", locationId: "santa-ynez-valley", rosterStatus: "current", journey: "Z2H", rank: "White", tier: "T0" }),
    db.doc("athletes/F4_PHASE2_VISITOR").set({ fullName: "Lompoc Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", rank: "White", tier: "T0" }),
    db.doc("athletes/F4_PHASE2_UNAUTHORIZED").set({ fullName: "Unauthorized Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", rank: "White", tier: "T0", membershipStatus: "active", financialStatus: "current", visitorAuthorized: true }),
    db.doc("athleteCrossTrainingAssignments/F4_PHASE2_VISITOR_santa-ynez-valley_general").set({
      athleteId: "F4_PHASE2_VISITOR",
      homeLocationId: "lompoc",
      hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"],
      status: "active",
      approvedBy: "management-lompoc",
    }),
  ]);
});

after(async () => admin.app().delete());

test("after-the-fact create/recover and attendance finalization are transactional and idempotent", async () => {
  const first = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", afterFactInput("phase2-morning"));
  const retry = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", afterFactInput("phase2-morning"));
  assert.equal(retry.practiceId, first.practiceId);
  assert.equal(retry.idempotent, true);

  const practiceRef = db.doc(`practiceSessions/${first.practiceId}`);
  await practiceRef.update({ liveSessionId: "phase2-live-room" });
  await db.doc("liveSessions/phase2-live-room").set({ practiceId: first.practiceId, status: "ready" });
  assert.equal((await db.doc(`attendance_sessions/${first.practiceId}`).get()).exists, false);

  const finalized = await call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
    practiceId: first.practiceId,
    presentIds: ["F8_PHASE2_A", "F8_PHASE2_B"],
    notes: "Historical verified roster",
  });
  assert.equal(finalized.attendanceSessionId, first.practiceId);
  assert.equal(finalized.idempotent, false);

  const attendance = (await db.doc(`attendance_sessions/${first.practiceId}`).get()).data();
  assert.equal(attendance.practiceId, first.practiceId);
  assert.equal(attendance.sessionId, first.practiceId);
  assert.equal(attendance.sessionDateKey, "2026-09-20");
  assert.deepEqual(attendance.presentIds, ["F8_PHASE2_A", "F8_PHASE2_B"]);
  assert.deepEqual(attendance.checkedInIds, []);
  assert.deepEqual(attendance.checkedIn, []);
  assert.equal(attendance.present.every((item) => item.checkedInAt === undefined), true);
  assert.equal((await practiceRef.get()).get("status"), "active");
  assert.equal((await db.doc("liveSessions/phase2-live-room").get()).get("status"), "ready");
  for (const athleteId of attendance.presentIds) {
    const memory = await db.doc(`practiceSessions/${first.practiceId}/athletes/${athleteId}`).get();
    assert.equal(memory.exists, true);
    assert.equal(memory.get("attendanceSessionId"), first.practiceId);
  }
  assert.equal((await db.collection("xpLogs").get()).empty, true);

  const exactRetry = await call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
    practiceId: first.practiceId,
    presentIds: ["F8_PHASE2_B", "F8_PHASE2_A"],
    notes: "Historical verified roster",
  });
  assert.equal(exactRetry.idempotent, true);
  assert.equal((await db.collection(`practiceSessions/${first.practiceId}/athletes`).get()).size, 2);

  await assert.rejects(
    () => call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
      practiceId: first.practiceId, presentIds: ["F8_PHASE2_A"], notes: "Historical verified roster",
    }),
    /Finalized attendance cannot be materially changed/i
  );

  await db.doc("xpLogs/phase2-attendance-award").set({
    uid: "F8_PHASE2_A", kind: "ATTENDANCE", meta: { attendanceSessionId: first.practiceId },
  });
  await assert.rejects(
    () => call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
      practiceId: first.practiceId, presentIds: ["F8_PHASE2_A"], notes: "Historical verified roster",
    }),
    /cannot be corrected after attendance-linked XP/i
  );
});

test("checked-in evidence remains separate from the verified present roster", async () => {
  const created = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    ...afterFactInput("phase2-directed"), entryMode: "coach-directed",
  });
  for (const athleteId of ["F8_PHASE2_A", "F8_PHASE2_B"]) {
    await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
      practiceId: created.practiceId, action: "add", athleteId,
    });
  }
  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", { practiceId: created.practiceId, action: "submit" });
  await call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
    practiceId: created.practiceId, presentIds: ["F8_PHASE2_A"], notes: "B did not participate",
  });
  const attendance = (await db.doc(`attendance_sessions/${created.practiceId}`).get()).data();
  assert.deepEqual(attendance.checkedInIds, ["F8_PHASE2_A", "F8_PHASE2_B"]);
  assert.deepEqual(attendance.presentIds, ["F8_PHASE2_A"]);
  assert.deepEqual(attendance.removedFromReviewIds, ["F8_PHASE2_B"]);
});

test("authorized cross-academy visitor is discoverable, reviewable, and finalized without changing home enrollment", async () => {
  const created = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    ...afterFactInput("phase2-cross-academy"), entryMode: "coach-directed",
  });
  const search = await call(practiceModule.searchPracticeAttendanceAthletes, "coach-phase2", {
    practiceId: created.practiceId,
  });
  assert.equal(search.athletes.some((athlete) => athlete.id === "F8_PHASE2_A" && athlete.attendanceEligibility === "local"), true);
  assert.equal(search.athletes.some((athlete) => athlete.id === "F4_PHASE2_VISITOR" && athlete.attendanceEligibility === "visitor"), true);
  assert.equal(search.athletes.some((athlete) => athlete.id === "F4_PHASE2_UNAUTHORIZED"), false);
  await assert.rejects(
    () => call(practiceModule.searchPracticeAttendanceAthletes, "coach-wrong-phase2", { practiceId: created.practiceId }),
    /outside the staff member's authorized scope/i
  );

  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
    practiceId: created.practiceId, action: "add", athleteId: "F8_PHASE2_A",
  });
  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
    practiceId: created.practiceId, action: "add", athleteId: "F4_PHASE2_VISITOR",
  });
  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
    practiceId: created.practiceId, action: "remove", athleteId: "F4_PHASE2_VISITOR",
  });
  const correctedReview = await call(practiceModule.getPracticeAttendanceReview, "coach-phase2", {
    practiceId: created.practiceId,
  });
  assert.equal(correctedReview.roster.some((athlete) => athlete.id === "F4_PHASE2_VISITOR"), false);
  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
    practiceId: created.practiceId, action: "add", athleteId: "F4_PHASE2_VISITOR",
  });
  await assert.rejects(
    () => call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
      practiceId: created.practiceId, action: "add", athleteId: "F4_PHASE2_UNAUTHORIZED",
      visitorAuthorized: true,
    }),
    /ACTIVE_CROSS_TRAINING_ASSIGNMENT_REQUIRED/i
  );

  const review = await call(practiceModule.getPracticeAttendanceReview, "coach-phase2", {
    practiceId: created.practiceId,
  });
  assert.equal(review.roster.some((athlete) => athlete.id === "F4_PHASE2_VISITOR" && athlete.homeLocationId === "lompoc"), true);

  await call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
    practiceId: created.practiceId,
    presentIds: ["F8_PHASE2_A", "F4_PHASE2_VISITOR"],
    notes: "Verified cross-academy attendance",
  });
  const attendance = (await db.doc(`attendance_sessions/${created.practiceId}`).get()).data();
  const visitorEvidence = attendance.present.find((athlete) => athlete.id === "F4_PHASE2_VISITOR");
  assert.equal(visitorEvidence.attendanceEligibility, "visitor");
  assert.equal(visitorEvidence.homeLocationId, "lompoc");
  assert.equal(visitorEvidence.attendanceLocationId, "santa-ynez-valley");
  assert.equal(visitorEvidence.crossTrainingAssignmentId, "F4_PHASE2_VISITOR_santa-ynez-valley_general");
  assert.equal((await db.doc("athletes/F4_PHASE2_VISITOR").get()).get("locationId"), "lompoc");
});

test("Coach location scope fails closed while Admin is permitted", async () => {
  await assert.rejects(
    () => call(practiceModule.createOrRecoverCanonicalPractice, "coach-wrong-phase2", afterFactInput("wrong-scope")),
    /outside the staff member's authorized scope/i
  );
  const adminCreated = await call(practiceModule.createOrRecoverCanonicalPractice, "admin-phase2", afterFactInput("admin-entry"));
  const finalized = await call(practiceModule.finalizePracticeAttendance, "admin-phase2", {
    practiceId: adminCreated.practiceId, presentIds: ["F8_PHASE2_A"], notes: "Admin verified",
  });
  assert.equal(finalized.status, "finalized");
});

test("shared Daily Practice Log survives cross-device read and locks on Final Close", async () => {
  const created = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2",
    afterFactInput("phase2-shared-daily-log"));
  const practiceId = created.practiceId;
  const log = {
    focus: "Wrestling fundamentals",
    blockNotes: { warmup: "Footwork completed" },
    teamNotes: "Computer-to-phone-to-computer handoff",
    eventNotes: "No competition",
    generalNotes: "Mat sanitized",
    individualNotes: { F8_PHASE2_A: "Strong positioning" }
  };
  const saved = await call(practiceModule.saveDailyPracticeLog, "coach-phase2", { practiceId, log });
  assert.equal(saved.ok, true);

  // A second device receives the canonical Firestore record rather than browser localStorage.
  const shared = (await db.doc(`practiceSessions/${practiceId}`).get()).get("dailyPracticeLog");
  assert.equal(shared.teamNotes, log.teamNotes);
  assert.equal(shared.individualNotes.F8_PHASE2_A, "Strong positioning");
  assert.equal(shared.blockNotes.warmup, "Footwork completed");
  assert.equal(shared.savedBy, "coach-phase2");

  await assert.rejects(
    () => call(practiceModule.saveDailyPracticeLog, "coach-wrong-phase2", { practiceId, log }),
    /outside|scope|authorized|owner|permission/i
  );

  // Final close must not silently succeed before attendance has been finalized.
  await assert.rejects(
    () => call(practiceModule.closePracticeSession, "coach-phase2",
      { practiceId, attendanceSessionId: practiceId }),
    /finalized attendance|required before closing/i
  );

  // Sandman requires at least one verified participant and a valid Daily Grind
  // receipt before Final Close. This tests the same closeout gate as production.
  await call(practiceModule.finalizePracticeAttendance, "coach-phase2",
    { practiceId, presentIds: ["F8_PHASE2_A"], notes: "Verified attended practice" });
  await assert.rejects(
    () => call(practiceModule.closePracticeSession, "coach-phase2",
      { practiceId, attendanceSessionId: practiceId }),
    /Daily Grind must be completed/i
  );
  const { awardReceiptKey } = require("../../functions/lib/services/authoritativeXpService.js");
  const receiptId = awardReceiptKey("F8_PHASE2_A", `attendance:${practiceId}`);
  await db.doc(`xpAwardReceipts/${receiptId}`).set({
    result: { ok: true }, athleteId: "F8_PHASE2_A", practiceId
  });
  const completed = await call(practiceModule.completePracticeDailyGrind,
    "coach-phase2", { practiceId, athleteIds: ["F8_PHASE2_A"] });
  assert.equal(completed.readyForDailyGrind, false);
  const closed = await call(practiceModule.closePracticeSession, "coach-phase2",
    { practiceId, attendanceSessionId: practiceId });
  assert.equal(closed.status, "closed");
  assert.equal((await db.doc(`practiceSessions/${practiceId}`).get()).get("dailyPracticeLog.teamNotes"),
    log.teamNotes);

  await assert.rejects(
    () => call(practiceModule.saveDailyPracticeLog, "coach-phase2",
      { practiceId, log: { ...log, teamNotes: "Attempt to overwrite closed record" } }),
    /Closed practice logs cannot be edited/i
  );
});
