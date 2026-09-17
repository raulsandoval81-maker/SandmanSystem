import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const require = createRequire(import.meta.url);
const { initializeApp, deleteApp, getApps } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth: getAdminAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore } = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = process.env.GCLOUD_PROJECT || "sandman-staff-governance";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Staff governance tests require Firestore and Auth emulators.");
}
const adminApp = getApps().find((app) => app.name === "staff-governance-admin")
  || initializeApp({ projectId }, "staff-governance-admin");
const db = getFirestore(adminApp);
const clients = [];

async function client(uid) {
  const app = initializeClientApp({ apiKey: "emulator-key", projectId }, `staff-${uid}-${clients.length}`);
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  await signInWithCustomToken(auth, await getAdminAuth(adminApp).createCustomToken(uid));
  const functions = getFunctions(app, "us-central1");
  const [host, port] = (process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001").split(":");
  connectFunctionsEmulator(functions, host, Number(port));
  return httpsCallable(functions, "updateStaffGovernance");
}

function anonymousClient() {
  const app = initializeClientApp({ apiKey: "emulator-key", projectId }, `staff-anonymous-${clients.length}`);
  clients.push(app);
  const functions = getFunctions(app, "us-central1");
  const [host, port] = (process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001").split(":");
  connectFunctionsEmulator(functions, host, Number(port));
  return httpsCallable(functions, "updateStaffGovernance");
}

before(async () => {
  for (const collection of await db.listCollections()) {
    for (const ref of await collection.listDocuments()) await ref.delete();
  }
  await db.doc("staff/admin-a").set({ role: "admin", status: "active" });
  await db.doc("staff/admin-b").set({ role: "admin", status: "active", locationIds: [] });
  await db.doc("staff/manager").set({ role: "management", status: "active", locationIds: ["lompoc"] });
  await db.doc("staff/coach").set({ role: "coach", status: "active", locationIds: ["lompoc"] });
  await db.doc("staff/inactive-admin").set({ role: "admin", status: "inactive" });
});
after(async () => {
  await Promise.all(clients.map(deleteClientApp));
  await deleteApp(adminApp);
});

test("active Admin governs canonical role, status, and multi-location scope", async () => {
  const update = await client("admin-a");
  await update({ staffUid: "coach", role: "coach", status: "inactive", locationIds: ["lompoc", "santa-ynez-valley"] });
  const saved = (await db.doc("staff/coach").get()).data();
  assert.equal(saved.role, "coach");
  assert.equal(saved.status, "inactive");
  assert.deepEqual(saved.locationIds, ["lompoc", "santa-ynez-valley"]);
  assert.equal(saved.updatedBy, "admin-a");
  assert.equal(saved.updatedByRole, "admin");
});

test("Management, Coach, inactive Admin, and anonymous authority are denied", async () => {
  for (const uid of ["manager", "coach", "inactive-admin"]) {
    const update = await client(uid);
    await assert.rejects(update({ staffUid: "manager", role: "management", status: "active", locationIds: ["lompoc"] }));
  }
  await assert.rejects(anonymousClient()({ staffUid: "manager", role: "management", status: "active", locationIds: ["lompoc"] }));
});

test("unknown and legacy roles, invalid statuses, and malformed scope fail closed", async () => {
  const update = await client("admin-a");
  await assert.rejects(update({ staffUid: "manager", role: "location_manager", status: "active", locationIds: ["lompoc"] }));
  await assert.rejects(update({ staffUid: "manager", role: "management", status: "enabled", locationIds: ["lompoc"] }));
  await assert.rejects(update({ staffUid: "manager", role: "management", status: "active", locationIds: ["Santa Ynez"] }));
  await assert.rejects(update({ staffUid: "manager", role: "management", status: "active", locationIds: ["lompoc", "lompoc"] }));
});

test("transaction prevents removal of the last active Admin", async () => {
  const update = await client("admin-a");
  await update({ staffUid: "admin-b", role: "coach", status: "active", locationIds: ["lompoc"] });
  await assert.rejects(update({ staffUid: "admin-a", role: "admin", status: "inactive", locationIds: [] }), /last active Admin/i);
  const adminA = (await db.doc("staff/admin-a").get()).data();
  assert.equal(adminA.role, "admin");
  assert.equal(adminA.status, "active");
});
