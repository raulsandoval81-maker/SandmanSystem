import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "sandman-athlete-testing-auth-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "coach-active"), { role: "coach", status: "active" });
    await setDoc(doc(db, "staff", "coach-inactive"), { role: "coach", status: "inactive" });
    await setDoc(doc(db, "staff", "admin-active"), { role: "admin", status: "active" });
    await setDoc(doc(db, "athletes", "F8_1000"), {
      authUid: "athlete-auth", testing: { state: "ACTIVE" }, tierStatus: "active",
    });
  });
});

after(async () => env?.cleanup());

test("active Coach and Admin may update the narrow athlete testing state", async () => {
  for (const uid of ["coach-active", "admin-active"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertSucceeds(updateDoc(doc(db, "athletes", "F8_1000"), {
      testing: { state: "TESTING" }, tierStatus: "testing", updatedAt: serverTimestamp(),
    }));
  }
});

test("Athlete, anonymous, and inactive Coach cannot mutate testing state", async () => {
  for (const context of [
    env.authenticatedContext("athlete-auth"),
    env.unauthenticatedContext(),
    env.authenticatedContext("coach-inactive"),
  ]) {
    await assertFails(updateDoc(doc(context.firestore(), "athletes", "F8_1000"), {
      testing: { state: "TESTING" }, tierStatus: "testing", updatedAt: serverTimestamp(),
    }));
  }
});

test("testing evidence is writable only by active Coach/Admin", async () => {
  await assertSucceeds(setDoc(doc(env.authenticatedContext("coach-active").firestore(),
    "athletes", "F8_1000", "testingLogs", "coach-log"), { status: "final" }));
  await assertFails(setDoc(doc(env.authenticatedContext("athlete-auth").firestore(),
    "athletes", "F8_1000", "testingLogs", "athlete-log"), { status: "final" }));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),
    "athletes", "F8_1000", "testingLogs", "anonymous-log"), { status: "final" }));
});
