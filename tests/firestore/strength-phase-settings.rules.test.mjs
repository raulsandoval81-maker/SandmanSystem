import fs from "node:fs";
import test, { after, before, beforeEach } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const PROJECT_ID = "sandmandashboard-strength-phase-rules";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8081,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "coach-active"), { role: "coach", status: "active" });
    await setDoc(doc(db, "staff", "coach-inactive"), { role: "coach", status: "inactive" });
    await setDoc(doc(db, "staff", "admin-active"), { role: "admin", status: "active" });
    await setDoc(doc(db, "staff", "athlete-user"), { role: "athlete", status: "active" });
  });
});

after(async () => {
  await env?.cleanup();
});

function payload(uid, activePhase) {
  return {
    scopeType: "system",
    scopeId: "sandman",
    activePhase,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
}

test("active Coach can set every approved Strength phase", async () => {
  const db = env.authenticatedContext("coach-active").firestore();
  for (const phase of ["preseason", "inseason", "postseason"]) {
    await assertSucceeds(setDoc(
      doc(db, "strengthPhaseSettings", "system"),
      payload("coach-active", phase)
    ));
  }
});

test("active Admin can set the system Strength phase", async () => {
  const db = env.authenticatedContext("admin-active").firestore();
  await assertSucceeds(setDoc(
    doc(db, "strengthPhaseSettings", "system"),
    payload("admin-active", "preseason")
  ));
});

test("authenticated readers can consume the current phase", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "strengthPhaseSettings", "system"), {
      scopeType: "system",
      scopeId: "sandman",
      activePhase: "postseason",
      updatedAt: new Date(),
      updatedBy: "coach-active",
    });
  });
  const db = env.authenticatedContext("athlete-user").firestore();
  await assertSucceeds(getDoc(doc(db, "strengthPhaseSettings", "system")));
});

test("anonymous, non-Coach, and inactive Coach writes fail", async () => {
  await assertFails(setDoc(
    doc(env.unauthenticatedContext().firestore(), "strengthPhaseSettings", "system"),
    payload("anonymous", "preseason")
  ));
  await assertFails(setDoc(
    doc(env.authenticatedContext("athlete-user").firestore(), "strengthPhaseSettings", "system"),
    payload("athlete-user", "preseason")
  ));
  await assertFails(setDoc(
    doc(env.authenticatedContext("coach-inactive").firestore(), "strengthPhaseSettings", "system"),
    payload("coach-inactive", "preseason")
  ));
});

test("invalid phase, spoofed owner, wrong scope, and client timestamp fail", async () => {
  const db = env.authenticatedContext("coach-active").firestore();
  await assertFails(setDoc(
    doc(db, "strengthPhaseSettings", "system"),
    payload("coach-active", "offseason")
  ));
  await assertFails(setDoc(
    doc(db, "strengthPhaseSettings", "system"),
    payload("another-coach", "preseason")
  ));
  await assertFails(setDoc(
    doc(db, "strengthPhaseSettings", "team-one"),
    payload("coach-active", "preseason")
  ));
  await assertFails(setDoc(
    doc(db, "strengthPhaseSettings", "system"),
    { ...payload("coach-active", "preseason"), updatedAt: new Date() }
  ));
});
