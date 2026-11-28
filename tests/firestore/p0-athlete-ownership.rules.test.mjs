import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, updateDoc } from "firebase/firestore";

const projectId = "demo-sandman-p0-athlete-ownership";
let env;

before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8081") {
    throw new Error("Use the isolated loopback Firestore emulator on port 8081.");
  }
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1", port: 8081,
      rules: readFileSync("scripts/staging/p0-containment/firestore.rules", "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "athletes/own"), {
        authUid: "athlete", locationId: "north", coachIds: ["coach"], synthetic: true,
      }),
      // Synthetic activated Parent via pending relationship: the real
      // invitation consumer stamps athlete.parentUid, while the relationship
      // can retain a noncanonical pending-email document ID.
      setDoc(doc(db, "athletes/parent-activated"), {
        authUid: "parent-activated-athlete", parentUid: "late-parent",
        locationId: "north", coachIds: ["coach"], synthetic: true,
      }),
      setDoc(doc(db, "parentAthleteLinks/pending-email-hash-parent-activated"), {
        parentUid: "late-parent", athleteUid: "parent-activated",
        status: "active", synthetic: true,
      }),
      setDoc(doc(db, "athletes/legacy-coach-assigned"), {
        authUid: "legacy-coach-athlete", coachIds: ["coach"],
        synthetic: true,
      }),
      setDoc(doc(db, "athletes/other"), {
        authUid: "other-athlete", locationId: "south", coachIds: [], synthetic: true,
      }),
      setDoc(doc(db, "parentAthleteLinks/parent_own"), {
        parentUid: "parent", athleteUid: "own", status: "active",
      }),
      setDoc(doc(db, "staff/coach"), { role: "coach", status: "active", locationIds: ["north"] }),
      setDoc(doc(db, "staff/outsider"), { role: "coach", status: "active", locationIds: ["west"] }),
      setDoc(doc(db, "staff/manager"), { role: "management", status: "active", locationIds: ["north"] }),
      setDoc(doc(db, "staff/admin"), { role: "admin", status: "active" }),
      setDoc(doc(db, "staff/southcoach"), { role: "coach", status: "active", locationIds: ["south"] }),
      setDoc(doc(db, "laneHistory/own__strength"), {
        athleteId: "own", lane: "strength", status: "closed",
        sourceAthleteId: "own", sourceCollection: "laneSubmissions", historyType: "submission",
        closedAt: new Date("2026-11-01T00:00:00Z"), synthetic: true,
      }),
      setDoc(doc(db, "laneHistory/other__honor"), {
        athleteId: "other", lane: "honor", status: "closed",
        sourceAthleteId: "other", sourceCollection: "laneSubmissions", historyType: "submission",
        closedAt: new Date("2026-11-02T00:00:00Z"), synthetic: true,
      }),
      setDoc(doc(db, "laneHistory/Legacy-Z2H__strength"), {
        athleteId: "Legacy-Z2H", lane: "strength", status: "closed",
        sourceAthleteId: "Legacy-Z2H", sourceCollection: "laneSubmissions", historyType: "submission",
        closedAt: new Date("2026-11-03T00:00:00Z"), synthetic: true,
      }),
      setDoc(doc(db, "laneHistory/malformed"), { lane: "strength", status: "closed", synthetic: true }),
      setDoc(doc(db, "athletes/Legacy-Z2H"), {
        programTrack: "Z2H", locationId: "north", coachIds: [], synthetic: true,
      }),
    ]);
  });
});
after(async () => { await env?.cleanup(); });

const read = (uid, athleteId) => {
  const context = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  return getDoc(doc(context.firestore(), "athletes", athleteId));
};

test("own Athlete, linked Parent and assigned Coach can read the synthetic record", async () => {
  for (const uid of ["athlete", "parent", "coach"]) await assertSucceeds(read(uid, "own"));
});

test("signed-out, unrelated and out-of-scope identities are denied", async () => {
  for (const uid of [null, "unrelated", "other-athlete", "outsider"]) await assertFails(read(uid, "own"));
});

test("alternate athlete ID never expands Athlete, Parent or Coach read scope", async () => {
  for (const uid of ["athlete", "parent", "coach"]) await assertFails(read(uid, "other"));
});


