import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const require = createRequire(import.meta.url);
const { initializeApp, deleteApp, getApps } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth: getAdminAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore } = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "sandmandashboard-attendance-v1";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";

if (!FIRESTORE_HOST || !AUTH_HOST) {
  throw new Error("Attendance lifecycle tests require Firestore and Auth emulators.");
}

const adminApp = getApps().find((app) => app.name === "attendance-v1-admin")
  || initializeApp({ projectId: PROJECT_ID }, "attendance-v1-admin");
const adminDb = getFirestore(adminApp);
const clients = [];

async function callableClient(uid, staff = null) {
  if (staff) await adminDb.doc(`staff/${uid}`).set(staff);
  const app = initializeClientApp({ apiKey: "emulator-key", projectId: PROJECT_ID }, `attendance-${uid}-${clients.length}`);
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const token = await getAdminAuth(adminApp).createCustomToken(uid);
  await signInWithCustomToken(auth, token);
  const functions = getFunctions(app, "us-central1");
  const [host, port] = FUNCTIONS_HOST.split(":");
  connectFunctionsEmulator(functions, host, Number(port));
  return {
    open: httpsCallable(functions, "openPracticeSession"),
    get: httpsCallable(functions, "getPracticeSession"),
    close: httpsCallable(functions, "closePracticeSession"),
    saveMemory: httpsCallable(functions, "savePracticeSessionMemory"),
    listManagement: httpsCallable(functions, "listManagementAttendance"),
  };
}

function practiceInput(overrides = {}) {
  return {
    liveSessionId: "lompoc-mat-1",
    locationId: "lompoc",
    academyId: "lompoc",
    roomId: "mat-1",
    discipline: "wrestling",
    journey: "P2L",
    program: "teen-p2l-wrestling",
    track: "Foundry 4",
    tier: "T0",
    schema: "standard-60",
    executionMode: "manual",
    durationMinutes: 60,
    ...overrides,
  };
}

before(async () => {
  const collections = await adminDb.listCollections();
  await Promise.all(collections.map(async (collection) => {
    const docs = await collection.listDocuments();
    await Promise.all(docs.map((ref) => ref.delete()));
  }));
});

after(async () => {
  await Promise.all(clients.map(deleteClientApp));
  await deleteApp(adminApp);
});

