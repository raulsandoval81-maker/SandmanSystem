// Emulator-only: direct historical Management proposal entry, no external services.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Historical draft acceptance requires an isolated demo-* Firestore emulator.");
}
if (process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Historical draft acceptance refuses payment/email/cloud credentials.");
}

const app = initializeApp({projectId: process.env.GCLOUD_PROJECT});
const db = getFirestore(app);
const createDraft = require("../lib/proposals/createProposalDraft").createProposalDraft;
const suffix = String(process.pid);
const locationId = "historical-test-location-" + suffix;
const manager = "historical-test-manager-" + suffix;
const outsider = "historical-test-outsider-" + suffix;
const email = "synthetic-historical-" + suffix + "@example.test";
const membershipStartDate = "2026-11-01";
const invoke = (uid, data) => createDraft.run({auth: {uid, token: {}}, data});

function entry(overrides = {}) {
  return {
    appointmentId: null,
    admissionsRequestId: null,
    managementHistorical: {
      locationId,
      sourceReference: "signed-paper-agreement-" + suffix,
      confirmExistingAgreement: true,
    },
    prospect: {
      familyName: "Synthetic Historical Family",
      primaryContactName: "Synthetic Parent",
      email,
      registrantRole: "parent-guardian",
    },
    athletes: [{
      name: "Synthetic Historical Athlete",
      memberType: "youth",
      plan: "standard",
      billingTerm: "annual",
      disciplines: ["wrestling"],
    }],
    pricing: { monthlyBalance: 80, enrollmentBase: 30, membershipStartDate },
    agreement: { membershipStartDate },
    ...overrides,
  };
}

test.before(async () => {
  await Promise.all([
    db.doc("staff/" + manager).set({
      role: "management", status: "active", fullName: "Synthetic Manager", locationIds: [locationId],
    }),
    db.doc("staff/" + outsider).set({
      role: "management", status: "active", fullName: "Outside Manager", locationIds: ["outside-location"],
    }),
  ]);
});
test.after(async () => deleteApp(app));

let proposalId = "";
test("documented Management case creates one real DRAFT without an appointment or payment", async () => {
  const result = await invoke(manager, entry());
  assert.match(result.proposalId, /^P-\d{6}$/);
  proposalId = result.proposalId;
  const saved = (await db.doc("proposals/" + proposalId).get()).data();
  assert.equal(saved.status, "DRAFT");
  assert.equal(saved.locationId, locationId);
  assert.equal(saved.prospect.appointmentId, null);
  assert.equal(saved.prospect.email, email);
  assert.equal(saved.athletes[0].billingTerm, "annual");
  assert.equal(saved.managementHistorical.paymentVerificationAtEntry, "NOT_VERIFIED");
  assert.equal(saved.cashPrepayment, undefined);
  assert.equal(saved.priorPayments, undefined);
  assert.equal(saved.stripeCheckoutSessionId, undefined);
  const events = await db.collection("proposals").doc(proposalId).collection("history")
    .where("event", "==", "MANAGEMENT_HISTORICAL_DRAFT_CREATED").get();
  assert.equal(events.size, 1);
});

test("same identity and start date reuses P-ID and does not mint another draft", async () => {
  const result = await invoke(manager, entry({
    managementHistorical: {...entry().managementHistorical, sourceReference: "updated-real-document-reference"},
  }));
  assert.equal(result.proposalId, proposalId);
  assert.equal(result.idempotent, true);
  const events = await db.collection("proposals").doc(proposalId).collection("history").get();
  assert.equal(events.size, 1);
});

test("outside-location staff cannot issue this historical proposal", async () => {
  await assert.rejects(invoke(outsider, entry()), (error) => error.code === "permission-denied");
});

test("staff attestation and real identity are mandatory before allocating a proposal", async () => {
  await assert.rejects(invoke(manager, entry({
    managementHistorical: {...entry().managementHistorical, confirmExistingAgreement: false},
  })), (error) => error.code === "invalid-argument");
  await assert.rejects(invoke(manager, entry({
    athletes: [{name: "Member 1", plan: "standard", billingTerm: "annual"}],
  })), (error) => error.code === "invalid-argument");
});

test("direct historical entry cannot mix Admissions or conversion sources", async () => {
  await assert.rejects(invoke(manager, entry({appointmentId: "invented-appointment"})),
    (error) => error.code === "invalid-argument");
  await assert.rejects(invoke(manager, entry({conversionSourceProposalId: "P-000111"})),
    (error) => error.code === "invalid-argument");
});

test("existing legacy proposal with same email, athlete and coverage blocks duplicate creation", async () => {
  const legacyId = "P-698765";
  const legacyEmail = "synthetic-legacy-" + suffix + "@example.test";
  await db.doc("proposals/" + legacyId).set({
    proposalId: legacyId, locationId, status: "PAID",
    prospect: {email: legacyEmail},
    athletes: [{name: "Legacy Synthetic Athlete", plan: "standard", billingTerm: "annual"}],
    pricing: {membershipStartDate},
  });
  await assert.rejects(invoke(manager, entry({
    prospect: {...entry().prospect, email: legacyEmail},
    athletes: [{name: "Legacy Synthetic Athlete", plan: "standard", billingTerm: "annual"}],
  })), (error) => error.code === "already-exists");
});
