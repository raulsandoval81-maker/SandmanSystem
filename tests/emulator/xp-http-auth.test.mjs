import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createRequire } from "node:module";
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth, getIdToken, signInWithCustomToken } from "firebase/auth";

const require = createRequire(import.meta.url);
const { initializeApp, deleteApp } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth: getAdminAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore } = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-sandman-xp-http";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
if (!process.env.FIRESTORE_EMULATOR_HOST || !AUTH_HOST) {
  throw new Error("XP HTTP tests require Firestore and Auth emulators.");
}

const adminApp = initializeApp({ projectId: PROJECT_ID }, "xp-http-admin");
const db = getFirestore(adminApp);
const clients = [];
const endpoint = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/us-central1/xpHttp`;

async function tokenFor(uid) {
  const app = initializeClientApp({ apiKey: "emulator-key", projectId: PROJECT_ID }, `xp-http-${uid}`);
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const customToken = await getAdminAuth(adminApp).createCustomToken(uid);
  const credential = await signInWithCustomToken(auth, customToken);
  return getIdToken(credential.user);
}

async function post(payload, token = "") {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: payload }),
  });
}

before(async () => {
  await db.doc("athletes/F8_HTTP_SYNTHETIC").set({
    uid: "F8_HTTP_SYNTHETIC",
    fullName: "Synthetic HTTP Athlete",
    trackBase: "F8",
    journey: "Z2H",
    tier: "T1",
    progressionTier: "T1",
    xp: 100,
    xpCap: 1600,
    stripeCount: 0,
    locationId: "lompoc",
    primaryDiscipline: "wrestling",
    discipline: "wrestling",
    disciplineIds: ["wrestling"],
    monthly: {},
  });
  await db.doc("staff/COACH_HTTP_VALID").set({ role: "coach", status: "active", locationId: "lompoc" });
  await db.doc("staff/COACH_HTTP_OTHER").set({ role: "coach", status: "active", locationId: "elk-grove" });
});

after(async () => {
  await Promise.all(clients.map(deleteClientApp));
  await deleteApp(adminApp);
});

test("xpHttp distinguishes transport, authentication, authorization, and application success", async () => {
  const payload = {
    uid: "F8_HTTP_SYNTHETIC",
    kind: "ARENA/BATTLE",
    amount: 10,
    meta: { tournamentId: "synthetic-http-event", source: "xp-http-emulator", discipline: "wrestling" },
  };

  const cors = await fetch(endpoint, { method: "OPTIONS", headers: { Origin: "https://staging.invalid" } });
  assert.equal(cors.status, 204);

  const missing = await post(payload);
  assert.equal(missing.status, 401);

  const nonStaff = await post(payload, await tokenFor("SYNTHETIC_NON_STAFF"));
  assert.equal(nonStaff.status, 403);

  const outOfScope = await post(payload, await tokenFor("COACH_HTTP_OTHER"));
  assert.equal(outOfScope.status, 403);

  const coachToken = await tokenFor("COACH_HTTP_VALID");
  const accepted = await post(payload, coachToken);
  const acceptedText = await accepted.text();
  assert.equal(accepted.status, 200, acceptedText);
  const first = JSON.parse(acceptedText);
  assert.equal(first.ok, true);
  assert.equal(first.delta, 10);

  const duplicate = await post(payload, coachToken);
  assert.equal(duplicate.status, 200);
  const retry = await duplicate.json();
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.delta, 0);

  const athlete = (await db.doc("athletes/F8_HTTP_SYNTHETIC").get()).data();
  assert.equal(athlete.xp, 110);
  const receipts = await db.collection("xpAwardReceipts").where("uid", "==", payload.uid).get();
  assert.equal(receipts.size, 1);
  assert.equal(receipts.docs[0].get("result.afterXp"), athlete.xp);
});