test("authenticated canonical practice lifecycle and Attendance identity", async (t) => {
  const coach = await callableClient("COACH_ATTENDANCE_V1", { role: "coach", status: "active", locationId: "lompoc" });
  const sameLocationCoach = await callableClient("COACH_SAME_LOCATION", { role: "coach", status: "active", locationId: "lompoc" });
  const otherCoach = await callableClient("COACH_OTHER_LOCATION", { role: "coach", status: "active", locationId: "elk-grove" });
  const admin = await callableClient("ADMIN_ATTENDANCE_V1", { role: "admin", status: "active", locationIds: [] });
  const management = await callableClient("MANAGEMENT_ATTENDANCE_V1", { role: "management", status: "active", locationId: "lompoc" });
  const otherManagement = await callableClient("MANAGEMENT_OTHER_LOCATION", { role: "management", status: "active", locationId: "elk-grove" });
  const inactiveCoach = await callableClient("COACH_INACTIVE", { role: "coach", status: "inactive", locationId: "lompoc" });
  const nonStaff = await callableClient("ATHLETE_NOT_STAFF");

  await t.test("non-staff and invalid requests fail closed", async () => {
    await assert.rejects(() => nonStaff.open(practiceInput()), /permission-denied|Active Coach or staff access required/i);
    await assert.rejects(() => coach.open(practiceInput({ discipline: "" })), /discipline is required/i);
    await assert.rejects(() => otherCoach.open(practiceInput()), /outside the staff member's authorized scope/i);
    await assert.rejects(
      () => coach.open(practiceInput({ practiceId: "client-selected-missing" })),
      /not-found|supplied practiceId does not exist/i
    );
    assert.equal((await adminDb.doc("practiceSessions/client-selected-missing").get()).exists, false);
    await assert.rejects(
      () => coach.saveMemory({ operation: "reflection", reflection: { worked: "No identity" } }),
      /practiceId is required/i
    );
    await assert.rejects(() => coach.get({ practiceId: "missing-practice" }), /not-found|Practice not found/i);
    await assert.rejects(() => nonStaff.close({ practiceId: "missing-practice", attendanceSessionId: "missing" }), /permission-denied|Active Coach or staff access required/i);
    await assert.rejects(() => inactiveCoach.open(practiceInput()), /permission-denied|active/i);
    await assert.rejects(() => coach.get({ practiceId: "bad/path" }), /practiceId is invalid/i);
    await assert.rejects(() => coach.get({ practiceId: "x".repeat(161) }), /practiceId is invalid/i);
  });

  const openedA = (await coach.open(practiceInput())).data;
  const practiceAId = openedA.practiceId;

  await t.test("open creates a unique canonical practice and room pointer", async () => {
    assert.ok(practiceAId);
    assert.notEqual(practiceAId, "lompoc-mat-1");
    const practice = (await adminDb.doc(`practiceSessions/${practiceAId}`).get()).data();
    assert.equal(practice.practiceId, practiceAId);
    assert.equal(practice.liveSessionId, "lompoc-mat-1");
    assert.equal(practice.roomId, "mat-1");
    assert.equal(practice.locationId, "lompoc");
    assert.equal(practice.discipline, "wrestling");
    assert.equal(practice.coachUid, "COACH_ATTENDANCE_V1");
    assert.equal(practice.coachRole, "coach");
    assert.equal(practice.status, "active");
    assert.equal(practice.executionMode, "manual");
    assert.ok(practice.openedAt);
    const live = (await adminDb.doc("liveSessions/lompoc-mat-1").get()).data();
    assert.equal(live.practiceId, practiceAId);
    assert.equal(live.roomId, "mat-1");
  });

  await t.test("session memory is scoped, compact, idempotent, and keeps planned distinct from worked", async () => {
    await coach.saveMemory({
      practiceId: practiceAId,
      operation: "plan",
      planVersion: 1,
      plannedBlocks: [
        { blockId: "technique", title: "Technique", minutes: 20, cards: [
          { cardId: "double-leg-entry", title: "Double Leg Entry" },
          { cardId: "double-leg-finish", title: "Double Leg Finish" },
          { cardId: "mat-talk", title: "Mat Talk" },
          { cardId: "single-leg", title: "Single Leg" },
        ] },
      ],
      plannedCards: [
        { cardId: "double-leg-entry", blockId: "technique", title: "Double Leg Entry", skillId: "double-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "double-leg-finish", blockId: "technique", title: "Double Leg Finish", skillId: "double-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "mat-talk", blockId: "technique", title: "Mat Talk", discipline: "wrestling" },
        { cardId: "single-leg", blockId: "technique", title: "Single Leg", skillId: "single-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "boxing-jab", blockId: "technique", title: "Jab", skillId: "jab", familyId: "hands", discipline: "boxing" },
      ],
    });
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "plan", planVersion: Number.NaN, plannedBlocks: [], plannedCards: [] }),
      /planVersion is invalid|cannot be encoded in JSON/i
    );
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "plan", planVersion: Number.POSITIVE_INFINITY, plannedBlocks: [], plannedCards: [] }),
      /planVersion is invalid|cannot be encoded in JSON/i
    );
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "plan", planVersion: 2, plannedBlocks: [{ blockId: "bad-minutes", minutes: Number.NaN }], plannedCards: [] }),
      /block minutes is invalid|cannot be encoded in JSON/i
    );
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "plan", planVersion: 2, plannedBlocks: [], plannedCards: Array.from({ length: 81 }, (_, i) => ({ cardId: `card-${i}` })) }),
      /more than 80 cards/i
    );
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "worked", workedBlocks: [], workedCards: [{ cardId: "unplanned-injection" }] }),
      /must reference the saved practice plan/i
    );
    await coach.saveMemory({
      practiceId: practiceAId,
      operation: "worked",
      executionStarted: true,
      workedBlocks: [{ blockId: "technique", title: "Technique", minutes: 20 }],
      workedCards: [
        { cardId: "double-leg-entry", blockId: "technique", title: "Double Leg Entry", skillId: "double-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "double-leg-finish", blockId: "technique", title: "Double Leg Finish", skillId: "double-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "mat-talk", blockId: "technique", title: "Mat Talk", discipline: "wrestling" },
        { cardId: "boxing-jab", blockId: "technique", title: "Jab", skillId: "jab", familyId: "hands", discipline: "boxing" },
      ],
    });
    await coach.saveMemory({
      practiceId: practiceAId,
      operation: "worked",
      executionCompleted: true,
      workedBlocks: [{ blockId: "technique", title: "Technique", minutes: 20 }],
      workedCards: [
        { cardId: "double-leg-entry", blockId: "technique", title: "Double Leg Entry", skillId: "double-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "double-leg-finish", blockId: "technique", title: "Double Leg Finish", skillId: "double-leg", familyId: "takedowns", discipline: "wrestling" },
        { cardId: "mat-talk", blockId: "technique", title: "Mat Talk", discipline: "wrestling" },
        { cardId: "boxing-jab", blockId: "technique", title: "Jab", skillId: "jab", familyId: "hands", discipline: "boxing" },
      ],
    });
    const memory = (await adminDb.doc(`practiceSessions/${practiceAId}`).get()).data().sessionMemory;
    assert.deepEqual(memory.plannedCards.map((card) => card.cardId), ["double-leg-entry", "double-leg-finish", "mat-talk", "single-leg", "boxing-jab"]);
    assert.deepEqual(memory.workedCards.map((card) => card.cardId), ["double-leg-entry", "double-leg-finish", "mat-talk", "boxing-jab"]);
    assert.equal(memory.workedBlocks.length, 1);
    assert.ok(memory.executionStartedAt);
    assert.ok(memory.executionCompletedAt);
    const completedAt = memory.executionCompletedAt.toMillis();
    await coach.saveMemory({
      practiceId: practiceAId,
      operation: "worked",
      executionCompleted: true,
      workedBlocks: [{ blockId: "technique", title: "Changed title is ignored", minutes: 20 }],
      workedCards: [{ cardId: "double-leg-entry", blockId: "technique", title: "Changed title is ignored" }],
    });
    const retriedMemory = (await adminDb.doc(`practiceSessions/${practiceAId}`).get()).data().sessionMemory;
    assert.equal(retriedMemory.executionCompletedAt.toMillis(), completedAt);
    assert.equal(retriedMemory.workedCards.find((card) => card.cardId === "double-leg-entry").title, "Double Leg Entry");
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "plan", planVersion: 2, plannedBlocks: [], plannedCards: [] }),
      /plan cannot change after execution starts/i
    );

    await assert.rejects(
      () => otherCoach.saveMemory({ practiceId: practiceAId, operation: "worked", workedBlocks: [] }),
      /outside the staff member's authorized scope|authorized scope/i
    );
    await assert.rejects(
      () => sameLocationCoach.saveMemory({ practiceId: practiceAId, operation: "worked", workedBlocks: [] }),
      /Only the Coach who opened this practice/i
    );
    const adminResult = (await admin.saveMemory({
      practiceId: practiceAId,
      operation: "reflection",
      reflection: { worked: "Admin-reviewed session memory." },
    })).data;
    assert.equal(adminResult.ok, true);
    await assert.rejects(
      () => management.saveMemory({ practiceId: practiceAId, operation: "plan", plannedBlocks: [], plannedCards: [] }),
      /permission-denied|Active Coach or Admin access required/i
    );
  });

  await t.test("supplied canonical practice is reused without duplication", async () => {
    const before = await adminDb.collection("practiceSessions").get();
    const resumed = (await coach.open(practiceInput({ practiceId: practiceAId }))).data;
    const after = await adminDb.collection("practiceSessions").get();
    assert.equal(resumed.practiceId, practiceAId);
    assert.equal(resumed.idempotent, true);
    assert.equal(after.size, before.size);
  });

  await t.test("authorized get resolves active practice", async () => {
    const resolved = (await coach.get({ practiceId: practiceAId })).data;
    assert.equal(resolved.practiceId, practiceAId);
    assert.equal(resolved.practice.status, "active");
    assert.equal(resolved.practice.discipline, "wrestling");
    await assert.rejects(() => nonStaff.get({ practiceId: practiceAId }), /permission-denied|Active Coach or staff access required/i);
    await assert.rejects(
      () => nonStaff.close({ practiceId: practiceAId, attendanceSessionId: practiceAId }),
      /permission-denied|Active Coach or staff access required/i
    );
    await assert.rejects(() => otherCoach.get({ practiceId: practiceAId }), /outside the staff member's authorized scope/i);
    await assert.rejects(
      () => otherCoach.close({ practiceId: practiceAId, attendanceSessionId: practiceAId }),
      /outside the staff member's authorized scope/i
    );
  });

  await t.test("Attendance uses the canonical identity through review and correction", async () => {
    const attendanceRef = adminDb.doc(`attendance_sessions/${practiceAId}`);
    await attendanceRef.set({
      practiceId: practiceAId,
      sessionId: practiceAId,
      liveSessionId: "lompoc-mat-1",
      locationId: "lompoc",
      roomId: "mat-1",
      sessionDateKey: "2026-09-22",
      discipline: "wrestling",
      journey: "P2L",
      program: "teen-p2l-wrestling",
      status: "draft",
      checkedInIds: ["F4_TEST_1", "F4_TEST_2"],
      checkedIn: [{ id: "F4_TEST_1" }, { id: "F4_TEST_2" }],
      finalized: false,
    });
    const resumed = (await coach.open(practiceInput({ practiceId: practiceAId }))).data;
    assert.equal(resumed.practiceId, practiceAId);
    await assert.rejects(
      () => coach.open(practiceInput({ practiceId: practiceAId, discipline: "boxing" })),
      /discipline cannot change after check-in begins/i
    );
    await attendanceRef.update({ status: "pending_review" });
    await attendanceRef.update({
      status: "finalized",
      finalized: true,
      finalizedAt: new Date("2026-09-22T20:00:00.000Z"),
      presentIds: ["F4_TEST_1"],
      present: [{ id: "F4_TEST_1", uid: "F4_TEST_1", program: "teen-p2l-wrestling", journey: "P2L", rank: "Warrior", tier: "T1" }],
      removedFromReviewIds: ["F4_TEST_2"],
    });
    await adminDb.doc("athletes/F4_TEST_1").set({ rank: "Current Rank Before Close", tier: "CURRENT", xp: 999 });
    const attendance = (await attendanceRef.get()).data();
    assert.equal(attendance.practiceId, practiceAId);
    assert.equal(attendance.sessionId, practiceAId);
    assert.equal(attendance.discipline, "wrestling");
    assert.deepEqual(attendance.presentIds, ["F4_TEST_1"]);
    assert.deepEqual(attendance.removedFromReviewIds, ["F4_TEST_2"]);
  });

  const openedB = (await coach.open(practiceInput())).data;
  const practiceBId = openedB.practiceId;

  await t.test("new practice replaces only the room pointer and preserves history", async () => {
    assert.notEqual(practiceBId, practiceAId);
    assert.equal((await adminDb.doc(`practiceSessions/${practiceAId}`).get()).exists, true);
    assert.equal((await adminDb.doc(`practiceSessions/${practiceBId}`).get()).exists, true);
    const live = (await adminDb.doc("liveSessions/lompoc-mat-1").get()).data();
    assert.equal(live.practiceId, practiceBId);
    assert.equal(live.status, "ready");
  });

  await t.test("stale close closes A but cannot close B's room pointer", async () => {
    const closedA = (await coach.close({ practiceId: practiceAId, attendanceSessionId: practiceAId })).data;
    assert.equal(closedA.status, "closed");
    assert.equal(closedA.idempotent, false);
    const practiceA = (await adminDb.doc(`practiceSessions/${practiceAId}`).get()).data();
    assert.equal(practiceA.status, "closed");
    assert.equal(practiceA.closedBy, "COACH_ATTENDANCE_V1");
    assert.equal(practiceA.closedByRole, "coach");
    assert.ok(practiceA.closedAt);
    const athleteSession = (await adminDb.doc(`practiceSessions/${practiceAId}/athletes/F4_TEST_1`).get()).data();
    assert.equal(athleteSession.practiceId, practiceAId);
    assert.equal(athleteSession.attendanceSessionId, practiceAId);
    assert.equal(athleteSession.athleteId, "F4_TEST_1");
    assert.equal(athleteSession.attendance.status, "present");
    assert.equal(athleteSession.rankSnapshot, "Warrior");
    assert.equal(athleteSession.tierSnapshot, "T1");
    assert.equal(athleteSession.program, "teen-p2l-wrestling");
    assert.equal(athleteSession.discipline, "wrestling");
    assert.deepEqual(athleteSession.workedCards.map((card) => card.cardId), ["double-leg-entry", "double-leg-finish", "mat-talk"]);
    assert.deepEqual(athleteSession.workedSkillRefs, [{ skillId: "double-leg", familyId: "takedowns" }]);
    assert.equal(athleteSession.workedCards.some((card) => card.cardId === "single-leg"), false);
    assert.equal(athleteSession.workedCards.some((card) => card.cardId === "boxing-jab"), false);
    assert.equal((await adminDb.doc(`practiceSessions/${practiceAId}/athletes/F4_TEST_2`).get()).exists, false);
    const unchangedAttendance = (await adminDb.doc(`attendance_sessions/${practiceAId}`).get()).data();
    assert.equal(unchangedAttendance.status, "finalized");
    assert.deepEqual(unchangedAttendance.presentIds, ["F4_TEST_1"]);
    assert.equal((await adminDb.doc("athletes/F4_TEST_1").get()).data().xp, 999);
    const live = (await adminDb.doc("liveSessions/lompoc-mat-1").get()).data();
    assert.equal(live.practiceId, practiceBId);
    assert.equal(live.status, "ready");
  });

  await t.test("repeated close is idempotent and get returns closed state", async () => {
    await adminDb.doc("athletes/F4_TEST_1").update({ rank: "Changed Later", tier: "T9" });
    const repeated = (await coach.close({ practiceId: practiceAId, attendanceSessionId: practiceAId })).data;
    assert.equal(repeated.idempotent, true);
    const resolved = (await coach.get({ practiceId: practiceAId })).data;
    assert.equal(resolved.practice.status, "closed");
    const historical = (await adminDb.doc(`practiceSessions/${practiceAId}/athletes/F4_TEST_1`).get()).data();
    assert.equal(historical.rankSnapshot, "Warrior");
    assert.equal(historical.tierSnapshot, "T1");
    assert.equal((await adminDb.collection(`practiceSessions/${practiceAId}/athletes`).get()).size, 1);
  });

  await t.test("closed practice rejects plan/worked mutation but permits controlled final reflection", async () => {
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "worked", workedBlocks: [] }),
      /Closed practices cannot change plan or worked memory/i
    );
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "plan", plannedBlocks: [], plannedCards: [] }),
      /Closed practices cannot change plan or worked memory/i
    );
    const finalReflection = {
      fearRating: "5",
      worked: "Chain wrestling",
      needsWork: "Finishes",
      standout: "Team effort",
    };
    const firstSave = (await coach.saveMemory({
      practiceId: practiceAId,
      operation: "reflection",
      reflection: finalReflection,
    })).data;
    assert.equal(firstSave.idempotent, false);
    const reflection = (await adminDb.doc(`practiceSessions/${practiceAId}`).get()).data().sessionMemory.reflection;
    assert.equal(reflection.fearRating, "5");
    assert.equal(reflection.worked, "Chain wrestling");
    assert.equal(reflection.coachUid, "COACH_ATTENDANCE_V1");
    const savedAt = reflection.savedAt.toMillis();
    const retry = (await coach.saveMemory({
      practiceId: practiceAId,
      operation: "reflection",
      reflection: finalReflection,
    })).data;
    assert.equal(retry.idempotent, true);
    const afterRetry = (await adminDb.doc(`practiceSessions/${practiceAId}`).get()).data().sessionMemory.reflection;
    assert.equal(afterRetry.savedAt.toMillis(), savedAt);
    assert.equal(afterRetry.coachUid, "COACH_ATTENDANCE_V1");
    await assert.rejects(
      () => coach.saveMemory({ practiceId: practiceAId, operation: "reflection", reflection: { worked: "Rewrite" } }),
      /final closed-practice reflection has already been saved/i
    );
  });

  await t.test("closing current practice closes the matching room channel", async () => {
    const closedB = (await coach.close({ practiceId: practiceBId, attendanceSessionId: practiceBId })).data;
    assert.equal(closedB.idempotent, false);
    const live = (await adminDb.doc("liveSessions/lompoc-mat-1").get()).data();
    assert.equal(live.practiceId, practiceBId);
    assert.equal(live.status, "closed");
  });

  await t.test("legacy Attendance record remains independent of canonical close", async () => {
    await adminDb.doc("attendance_sessions/legacy-attendance").set({
      sessionId: "legacy-attendance",
      discipline: "wrestling",
      status: "pending_review",
      finalized: false,
    });
    await adminDb.doc("attendance_sessions/legacy-attendance").update({ status: "finalized", finalized: true });
    const legacy = (await adminDb.doc("attendance_sessions/legacy-attendance").get()).data();
    assert.equal(legacy.status, "finalized");
    assert.equal(legacy.practiceId, undefined);
  });

  await t.test("legacy practice without executionMode remains readable", async () => {
    await adminDb.doc("practiceSessions/legacy-practice-no-mode").set({
      practiceId: "legacy-practice-no-mode",
      liveSessionId: "legacy-room",
      locationId: "lompoc",
      roomId: "legacy-room",
      discipline: "wrestling",
      coachUid: "COACH_ATTENDANCE_V1",
      status: "active",
    });
    const legacy = (await coach.get({ practiceId: "legacy-practice-no-mode" })).data.practice;
    assert.equal(legacy.executionMode, undefined);
  });

  await t.test("concurrent worked updates merge without erasing one another", async () => {
    const opened = (await coach.open(practiceInput({ liveSessionId: "lompoc-mat-concurrent", roomId: "mat-concurrent" }))).data;
    await coach.saveMemory({
      practiceId: opened.practiceId,
      operation: "plan",
      planVersion: 1,
      plannedBlocks: [{ blockId: "live", minutes: 20 }],
      plannedCards: [
        { cardId: "card-a", blockId: "live", discipline: "wrestling" },
        { cardId: "card-b", blockId: "live", discipline: "wrestling" },
      ],
    });
    await Promise.all([
      coach.saveMemory({ practiceId: opened.practiceId, operation: "worked", workedBlocks: [{ blockId: "live", minutes: 20 }], workedCards: [{ cardId: "card-a", blockId: "live", discipline: "wrestling" }] }),
      coach.saveMemory({ practiceId: opened.practiceId, operation: "worked", workedBlocks: [{ blockId: "live", minutes: 20 }], workedCards: [{ cardId: "card-b", blockId: "live", discipline: "wrestling" }] }),
    ]);
    const memory = (await adminDb.doc(`practiceSessions/${opened.practiceId}`).get()).data().sessionMemory;
    assert.deepEqual(new Set(memory.workedCards.map((card) => card.cardId)), new Set(["card-a", "card-b"]));
  });

  await t.test("Muay Thai aliases seed canonical empty athlete-session memory", async () => {
    const opened = (await coach.open(practiceInput({
      liveSessionId: "lompoc-mat-muay",
      roomId: "mat-muay",
      discipline: "muay-thai",
      program: "road2champion-muay-thai",
    }))).data;
    await adminDb.doc(`attendance_sessions/${opened.practiceId}`).set({
      practiceId: opened.practiceId,
      status: "finalized",
      finalized: true,
      finalizedAt: new Date("2026-09-22T21:00:00.000Z"),
      locationId: "lompoc",
      roomId: "mat-muay",
      discipline: "kickboxing",
      presentIds: ["F8_MUAY_1"],
      present: [{ id: "F8_MUAY_1", rank: "White", tier: "T0", program: "road2champion-muay-thai" }],
    });
    await coach.close({ practiceId: opened.practiceId, attendanceSessionId: opened.practiceId });
    const athleteSession = (await adminDb.doc(`practiceSessions/${opened.practiceId}/athletes/F8_MUAY_1`).get()).data();
    assert.equal(athleteSession.discipline, "muay-thai");
    assert.deepEqual(athleteSession.workedCards, []);
    assert.deepEqual(athleteSession.workedSkillRefs, []);
  });

  await t.test("invalid finalized participant fails close atomically", async () => {
    const opened = (await coach.open(practiceInput({ liveSessionId: "lompoc-mat-invalid", roomId: "mat-invalid" }))).data;
    await adminDb.doc(`attendance_sessions/${opened.practiceId}`).set({
      practiceId: opened.practiceId,
      status: "finalized",
      finalized: true,
      discipline: "wrestling",
      presentIds: ["invalid/athlete"],
    });
    await assert.rejects(
      () => coach.close({ practiceId: opened.practiceId, attendanceSessionId: opened.practiceId }),
      /present athleteId is invalid/i
    );
    assert.equal((await adminDb.doc(`practiceSessions/${opened.practiceId}`).get()).data().status, "active");
    assert.equal((await adminDb.collection(`practiceSessions/${opened.practiceId}/athletes`).get()).empty, true);
  });

  await t.test("Management attendance read is authorized and location scoped", async () => {
    await adminDb.doc("practiceSessions/elk-private-practice").set({
      practiceId: "elk-private-practice",
      locationId: "elk-grove",
      roomId: "elk-mat",
      discipline: "boxing",
      coachUid: "COACH_OTHER_LOCATION",
      status: "active",
      openedAt: new Date(),
    });
    await adminDb.doc("attendance_sessions/elk-private-practice").set({
      practiceId: "elk-private-practice",
      locationId: "elk-grove",
      discipline: "boxing",
      status: "pending_review",
      checkedInCount: 1,
      checkedIn: [{ id: "ELK_PRIVATE_1", name: "Private Athlete" }],
    });

    const lompoc = (await management.listManagement({})).data;
    assert.equal(lompoc.ok, true);
    assert.deepEqual(lompoc.locationIds, ["lompoc"]);
    assert.ok(lompoc.sessions.some((session) => session.practiceId === practiceAId));
    assert.equal(lompoc.sessions.some((session) => session.locationId === "elk-grove"), false);
    assert.equal(lompoc.sessions.some((session) => session.practiceId === "elk-private-practice"), false);

    const elk = (await otherManagement.listManagement({})).data;
    assert.deepEqual(elk.locationIds, ["elk-grove"]);
    assert.equal(elk.sessions.length, 1);
    assert.equal(elk.sessions[0].practiceId, "elk-private-practice");
    assert.equal(elk.sessions[0].discipline, "boxing");
    assert.equal(elk.sessions[0].checkedInCount, 1);

    await assert.rejects(() => coach.listManagement({}), /permission-denied|Active Management access required/i);
    await assert.rejects(() => nonStaff.listManagement({}), /permission-denied|Active Management access required/i);
  });
});
