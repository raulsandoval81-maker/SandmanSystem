import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "sandman-staff-governance-rules",
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "admin"), { role: "admin", status: "active" });
    await setDoc(doc(db, "staff", "management"), { role: "management", status: "active", locationIds: ["lompoc"] });
    await setDoc(doc(db, "staff", "coach"), { role: "coach", status: "active", locationIds: ["lompoc"] });
    await setDoc(doc(db, "staff", "inactive-admin"), { role: "admin", status: "inactive" });
  });
});
after(async () => env?.cleanup());

test("direct client staff authority writes are denied to every role", async () => {
  for (const uid of ["admin", "management", "coach", "inactive-admin"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(updateDoc(doc(db, "staff", "coach"), { role: "admin" }));
    await assertFails(setDoc(doc(db, "staff", "new-staff"), { role: "coach", status: "active", locationIds: ["lompoc"] }));
  }
  await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), "staff", "coach"), { status: "inactive" }));
});

test("existing staff list visibility remains unchanged for active Admin and Management", async () => {
  await assertSucceeds(getDocs(collection(env.authenticatedContext("admin").firestore(), "staff")));
  await assertSucceeds(getDocs(collection(env.authenticatedContext("management").firestore(), "staff")));
  await assertFails(getDocs(collection(env.authenticatedContext("coach").firestore(), "staff")));
});
