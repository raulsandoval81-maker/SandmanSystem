import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
