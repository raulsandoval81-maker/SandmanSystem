import assert from "node:assert/strict";
import test, { after } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const projectId = "demo-sandman-command-center-e2e";
const rulesEnv = await initializeTestEnvironment({
  projectId,
  firestore: { host: "127.0.0.1", port: 8181 },
});
const apps = [];

async function client(label, staff) {
  const app = initializeApp({ projectId, apiKey: "demo-key", authDomain: "localhost" }, label);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9199", { disableWarnings: true });
  const email = `${label}@example.test`;
  const credential = await createUserWithEmailAndPassword(auth, email, "Synthetic-Command-1!");
  await rulesEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "staff", credential.user.uid), staff);
  });
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5501);
  return { auth, call: (name) => httpsCallable(functions, name) };
}

after(async () => {
  await Promise.all(apps.map(deleteApp));
  await rulesEnv.cleanup();
});

test("actual callable handlers deny ordinary Admin and persist owner lifecycle with immutable history", async () => {
  const ordinary = await client("ordinary-admin", { role: "admin", status: "active" });
  await assert.rejects(ordinary.call("getCommandCenterSnapshot")({}), /permission-denied|owner access/i);
  await signOut(ordinary.auth);

  const owner = await client("command-owner", { role: "admin", status: "active", commandCenterOwner: true });
  const save = owner.call("saveCommandCenterProject");
  const snapshot = owner.call("getCommandCenterSnapshot");
  const archive = owner.call("archiveCommandCenterProject");
  const base = {
    title: "Synthetic Command Center acceptance", summary: "No customer data",
    module: "testing_verification", priority: "high",
    repository: "raulsandoval81-maker/SandmanSystem", branch: "synthetic/acceptance",
    prUrl: "", environment: "local", testEvidence: [], blockers: [], nextAction: "Continue acceptance",
  };
  const created = (await save({ project: { ...base, status: "planned" } })).data;
  assert.equal(created.ok, true);
  const projectIdValue = created.projectId;
  for (const status of ["in_progress", "built"]) await save({ projectId: projectIdValue, project: { ...base, status } });
  const testEvidence = [{ type: "test", result: "pass", label: "Synthetic handler acceptance", url: "https://example.test/test" }];
  await save({ projectId: projectIdValue, project: { ...base, status: "tested", testEvidence } });
  const merged = { ...base, status: "merged", testEvidence, prUrl: "https://github.com/example/project/pull/1" };
  await save({ projectId: projectIdValue, project: merged });
  const deployedEvidence = [...testEvidence, { type: "deployment", result: "pass", label: "Synthetic staging", url: "https://example.test/deploy" }];
  await save({ projectId: projectIdValue, project: { ...merged, status: "deployed", environment: "staging", testEvidence: deployedEvidence } });
  const verifiedEvidence = [...deployedEvidence, { type: "verification", result: "pass", label: "Synthetic verification", url: "https://example.test/verify" }];
  await save({ projectId: projectIdValue, project: { ...merged, status: "verified", environment: "staging", testEvidence: verifiedEvidence } });
  const beforeArchive = (await snapshot({})).data.projects.find((item) => item.id === projectIdValue);
  assert.equal(beforeArchive.status, "verified");
  assert.equal(beforeArchive.history.length, 7);
  await archive({ projectId: projectIdValue });
  const archived = (await snapshot({})).data.projects.find((item) => item.id === projectIdValue);
  assert.equal(archived.status, "archived");
  assert.equal(archived.history.length, 8);
  assert.equal(archived.history[0].action, "archived");
});
