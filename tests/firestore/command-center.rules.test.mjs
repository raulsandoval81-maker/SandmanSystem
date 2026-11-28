import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "sandman-command-center-rules",
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "owner"), { role: "admin", status: "active", commandCenterOwner: true });
    await setDoc(doc(db, "staff", "admin"), { role: "admin", status: "active" });
    await setDoc(doc(db, "adminCommandCenterProjects", "secret"), { title: "Confidential" });
    await setDoc(doc(db, "adminCommandCenterProjects", "secret", "history", "one"), { action: "created" });
  });
});
after(async () => env?.cleanup());

test("Command Center documents remain closed to every direct client", async () => {
  for (const uid of ["owner", "admin", "management", "coach"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "adminCommandCenterProjects", "secret")));
    await assertFails(getDocs(collection(db, "adminCommandCenterProjects")));
    await assertFails(setDoc(doc(db, "adminCommandCenterProjects", "attempt"), { title: "Escalation" }));
    await assertFails(getDoc(doc(db, "adminCommandCenterProjects", "secret", "history", "one")));
  }
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "adminCommandCenterProjects", "secret")));
});
