import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createRequire } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-payments-v1";
admin.initializeApp({ projectId });
const db = admin.firestore();
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { closeManagementMessageById } = require(`${buildRoot}/modules/management/storeClosedMessageIntelligence.js`);

const staff = (uid, data) => db.doc(`staff/${uid}`).set(data);
const messageRef = (id) => db.doc(`general_messages/${id}`);
const intelligenceRef = (id) => db.doc(`management_intelligence/${id}`);
const pass = {
  topic: "request-pass", passType: "combat-dropin-1day",
  locationId: "santa-ynez-valley", status: "REVIEWING",
  messageStatus: "REVIEWING", routingStage: "MANAGEMENT_TRIAGE",
  assignmentStatus: "ASSIGNED", assignedManagerUid: "manager-owner",
};

before(async () => {
  await staff("manager-owner", { role: "management", status: "active", locationIds: ["santa-ynez-valley"] });
  await staff("manager-other", { role: "management", status: "active", locationIds: ["santa-ynez-valley"] });
  await staff("manager-singular", { role: "management", status: "active", locationId: "santa-ynez-valley" });
  await staff("manager-wrong", { role: "management", status: "active", locationIds: ["lompoc"] });
  await staff("admin-pass", { role: "admin", status: "active", locationIds: [] });
  await staff("coach-pass", { role: "coach", status: "active", locationIds: ["santa-ynez-valley"] });
  await staff("manager-inactive", { role: "management", status: "inactive", locationIds: ["santa-ynez-valley"] });
});
after(async () => admin.app().delete());

async function assertUnchanged(id) {
  assert.equal((await messageRef(id).get()).get("status"), "REVIEWING");
  assert.equal((await intelligenceRef(id).get()).exists, false);
}

test("failed attendance or payment gate writes neither CLOSED nor Intelligence", async () => {
  for (const [suffix, change] of [
    ["unattended", { passPaymentStatus: "paid", stripePaymentIntentId: "pi_1" }],
    ["unpaid", { passAttendanceConfirmedAt: admin.firestore.Timestamp.now(), passPaymentStatus: "pending" }],
    ["no-intent", { passAttendanceConfirmedAt: admin.firestore.Timestamp.now(), passPaymentStatus: "paid" }],
  ]) {
    const id = `gate-${suffix}`;
    await messageRef(id).set({ ...pass, ...change });
    await assert.rejects(closeManagementMessageById(id, "manager-owner"), /confirm attendance.*verified payment/i);
    await assertUnchanged(id);
  }
});

test("attended and paid pass closes atomically with compact Intelligence summary", async () => {
  const id = "complete-pass";
  const attendedAt = admin.firestore.Timestamp.now();
  await messageRef(id).set({ ...pass, passAttendanceConfirmedAt: attendedAt,
    passAttendanceConfirmedBy: "manager-owner", passPaymentStatus: "paid",
    passAmountCents: 2500, passCurrency: "usd", passPaidAt: attendedAt,
    stripeCheckoutSessionId: "cs_pass", stripePaymentIntentId: "pi_pass",
    stripeReceiptUrl: "https://pay.stripe.com/r/example", stripePriceId: "price_secret_internal" });
  await closeManagementMessageById(id, "manager-owner");
  assert.equal((await messageRef(id).get()).get("status"), "CLOSED");
  const intelligence = (await intelligenceRef(id).get()).data();
  assert.equal(intelligence.passPaymentStatus, "paid");
  assert.equal(intelligence.passAttendanceConfirmedBy, "manager-owner");
  assert.equal(intelligence.stripePaymentIntentId, "pi_pass");
  assert.equal(intelligence.stripeReceiptUrl, "https://pay.stripe.com/r/example");
  assert.equal(intelligence.stripePriceId, undefined);
});

test("same-location non-owner, wrong-location, Coach, and inactive staff cannot close pass", async () => {
  const id = "restricted-pass";
  await messageRef(id).set({ ...pass, passAttendanceConfirmedAt: admin.firestore.Timestamp.now(),
    passPaymentStatus: "paid", stripePaymentIntentId: "pi_restricted" });
  for (const uid of ["manager-other", "manager-wrong", "coach-pass", "manager-inactive"]) {
    await assert.rejects(closeManagementMessageById(id, uid));
    await assertUnchanged(id);
  }
});

test("assigned singular-scope Management and Admin may close through callable", async () => {
  const paid = { ...pass, passAttendanceConfirmedAt: admin.firestore.Timestamp.now(),
    passPaymentStatus: "paid", stripePaymentIntentId: "pi_ok" };
  await messageRef("singular-pass").set({ ...paid, assignedManagerUid: "manager-singular" });
  await closeManagementMessageById("singular-pass", "manager-singular");
  assert.equal((await messageRef("singular-pass").get()).get("status"), "CLOSED");
  await messageRef("admin-pass-message").set({ ...paid, locationId: "lompoc" });
  await closeManagementMessageById("admin-pass-message", "admin-pass");
  assert.equal((await messageRef("admin-pass-message").get()).get("status"), "CLOSED");
});

test("non-pass close keeps prior location-only Management behavior", async () => {
  await messageRef("ordinary-message").set({ ...pass, topic: "programs", passType: null });
  await closeManagementMessageById("ordinary-message", "manager-other");
  assert.equal((await messageRef("ordinary-message").get()).get("status"), "CLOSED");
});