test("legacy UID ownership is exact-case", async () => {
  await assertSucceeds(read("Legacy-Z2H", "Legacy-Z2H"));
  await assertFails(read("LEGACY-Z2H", "Legacy-Z2H"));
});

test("Management stays location-scoped and Admin retains authorized reads", async () => {
  await assertSucceeds(read("manager", "own"));
  await assertFails(read("manager", "other"));
  await assertSucceeds(read("admin", "other"));
});

test("Coach record access cannot write a private field", async () => {
  const db = env.authenticatedContext("coach").firestore();
  await assertFails(updateDoc(doc(db, "athletes", "own"), { privateReview: "synthetic" }));
});

test("Profile feed and Skills callables enforce authenticated scope independently of client rules", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../../functions/package.json", import.meta.url));
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const app = initializeApp({ projectId });
  try {
    const { getAthleteProfileFeed } = require("./lib/modules/athlete/getAthleteProfileFeed");
    const { getAthleteSkillsSummary } = require("./lib/modules/athlete/getAthleteSkillsSummary");
    const request = (uid, athleteId, provider = "password") => ({
      auth: uid ? { uid, token: { firebase: { sign_in_provider: provider } } } : undefined,
      data: { athleteId, authorizeOnly: true },
    });
    for (const [uid, athleteId] of [
      ["athlete", "own"], ["parent", "own"], ["coach", "own"],
      ["manager", "own"], ["admin", "other"], ["Legacy-Z2H", "Legacy-Z2H"],
    ]) {
      assert.deepEqual(await getAthleteProfileFeed.run(request(uid, athleteId)), {
        athleteId, authorized: true,
      });
      // Skills Summary has no authorizeOnly shortcut. This must exercise
      // its actual canonical per-athlete skills read for every allowed role.
      const summary = await getAthleteSkillsSummary.run(request(uid, athleteId));
      assert.equal(summary.ok, true, `Skills authorized for ${uid}`);
      assert.equal(summary.athleteId, athleteId, `Exact-case identity for ${uid}`);
      assert.equal(summary.discipline, "wrestling");
      assert.ok(Array.isArray(summary.skills), `Skills array for ${uid}`);
    }
    for (const uid of ["unrelated", "other-athlete", "outsider"]) {
      const denied = error => error.code === "permission-denied";
      await assert.rejects(getAthleteProfileFeed.run(request(uid, "own")), denied);
      await assert.rejects(getAthleteSkillsSummary.run(request(uid, "own")), denied);
    }
    await assert.rejects(getAthleteProfileFeed.run(request(null, "own")),
      error => error.code === "unauthenticated");
    await assert.rejects(getAthleteSkillsSummary.run(request("athlete", "own", "anonymous")),
      error => error.code === "unauthenticated");
  } finally {
    await deleteApp(app);
  }
});


const historyGet = (uid, historyDocId) => {
  const context = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  return getDoc(doc(context.firestore(), "laneHistory", historyDocId));
};
const historyList = (uid, athleteId, ordered = false) => {
  const context = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  const base = collection(context.firestore(), "laneHistory");
  return getDocs(athleteId === null ? query(base) : ordered
    ? query(base, where("athleteId", "==", athleteId), orderBy("closedAt", "desc"))
    : query(base, where("athleteId", "==", athleteId)));
};
const historyCreate = (uid, docId, data) => {
  const context = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  return setDoc(doc(context.firestore(), "laneHistory", docId), {
    athleteId: "own", status: "closed", sourceCollection: "laneSubmissions",
    sourceAthleteId: "own", historyType: "submission", closedAt: new Date(),
    ...data,
  });
};

test("Lane History get permits only owned, linked or scoped synthetic athlete records", async () => {
  for (const uid of ["athlete", "parent", "coach", "manager", "admin"]) {
    await assertSucceeds(historyGet(uid, "own__strength"));
  }
  for (const uid of [null, "unrelated", "other-athlete", "outsider", "southcoach"]) {
    await assertFails(historyGet(uid, "own__strength"));
  }
  await assertSucceeds(historyGet("other-athlete", "other__honor"));
  await assertSucceeds(historyGet("southcoach", "other__honor"));
  await assertSucceeds(historyGet("Legacy-Z2H", "Legacy-Z2H__strength"));
  await assertFails(historyGet("LEGACY-Z2H", "Legacy-Z2H__strength"));
});

