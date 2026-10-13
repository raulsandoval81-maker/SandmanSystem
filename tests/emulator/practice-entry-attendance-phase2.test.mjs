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
    db.doc("athletes/F8_PHASE2_B").set({
      fullName: "Athlete B", locationId: "santa-ynez-valley", journey: "Z2H", rank: "White", tier: "T0",
      programTrack: "zero2hero", track: "foundry8", trackCode: "F8", trackKey: "f8-wrestling",
      discipline: "wrestling", primaryDiscipline: "wrestling", disciplines: ["wrestling"],
      disciplineIds: ["wrestling"], enrolledDisciplines: ["wrestling"],
    }),
    db.doc("athletes/F4_VISITOR_ACTIVE").set({ fullName: "Approved Lompoc Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_INACTIVE").set({ fullName: "Inactive Lompoc Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_EXPIRED").set({ fullName: "Expired Lompoc Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_WRONG_DISCIPLINE").set({ fullName: "Wrong Discipline Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["boxing"] }),
    db.doc("athletes/F4_VISITOR_WRONG_ROSTER").set({ fullName: "Wrong Roster Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_WRONG_HOST").set({ fullName: "Wrong Host Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_UNAPPROVED").set({ fullName: "Unapproved Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_NO_STATUS").set({ fullName: "Missing Status Visitor", locationId: "lompoc", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_SCOPED").set({ fullName: "Youth Roster Visitor", locationId: "lompoc", rosterStatus: "current", journey: "Z2H", disciplineIds: ["wrestling"] }),
    db.doc("athletes/F4_VISITOR_MALFORMED_DATE").set({ fullName: "Malformed Date Visitor", locationId: "lompoc", rosterStatus: "current", journey: "P2L", disciplineIds: ["wrestling"] }),
    db.doc("athleteCrossTrainingAssignments/active-general").set({
      athleteId: "F4_VISITOR_ACTIVE", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "", status: "active", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/inactive-general").set({
      athleteId: "F4_VISITOR_INACTIVE", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "", status: "inactive", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/expired-general").set({
      athleteId: "F4_VISITOR_EXPIRED", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "", status: "active", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-08-01T12:00:00Z")),
      activeTo: admin.firestore.Timestamp.fromDate(new Date("2026-09-10T12:00:00Z")),
    }),
    db.doc("athleteCrossTrainingAssignments/wrong-discipline-general").set({
      athleteId: "F4_VISITOR_WRONG_DISCIPLINE", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["boxing"], rosterId: "", status: "active", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/wrong-roster").set({
      athleteId: "F4_VISITOR_WRONG_ROSTER", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "other-roster", status: "active", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/wrong-host-general").set({
      athleteId: "F4_VISITOR_WRONG_HOST", homeLocationId: "lompoc", hostLocationId: "elk-grove",
      disciplineIds: ["wrestling"], rosterId: "", status: "active", approvedBy: "management-lompoc",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/unapproved-general").set({
      athleteId: "F4_VISITOR_UNAPPROVED", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "", status: "active", approvedBy: "",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/no-status-general").set({
      athleteId: "F4_VISITOR_NO_STATUS", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "", status: "active", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/youth-roster").set({
      athleteId: "F4_VISITOR_SCOPED", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "youth-wrestling", status: "active", approvedBy: "management-syv",
      activeFrom: admin.firestore.Timestamp.fromDate(new Date("2026-09-01T12:00:00Z")), activeTo: null,
    }),
    db.doc("athleteCrossTrainingAssignments/malformed-date-general").set({
      athleteId: "F4_VISITOR_MALFORMED_DATE", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"], rosterId: "", status: "active", approvedBy: "management-syv",
      activeFrom: "2026-09-01T12:00:00Z", activeTo: null,
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

test("Santa Ynez review preserves its home roster and exposes only currently approved Lompoc visitors", async () => {
  const created = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    ...afterFactInput("phase2-cross-training-review"),
  });
  const review = await call(practiceModule.getPracticeAttendanceReview, "coach-phase2", {
    practiceId: created.practiceId,
  });
  const ids = review.roster.map((athlete) => athlete.id);
  assert.equal(ids.includes("F8_PHASE2_A"), true);
  assert.equal(ids.includes("F8_PHASE2_B"), true);
  assert.equal(ids.includes("F4_VISITOR_ACTIVE"), true);
  assert.equal(ids.includes("F4_VISITOR_SCOPED"), true);
  assert.equal(review.roster.find((athlete) => athlete.id === "F4_VISITOR_ACTIVE").isVisitor, true);
  const legacyHome = review.roster.find((athlete) => athlete.id === "F8_PHASE2_B");
  assert.equal(legacyHome.rosterStatus, "current");
  assert.equal(legacyHome.programTrack, "zero2hero");
  assert.equal(legacyHome.track, "foundry8");
  assert.equal(legacyHome.trackCode, "F8");
  assert.equal(legacyHome.trackKey, "f8-wrestling");
  assert.equal(legacyHome.discipline, "wrestling");
  assert.equal(legacyHome.primaryDiscipline, "wrestling");
  assert.deepEqual(legacyHome.disciplines, ["wrestling"]);
  assert.deepEqual(legacyHome.disciplineIds, ["wrestling"]);
  assert.deepEqual(legacyHome.enrolledDisciplines, ["wrestling"]);
  for (const rejected of [
    "F4_VISITOR_INACTIVE", "F4_VISITOR_EXPIRED", "F4_VISITOR_WRONG_DISCIPLINE", "F4_VISITOR_WRONG_ROSTER",
    "F4_VISITOR_WRONG_HOST", "F4_VISITOR_UNAPPROVED", "F4_VISITOR_NO_STATUS",
    "F4_VISITOR_MALFORMED_DATE",
  ]) assert.equal(ids.includes(rejected), false, `${rejected} must remain hidden`);
});

test("visitor check-in and finalization require matching active Wrestling approval", async () => {
  const routed = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    entryMode: "after-the-fact", sessionDateKey: "2026-09-20", locationId: "santa-ynez-valley",
    discipline: "unassigned", program: "attendance-routed", practiceKey: "phase2-routed-visitor",
  });
  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
    practiceId: routed.practiceId, action: "add", athleteId: "F4_VISITOR_ACTIVE",
  });
  const checkedIn = (await db.doc(`attendance_sessions/${routed.practiceId}`).get()).data().checkedIn;
  assert.equal(checkedIn[0].isVisitor, true);
  assert.equal(checkedIn[0].locationId, "lompoc");

  for (const rejected of [
    "F4_VISITOR_INACTIVE", "F4_VISITOR_EXPIRED", "F4_VISITOR_WRONG_DISCIPLINE", "F4_VISITOR_WRONG_ROSTER",
    "F4_VISITOR_WRONG_HOST", "F4_VISITOR_UNAPPROVED", "F4_VISITOR_NO_STATUS",
    "F4_VISITOR_SCOPED", "F4_VISITOR_MALFORMED_DATE",
  ]) {
    await assert.rejects(
      () => call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
        practiceId: routed.practiceId, action: "add", athleteId: rejected,
      }),
      /not approved|not on the current roster/i
    );
  }

  await db.doc(`practiceSessions/${routed.practiceId}`).update({ discipline: "wrestling" });
  const finalized = await call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
    practiceId: routed.practiceId, presentIds: ["F4_VISITOR_ACTIVE"], notes: "Approved crossover",
  });
  assert.equal(finalized.status, "finalized");

  const scoped = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    ...afterFactInput("phase2-youth-roster-visitor"),
  });
  await call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
    practiceId: scoped.practiceId, action: "add", athleteId: "F4_VISITOR_SCOPED",
  });
  const scopedFinalized = await call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
    practiceId: scoped.practiceId, presentIds: ["F4_VISITOR_SCOPED"], notes: "Matching youth roster",
  });
  assert.equal(scopedFinalized.status, "finalized");

  const missingStatusFinalize = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    ...afterFactInput("phase2-missing-status-finalize"),
  });
  await assert.rejects(
    () => call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
      practiceId: missingStatusFinalize.practiceId,
      presentIds: ["F4_VISITOR_NO_STATUS"],
      notes: "Must fail closed",
    }),
    /not on the current roster/i
  );

  const teenScoped = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    ...afterFactInput("phase2-teen-roster-mismatch"), program: "teen-p2l-wrestling",
  });
  await assert.rejects(
    () => call(practiceModule.updatePracticeCheckIn, "coach-phase2", {
      practiceId: teenScoped.practiceId, action: "add", athleteId: "F4_VISITOR_SCOPED",
    }),
    /not approved/i
  );

  const boxing = await call(practiceModule.createOrRecoverCanonicalPractice, "coach-phase2", {
    entryMode: "after-the-fact", sessionDateKey: "2026-09-20", locationId: "santa-ynez-valley",
    discipline: "boxing", program: "teen-p2l-boxing", practiceKey: "phase2-boxing-visitor",
  });
  await assert.rejects(
    () => call(practiceModule.finalizePracticeAttendance, "coach-phase2", {
      practiceId: boxing.practiceId, presentIds: ["F4_VISITOR_ACTIVE"], notes: "Wrong discipline",
    }),
    /not approved for finalization/i
  );
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
