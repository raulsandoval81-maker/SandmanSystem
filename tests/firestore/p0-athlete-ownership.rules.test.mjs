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