test("Lane History denies cross-athlete and malformed history records", async () => {
  for (const uid of ["athlete", "parent", "coach", "manager"]) {
    await assertFails(historyGet(uid, "other__honor"));
  }
  await assertFails(historyGet("athlete", "malformed"));
  await assertFails(historyGet(null, "malformed"));
});

test("Lane History exact-athlete queries preserve History screen and dashboard use", async () => {
  for (const uid of ["athlete", "parent", "coach", "manager", "admin"]) {
    await assertSucceeds(historyList(uid, "own", true));
    await assertSucceeds(historyList(uid, "own"));
  }
  await assertSucceeds(historyList("other-athlete", "other"));
  await assertFails(historyList("athlete", "other"));
  await assertFails(historyList("parent", "other"));
  await assertFails(historyList("coach", "other"));
  await assertFails(historyList("outsider", "own"));
  await assertFails(historyList(null, "own"));
  await assertFails(historyList("athlete", null));
});

test("Lane History creation preserves scoped Coach and Admin archive flows", async () => {
  await assertSucceeds(historyCreate("coach", "own__coach-archive", { lane: "strength" }));
  await assertSucceeds(historyCreate("southcoach", "other__coach-archive", {
    athleteId: "other", sourceAthleteId: "other", lane: "honor",
  }));
  // Conditioning is approved from the Coach review path, even when its
  // primary XP lane remains Strength or Honor.
  await assertSucceeds(historyCreate("coach", "own__conditioning-archive", {
    lane: "strength", assignmentLane: "conditioning", sourceKey: "conditioning_session1",
  }));
  await assertSucceeds(historyCreate("admin", "own__admin-archive", { lane: "conditioning" }));
});

test("Lane History creation rejects untrusted writers and mismatched archive fields", async () => {
  for (const uid of [null, "athlete", "parent", "unrelated", "outsider", "manager"]) {
    await assertFails(historyCreate(uid, "own__forgery-" + (uid || "anonymous"), { lane: "strength" }));
  }
  await assertFails(historyCreate("coach", "other__out-of-scope", {
    athleteId: "other", sourceAthleteId: "other",
  }));
  await assertFails(historyCreate("coach", "own__source-mismatch", {
    athleteId: "own", sourceAthleteId: "other",
  }));
  await assertFails(historyCreate("coach", "own__not-closed", { status: "pending" }));
  await assertFails(historyCreate("coach", "own__not-submission", { sourceCollection: "other" }));
  await assertFails(historyCreate("coach", "own__not-history", { historyType: "arbitrary" }));
});

test("Lane History cannot be modified after creation by a scoped Coach", async () => {
  const db = env.authenticatedContext("coach").firestore();
  await assertFails(updateDoc(doc(db, "laneHistory", "own__strength"), { coachNote: "changed" }));
});

