import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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
