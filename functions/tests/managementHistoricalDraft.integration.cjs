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
      confirmIdentityReview: true,
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

test("existing legacy proposal with same email, athlete and coverage is reused without rewriting it", async () => {
  const legacyId = "P-698765";
  const legacyEmail = "synthetic-legacy-" + suffix + "@example.test";
  await db.doc("proposals/" + legacyId).set({
    proposalId: legacyId, locationId, status: "PAID",
    prospect: {email: legacyEmail},
    athletes: [{name: "Legacy Synthetic Athlete", plan: "standard", billingTerm: "annual"}],
    pricing: {membershipStartDate},
  });
  const request = entry({
    prospect: {...entry().prospect, email: legacyEmail},
    athletes: [{name: "Legacy Synthetic Athlete", plan: "standard", billingTerm: "annual"}],
  });
  assert.deepEqual(await invoke(manager, request), { ok: true, proposalId: legacyId, status: "PAID", idempotent: true });
  assert.equal((await db.doc("proposals/" + legacyId).get()).get("managementHistorical"), undefined);
  await db.doc("proposals/" + legacyId).update({ status: "VOID" });
  await assert.rejects(invoke(manager, request), (error) => error.code === "failed-precondition");
});

test("new historical identity requires completed records review", async () => {
  const request = entry({
    prospect: {...entry().prospect, email: "no-review-" + email},
    managementHistorical: {...entry().managementHistorical, confirmIdentityReview: false},
  });
  await assert.rejects(invoke(manager, request), (error) => error.code === "failed-precondition");
});

test("two concurrent Admissions handoffs reuse one proposal for the same appointment", async () => {
  const appointmentId = "synthetic-appointment-" + suffix;
  await db.doc("admissions_appointments/" + appointmentId).set({ locationId, email });
  const request = entry({ managementHistorical: null, appointmentId });
  const results = await Promise.all([invoke(manager, request), invoke(manager, request)]);
  assert.equal(results[0].proposalId, results[1].proposalId);
  assert.equal(results.filter(result => result.idempotent).length, 1);
});

test("recover an unscoped legacy appointment without changing its Admissions record", async () => {
  const admin = "historical-test-admin-" + suffix;
  const historicalAppointmentId = "legacy-appointment-" + suffix;
  const legacyEmail = "unscoped-" + email;
  const appointment = {
    athleteName: "Synthetic Historical Athlete",
    parentName: "Synthetic Parent",
    email: legacyEmail,
    admissionsStatus: "ready_to_enroll",
    appointmentStatus: "completed",
  };
  await db.doc("staff/" + admin).set({ role: "admin", status: "active" });
  const source = db.doc("admissions_appointments/" + historicalAppointmentId);
  await source.set(appointment);
  const request = entry({
    managementHistorical: {...entry().managementHistorical, historicalAppointmentId, locationId: "santa-ynez-valley"},
    prospect: {...entry().prospect, email: legacyEmail},
  });

  await assert.rejects(invoke(manager, request), error => error.code === "permission-denied");
  await assert.rejects(invoke(admin, {...request, prospect: {...request.prospect, email}}),
    error => error.code === "failed-precondition");
  const recovered = await invoke(admin, request);
  assert.equal(recovered.status, "DRAFT");
  const draft = await db.doc("proposals/" + recovered.proposalId).get();
  assert.equal(draft.get("prospect.appointmentId"), historicalAppointmentId);
  assert.equal(draft.get("locationId"), "santa-ynez-valley");
  assert.equal(draft.get("managementHistorical.verifiedLegacyAppointmentLocation"), "santa-ynez-valley");
  assert.equal(draft.get("cashPrepayment"), undefined);
  assert.deepEqual((await source.get()).data(), appointment);
  assert.equal((await invoke(admin, request)).proposalId, recovered.proposalId);
});

test("recover a documented agreement from a location-scoped Admissions appointment", async () => {
  const historicalAppointmentId = "scoped-appointment-" + suffix;
  const contactEmail = "scoped-" + email;
  await db.doc("staff/" + manager).update({ locationIds: [locationId, "santa-ynez-valley"] });
  await db.doc("admissions_appointments/" + historicalAppointmentId).set({
    athleteName: "Synthetic Historical Athlete",
    email: contactEmail,
    locationId: "santa-ynez-valley",
    admissionsRequestId: "original-admissions-reference",
  });
  const request = entry({
    managementHistorical: {...entry().managementHistorical, historicalAppointmentId, locationId: "santa-ynez-valley"},
    prospect: {...entry().prospect, email: contactEmail},
  });
  await assert.rejects(invoke(manager, {
    ...request,
    managementHistorical: {...request.managementHistorical, locationId: "lompoc"},
  }), error => error.code === "failed-precondition");

  const result = await invoke(manager, request);
  const saved = await db.doc("proposals/" + result.proposalId).get();
  assert.equal(saved.get("prospect.appointmentId"), historicalAppointmentId);
  assert.equal(saved.get("prospect.admissionsRequestId"), "original-admissions-reference");
  assert.equal(saved.get("managementHistorical.paymentVerificationAtEntry"), "NOT_VERIFIED");
  assert.equal((await invoke(manager, request)).proposalId, result.proposalId);
});

test("a scoped appointment can recover its exact historical proposal even without a stored link", async () => {
  const historicalAppointmentId = "disconnected-appointment-" + suffix;
  const contactEmail = "disconnected-" + email;
  const proposalId = "P-698766";
  await db.doc("admissions_appointments/" + historicalAppointmentId).set({
    athleteName: "Synthetic Historical Athlete",
    email: contactEmail,
    locationId: "santa-ynez-valley",
  });
  const existing = db.doc("proposals/" + proposalId);
  await existing.set({
    proposalId,
    status: "PAID",
    locationId: "santa-ynez-valley",
    prospect: {email: contactEmail},
    athletes: [{name: "Synthetic Historical Athlete"}],
    pricing: {membershipStartDate},
  });
  const before = (await existing.get()).data();
  const result = await invoke(manager, entry({
    managementHistorical: {...entry().managementHistorical, historicalAppointmentId, locationId: "santa-ynez-valley"},
    prospect: {...entry().prospect, email: contactEmail},
  }));
  assert.equal(result.proposalId, proposalId);
  assert.equal(result.idempotent, true);
  assert.deepEqual((await existing.get()).data(), before);
});