test("Scoped Coach approval reuses immutable Honor and Conditioning archives", async () => {
  const moduleText = readFileSync("public/assets/js/immutable-lane-archive.js", "utf8");
  const { assertCompatibleLaneArchive, ensureImmutableLaneArchive } =
    await import("data:text/javascript;base64," + Buffer.from(moduleText).toString("base64"));
  const db = env.authenticatedContext("coach").firestore();
  const readHistoryForAthlete = athleteId =>
    getDocs(query(collection(db, "laneHistory"), where("athleteId", "==", athleteId)));

  for (const lane of ["honor", "conditioning"]) {
    const key = "immutable_" + lane;
    const historyRef = doc(db, "laneHistory", "own__" + key);
    const archive = {
      athleteId: "own",
      lane: lane === "conditioning" ? "strength" : "honor",
      ...(lane === "conditioning" ? { assignmentLane: "conditioning" } : {}),
      awardedXp: 5, coachNote: "first immutable review",
      sourceCollection: "laneSubmissions", sourceAthleteId: "own",
      sourceKey: key, historyType: "submission", status: "closed",
      closedAt: new Date("2026-11-04T00:00:00Z"),
    };
    const args = { historyRef, archive, athleteId: "own", key, lane, readHistoryForAthlete, setDoc };
    assert.equal(await assertCompatibleLaneArchive({
      athleteId: "own", key, lane, expectedAward: 5, readHistoryForAthlete,
    }), false);
    assert.deepEqual(await ensureImmutableLaneArchive(args), { created: true, existing: false });

    // The repeated approval cannot write a second record or change the note.
    const repeated = { ...args, archive: { ...archive, coachNote: "retry should be ignored" } };
    assert.deepEqual(await ensureImmutableLaneArchive(repeated), { created: false, existing: true });
    const stored = (await getDoc(historyRef)).data();
    assert.equal(stored.coachNote, "first immutable review");
    assert.equal(stored.awardedXp, 5);

    await assert.rejects(assertCompatibleLaneArchive({
      athleteId: "own", key, lane, expectedAward: 10, readHistoryForAthlete,
    }), /HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW/);
    await assertFails(updateDoc(historyRef, { coachNote: "not permitted" }));
  }
});

test("Parent activated via noncanonical pending relationship can read own Athlete", async () => {
  // Matches issueAccessInvitation -> consumeAccessInvitation, not a
  // synthetic _UID suffix link. Parent cannot see unrelated athletes.
  await assertSucceeds(read("late-parent", "parent-activated"));
  await assertFails(read("late-parent", "other"));
});

test("Legacy Athlete lacking location remains readable only to explicitly assigned active Coach", async () => {
  await assertSucceeds(read("coach", "legacy-coach-assigned"));
  await assertFails(read("outsider", "legacy-coach-assigned"));
  await assertFails(read("manager", "legacy-coach-assigned"));
  await assertFails(read("unrelated", "legacy-coach-assigned"));

  await assertSucceeds(historyCreate("coach", "legacy-coach-assigned__coach-archive", {
    athleteId: "legacy-coach-assigned",
    sourceAthleteId: "legacy-coach-assigned", lane: "honor",
  }));
  await assertFails(historyCreate("outsider", "legacy-coach-assigned__forgery", {
    athleteId: "legacy-coach-assigned",
    sourceAthleteId: "legacy-coach-assigned", lane: "honor",
  }));
});

test("Athlete cannot forge a Coach conditioning or Spartan assignment on first submission write", async () => {
  const athleteDb = env.authenticatedContext("athlete").firestore();
  const coachDb = env.authenticatedContext("coach").firestore();
  const parentDb = env.authenticatedContext("parent").firestore();
  const otherDb = env.authenticatedContext("other-athlete").firestore();
  const ownRef = doc(athleteDb, "laneSubmissions", "own");

  // The complete first-write payload is untrusted even when the Athlete owns it.
  await assertFails(setDoc(ownRef, {
    conditioning_assignment: { status: "assigned", assignedBy: "athlete", rewardXp: 5 },
  }));
  await assertFails(setDoc(ownRef, {
    spartan_assignment: { status: "assigned", assignedBy: "athlete", rewardXp: 10 },
  }));
  await assertFails(setDoc(doc(otherDb, "laneSubmissions", "own"), { strength_session1: {} }));
  await assertFails(setDoc(doc(parentDb, "laneSubmissions", "own"), { honor_session1: {} }));

  // Normal Athlete-created evidence is allowed without a privileged assignment.
  await assertSucceeds(setDoc(ownRef, {
    strength_session1: { status: "pending", note: "synthetic submission" },
  }));
  await assertFails(updateDoc(ownRef, {
    conditioning_assignment: { status: "assigned", assignedBy: "athlete" },
  }));

  // Authorized staff retain the existing assignment path.
  await assertSucceeds(updateDoc(doc(coachDb, "laneSubmissions", "own"), {
    conditioning_assignment: { status: "assigned", assignedBy: "coach", rewardXp: 5 },
  }));
  await assertFails(updateDoc(ownRef, {
    "conditioning_assignment.assignedBy": "athlete",
  }));
  await assertSucceeds(updateDoc(ownRef, {
    "strength_session1.note": "revised evidence",
  }));
});
