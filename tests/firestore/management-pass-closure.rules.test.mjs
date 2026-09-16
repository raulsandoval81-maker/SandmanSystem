import fs from "node:fs";
import test, { before, beforeEach, after } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "sandman-management-pass-closure",
    firestore: { host: "127.0.0.1", port: 8081, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "admin"), { role: "admin", status: "active" });
    await setDoc(doc(db, "staff", "manager"), { role: "management", status: "active", locationIds: ["santa-ynez-valley"] });
    await setDoc(doc(db, "staff", "coach"), { role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
    const base = {
      locationId: "santa-ynez-valley", assignedManagerUid: "manager", assignedCoachUid: "coach",
      assignmentStatus: "ASSIGNED", status: "REVIEWING", messageStatus: "REVIEWING",
      routingStage: "COACH_ASSIGNED", nextRoutingStage: "COACH_REVIEWING",
      coachNotes: "", managementNotes: "", escalated: false, escalationReason: "", updatedAt: new Date(),
    };
    await setDoc(doc(db, "general_messages", "pass"), { ...base, topic: "request-pass", passType: "combat-dropin-1day" });
    await setDoc(doc(db, "general_messages", "ordinary"), { ...base, topic: "programs" });
  });
});

const message = (uid, id) => doc(env.authenticatedContext(uid).firestore(), "general_messages", id);
const closed = { status: "CLOSED", messageStatus: "CLOSED", routingStage: "CLOSED", updatedAt: new Date() };

test("Admin cannot directly close a pass through any closure field", async () => {
  for (const field of ["status", "messageStatus", "routingStage"]) {
    await assertFails(updateDoc(message("admin", "pass"), { [field]: "CLOSED", updatedAt: new Date() }));
  }
  await assertFails(updateDoc(message("admin", "pass"), closed));
  await assertSucceeds(updateDoc(message("admin", "pass"), { managementNotes: "Reviewed", updatedAt: new Date() }));
});

test("Management and assigned Coach cannot directly close a pass", async () => {
  await assertFails(updateDoc(message("manager", "pass"), closed));
  await assertFails(updateDoc(message("coach", "pass"), closed));
  await assertSucceeds(updateDoc(message("coach", "pass"), { coachNotes: "Reviewed", updatedAt: new Date() }));
});

test("non-pass closure remains permitted where existing rules allow it", async () => {
  await assertSucceeds(updateDoc(message("admin", "ordinary"), closed));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "general_messages", "ordinary"), {
      status: "REVIEWING", messageStatus: "REVIEWING", routingStage: "COACH_ASSIGNED",
    });
  });
  await assertSucceeds(updateDoc(message("coach", "ordinary"), closed));
});

test("permitted Management non-pass guidance update remains available", async () => {
  await assertSucceeds(updateDoc(message("manager", "ordinary"), {
    assignedManagerUid: "manager", routingStage: "ADMIN_GUIDANCE_REQUESTED",
    nextRoutingStage: "MANAGEMENT_RESPONSE", assignmentStatus: "ASSIGNED",
    status: "REVIEWING", messageStatus: "REVIEWING", escalated: true,
    escalationReason: "MANAGEMENT_GUIDANCE_REQUEST", updatedAt: new Date(),
  }));
});

test("attendance and payment fields remain server-owned", async () => {
  for (const uid of ["admin", "manager", "coach"]) {
    await assertFails(updateDoc(message(uid, "pass"), { passAttendanceConfirmedAt: new Date() }));
    await assertFails(updateDoc(message(uid, "pass"), { passPaymentStatus: "paid" }));
  }
});
