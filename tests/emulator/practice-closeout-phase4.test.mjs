import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
if (!process.env.SANDMAN_TEST_BUILD_DIR) throw new Error("Temporary Functions build required.");
const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-practice-phase4";
if (!admin.apps.length) admin.initializeApp({ projectId });
const db = admin.firestore();
const practice = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/practice/practiceSessions.js`);
const history = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/practice/getAthleteSessionHistory.js`);
const xp = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/services/authoritativeXpService.js`);
const call = (fn, uid, data) => fn.run({ auth: { uid, token: {} }, data, rawRequest: {} });

async function seedAthlete(id) {
  await db.doc(`athletes/${id}`).set({
    fullName: id, locationId: "santa-ynez-valley", rosterStatus: "current",
    journey: "Z2H", trackBase: "F8", progressionTier: "T0", tier: "T0",
    rankName: "Rookie", primaryDiscipline: "wrestling", discipline: "wrestling",
    disciplineIds: ["wrestling"], xp: 0, xpCap: 800, stripeCount: 0,
    testing: { state: "ACTIVE" }, tierStatus: "active",
  });
}

async function createFinalized(id, entryMode, date, key) {
  const created = entryMode === "normal"
    ? await call(practice.openPracticeSession, "coach-phase4", {
      liveSessionId: `live-${key}`, sessionDateKey: date, locationId: "santa-ynez-valley",
      roomId: "mat-1", discipline: "wrestling", journey: "Z2H",
      program: "youth-z2h-wrestling", durationMinutes: 60,
    })
    : await call(practice.createOrRecoverCanonicalPractice, "coach-phase4", {
      entryMode, sessionDateKey: date, locationId: "santa-ynez-valley",
      discipline: "wrestling", program: "youth-z2h-wrestling", practiceKey: key,
    });
  await call(practice.finalizePracticeAttendance, "coach-phase4", {
    practiceId: created.practiceId, presentIds: id ? [id] : [], notes: "Finalized",
  });
  return created.practiceId;
}

async function awardAndComplete(id, practiceId) {
  await xp.awardXpAuthoritatively("coach-phase4", {
    uid: id, kind: "ATTENDANCE", amount: 10,
    meta: { source: "daily-grind", attendanceSessionId: practiceId, sessionId: practiceId },
  });
  await call(practice.completePracticeDailyGrind, "coach-phase4", { practiceId, athleteIds: [id] });
}

before(async () => {
  await db.doc("staff/coach-phase4").set({ role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
  await db.doc("staff/admin-phase4").set({ role: "admin", status: "active" });
  await db.doc("staff/wrong-coach-phase4").set({ role: "coach", status: "active", locationIds: ["lompoc"] });
  await Promise.all(["F8_P4_NORMAL", "F8_P4_DIRECTED", "F8_P4_AFTER"].map(seedAthlete));
});
after(async () => admin.app().delete());

test("all entry lanes accept merged athlete and practice input without damaging skill evidence", async () => {
  for (const [id, mode, date, key] of [
    ["F8_P4_NORMAL", "normal", "2026-09-20", "normal-compatible"],
    ["F8_P4_DIRECTED", "coach-directed", "2026-09-21", "directed"],
    ["F8_P4_AFTER", "after-the-fact", "2026-09-22", "rush-day"],
  ]) {
    const practiceId = await createFinalized(id, mode, date, key);
    const athleteRef = db.doc(`practiceSessions/${practiceId}/athletes/${id}`);
    await athleteRef.collection("verifiedSkills").doc("wrestling__double_leg").set({ familyId: "double_leg", state: "LEARNED" });
    const before = (await athleteRef.get()).data();
    await call(practice.savePracticeAthleteInput, "coach-phase4", {
      practiceId, athleteId: id, coachObservation: "Stayed composed", developmentNote: "Chain finishes",
    });
    await call(practice.savePracticeSessionMemory, "coach-phase4", {
      practiceId, operation: "reflection",
      reflection: { worked: "Transitions", needsWork: "Finishes", coachNote: "Good pace" },
    });
    const after = (await athleteRef.get()).data();
    assert.equal(after.attendanceSessionId, before.attendanceSessionId);
    assert.deepEqual(after.workedCards, before.workedCards);
    assert.equal(after.coachInput.coachObservation, "Stayed composed");
    assert.equal((await athleteRef.collection("verifiedSkills").doc("wrestling__double_leg").get()).get("state"), "LEARNED");
    const assembled = await call(history.getAthleteSessionHistory, "coach-phase4", { practiceId, athleteId: id });
    assert.equal(assembled.session.coachInput.developmentNote, "Chain finishes");
    assert.equal(assembled.session.practiceReflection.coachNote, "Good pace");
  }
});

test("athlete input is present-only and location scoped while Admin is permitted", async () => {
  const practiceId = await createFinalized("F8_P4_NORMAL", "after-the-fact", "2026-09-23", "scope");
  await assert.rejects(() => call(practice.savePracticeAthleteInput, "coach-phase4", {
    practiceId, athleteId: "F8_P4_AFTER", coachObservation: "Not present",
  }), /verified present athletes/);
  await assert.rejects(() => call(practice.savePracticeAthleteInput, "wrong-coach-phase4", {
    practiceId, athleteId: "F8_P4_NORMAL", coachObservation: "Wrong scope",
  }), /authorized scope/);
  await call(practice.savePracticeAthleteInput, "admin-phase4", {
    practiceId, athleteId: "F8_P4_NORMAL", coachObservation: "Admin review",
  });
});

test("final close blocks unresolved XP, preserves records, closes matching live session, and retries idempotently", async () => {
  const unfinalized = await call(practice.openPracticeSession, "coach-phase4", {
    liveSessionId: "phase4-unfinalized", locationId: "santa-ynez-valley", roomId: "mat-2",
    discipline: "wrestling", journey: "Z2H", program: "youth-z2h-wrestling",
    sessionDateKey: "2026-09-24", durationMinutes: 60,
  });
  await assert.rejects(() => call(practice.closePracticeSession, "coach-phase4", {
    practiceId: unfinalized.practiceId, attendanceSessionId: unfinalized.practiceId,
  }), /Matching finalized attendance/);
  const opened = await call(practice.openPracticeSession, "coach-phase4", {
    liveSessionId: "phase4-live", locationId: "santa-ynez-valley", roomId: "mat-1",
    discipline: "wrestling", journey: "Z2H", program: "youth-z2h-wrestling",
    sessionDateKey: "2026-09-24", durationMinutes: 60,
  });
  await db.doc("liveSessions/phase4-live").set({ practiceId: opened.practiceId, status: "ready" }, { merge: true });
  await call(practice.finalizePracticeAttendance, "coach-phase4", {
    practiceId: opened.practiceId, presentIds: ["F8_P4_NORMAL"], notes: "Normal",
  });
  await assert.rejects(() => call(practice.closePracticeSession, "coach-phase4", {
    practiceId: opened.practiceId, attendanceSessionId: opened.practiceId,
  }), /Daily Grind must be completed/);
  await assert.rejects(() => call(practice.closePracticeSession, "wrong-coach-phase4", {
    practiceId: opened.practiceId, attendanceSessionId: opened.practiceId,
  }), /authorized scope/);
  await awardAndComplete("F8_P4_NORMAL", opened.practiceId);
  const xpBefore = (await db.doc("athletes/F8_P4_NORMAL").get()).get("xp");
  const closed = await call(practice.closePracticeSession, "coach-phase4", {
    practiceId: opened.practiceId, attendanceSessionId: opened.practiceId,
  });
  const retry = await call(practice.closePracticeSession, "coach-phase4", {
    practiceId: opened.practiceId, attendanceSessionId: opened.practiceId,
  });
  assert.equal(closed.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal((await db.doc(`practiceSessions/${opened.practiceId}`).get()).get("status"), "closed");
  assert.equal((await db.doc("liveSessions/phase4-live").get()).get("status"), "closed");
  assert.equal((await db.doc("athletes/F8_P4_NORMAL").get()).get("xp"), xpBefore);
  assert.equal((await db.doc(`attendance_sessions/${opened.practiceId}`).get()).get("status"), "finalized");
});

test("reconstructed practices close without fake live sessions", async () => {
  const afterId = await createFinalized("F8_P4_AFTER", "after-the-fact", "2026-09-19", "no-live");
  await call(practice.savePracticeAthleteInput, "coach-phase4", {
    practiceId: afterId, athleteId: "F8_P4_AFTER", coachObservation: "Historical observation",
  });
  await call(practice.savePracticeSessionMemory, "coach-phase4", {
    practiceId: afterId, operation: "reflection", reflection: { worked: "Historical reflection" },
  });
  await awardAndComplete("F8_P4_AFTER", afterId);
  await call(practice.closePracticeSession, "admin-phase4", { practiceId: afterId, attendanceSessionId: afterId });
  assert.equal((await db.doc(`practiceSessions/${afterId}`).get()).get("status"), "closed");
  const assembled = await call(history.getAthleteSessionHistory, "coach-phase4", {
    practiceId: afterId, athleteId: "F8_P4_AFTER",
  });
  assert.equal(assembled.session.coachInput.coachObservation, "Historical observation");
  assert.equal(assembled.session.practiceReflection.worked, "Historical reflection");
});
