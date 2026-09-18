import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

let env;
const projectId = "sandman-phase-c-management-location";

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "management-syv"), { role: "management", status: "active", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "staff", "management-lompoc"), { role: "management", status: "active", locationIds: ["lompoc"] });
    await setDoc(doc(db, "staff", "management-multi"), { role: "management", status: "active", locationIds: ["santa-ynez-valley", "lompoc"] });
    await setDoc(doc(db, "staff", "management-inactive"), { role: "management", status: "inactive", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "staff", "admin"), { role: "admin", status: "active" });
    await setDoc(doc(db, "staff", "coach"), { role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "admissions_requests", "syv"), { locationId: "santa-ynez-valley", status: "new", coachNotes: "" });
    await setDoc(doc(db, "admissions_requests", "lompoc"), { locationId: "lompoc", status: "new", coachNotes: "" });
    await setDoc(doc(db, "admissions_requests", "missing"), { status: "new", coachNotes: "" });
    await setDoc(doc(db, "general_messages", "assigned-wrong-location"), {
      locationId: "lompoc", assignedManagerUid: "management-syv", assignmentStatus: "ASSIGNED",
    });
    await setDoc(doc(db, "general_messages", "assigned-right-location"), {
      locationId: "santa-ynez-valley", assignedManagerUid: "management-syv", assignmentStatus: "ASSIGNED",
    });
    await setDoc(doc(db, "general_messages", "pending-syv"), {
      locationId: "santa-ynez-valley", assignedManagerUid: null, assignmentStatus: "PENDING_MANAGEMENT",
    });
  });
});

after(async () => env?.cleanup());

test("Management reads and updates admissions requests only in assigned locations", async () => {
  const syv = env.authenticatedContext("management-syv").firestore();
  await assertSucceeds(getDoc(doc(syv, "admissions_requests", "syv")));
  await assertSucceeds(updateDoc(doc(syv, "admissions_requests", "syv"), { coachNotes: "Reviewed" }));
  await assertFails(getDoc(doc(syv, "admissions_requests", "lompoc")));
  await assertFails(updateDoc(doc(syv, "admissions_requests", "lompoc"), { coachNotes: "Cross-location" }));
  await assertFails(getDoc(doc(syv, "admissions_requests", "missing")));
  await assertSucceeds(getDocs(query(collection(syv, "admissions_requests"), where("locationId", "==", "santa-ynez-valley"))));
  await assertFails(getDocs(collection(syv, "admissions_requests")));
});

test("multi-location Management and Admin retain their intended scope", async () => {
  const multi = env.authenticatedContext("management-multi").firestore();
  await assertSucceeds(getDoc(doc(multi, "admissions_requests", "syv")));
  await assertSucceeds(getDoc(doc(multi, "admissions_requests", "lompoc")));
  const admin = env.authenticatedContext("admin").firestore();
  await assertSucceeds(getDoc(doc(admin, "admissions_requests", "syv")));
  await assertSucceeds(getDoc(doc(admin, "admissions_requests", "lompoc")));
  await assertSucceeds(getDoc(doc(admin, "admissions_requests", "missing")));
});

test("Coach and inactive Management gain no Management admissions authority", async () => {
  await assertFails(getDoc(doc(env.authenticatedContext("coach").firestore(), "admissions_requests", "syv")));
  await assertFails(getDoc(doc(env.authenticatedContext("management-inactive").firestore(), "admissions_requests", "syv")));
});

test("stale assignedManagerUid cannot bypass current message location scope", async () => {
  const syv = env.authenticatedContext("management-syv").firestore();
  await assertFails(getDoc(doc(syv, "general_messages", "assigned-wrong-location")));
  await assertSucceeds(getDoc(doc(syv, "general_messages", "assigned-right-location")));
  await assertSucceeds(getDoc(doc(syv, "general_messages", "pending-syv")));
  await assertFails(getDoc(doc(env.authenticatedContext("management-lompoc").firestore(), "general_messages", "pending-syv")));
  await assertSucceeds(getDoc(doc(env.authenticatedContext("admin").firestore(), "general_messages", "assigned-wrong-location")));
});
