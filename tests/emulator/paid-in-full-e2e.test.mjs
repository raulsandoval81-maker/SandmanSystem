import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp, deleteApp, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { paidInFullUiState } from "../../public/management/billing/paid-in-full-state.js";

const projectId = process.env.GCLOUD_PROJECT || "";
if (!projectId.startsWith("demo-") || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Paid in Full E2E requires an isolated demo Firebase emulator project.");
}

const adminApp = getApps().find((app) => app.name === "paid-in-full-e2e-admin") ||
  initializeApp({ projectId }, "paid-in-full-e2e-admin");
const db = getFirestore(adminApp);
const clients = [];

async function callable(uid, name) {
  const app = initializeClientApp(
    { apiKey: "synthetic-emulator-key", projectId },
    `paid-in-full-${uid || "anonymous"}-${name}-${clients.length}`
  );
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  if (uid) await signInWithCustomToken(auth, await getAdminAuth(adminApp).createCustomToken(uid));
  const functions = getFunctions(app, "us-central1");
  const [host, port] = process.env.FUNCTIONS_EMULATOR_HOST.split(":");
  connectFunctionsEmulator(functions, host, Number(port));
  return httpsCallable(functions, name);
}

function proposal(overrides = {}) {
  return {
    proposalId: "synthetic",
    status: "READY_FOR_CHECKOUT",
    locationId: "santa-ynez-valley",
    paymentStatus: "pending",
    clientAcceptance: { accepted: true, signerName: "Synthetic Guardian" },
    lockedSnapshot: { accepted: true },
    pricing: {
      monthlyBase: 80,
      monthlySponsor: 0,
      monthlyBalance: 80,
      enrollmentBase: 30,
      enrollmentPreviouslyPaidAmount: 0,
    },
    agreement: { membershipStartDate: "2026-11-05", recurringBillingDay: 5 },
    athletes: [{ name: "Synthetic Athlete", plan: "standard" }],
    ...overrides,
  };
}

async function seedProposal(id, overrides = {}) {
  await db.doc(`proposals/${id}`).set({ ...proposal(overrides), proposalId: id });
}

async function historyEvents(id) {
  const snapshot = await db.collection(`proposals/${id}/history`).get();
  return snapshot.docs.map((doc) => doc.data().event);
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

before(async () => {
  for (const collection of await db.listCollections()) {
    for (const ref of await collection.listDocuments()) await ref.delete();
  }
  await db.doc("staff/manager").set({
    role: "management", status: "active", fullName: "Synthetic Manager",
    locationIds: ["santa-ynez-valley"], academyIds: ["staging-academy"],
  });
  await db.doc("staff/wrong-location").set({
    role: "management", status: "active", locationIds: ["lompoc"],
  });
  await db.doc("staff/coach").set({
    role: "coach", status: "active", locationIds: ["santa-ynez-valley"],
  });
});

after(async () => {
  await Promise.all(clients.map(deleteClientApp));
  await deleteApp(adminApp);
});

test("callable authorization rejects anonymous, Coach, and wrong-location identities", async () => {
  await seedProposal("auth-proposal", { status: "DRAFT" });
  const payload = {
    proposalId: "auth-proposal", amountCents: 10000, paymentMethod: "cash",
    periods: ["2026-10"], enrollmentFeeAmountCents: 2000,
  };
  for (const uid of [null, "coach", "wrong-location"]) {
    const record = await callable(uid, "recordProposalPriorPayment");
    await assert.rejects(record(payload));
  }
  assert.equal((await db.doc("proposals/auth-proposal").get()).data().priorPayments, undefined);
});

test("P-000019 synthetic history reconciles $200 cash, $10 checkout, and $80 November recurring", async () => {
  await seedProposal("partial-fee", {
    status: "AWAITING_CLIENT_SIGNATURE",
    priorPayments: [{
      amountCents: 10000, membershipAmountCents: 10000,
      enrollmentFeeAmountCents: 0, enrollmentFeeIncluded: false,
      paymentMethod: "cash", periods: ["2026-09"],
    }],
    priorPaymentsTotalCents: 10000,
  });
  const record = await callable("manager", "recordProposalPriorPayment");
  await record({
    proposalId: "partial-fee", amountCents: 10000, paymentMethod: "cash",
    periods: ["2026-10"], enrollmentFeeAmountCents: 2000,
  });
  const saved = (await db.doc("proposals/partial-fee").get()).data();
  const october = saved.priorPayments.find((entry) => entry.periods.includes("2026-10"));
  assert.equal(october.membershipAmountCents, 8000);
  assert.equal(october.enrollmentFeeAmountCents, 2000);
  assert.equal(saved.priorPaymentsTotalCents, 20000);
  const outstandingEnrollmentCents = 3000 - saved.priorPayments
    .reduce((n, entry) => n + entry.enrollmentFeeAmountCents, 0);
  assert.equal(outstandingEnrollmentCents, 1000);
  assert.equal(saved.pricing.monthlyBalance * 100, 8000);
  assert.equal(saved.agreement.recurringBillingDay, 5);
  assert.equal(saved.agreement.membershipStartDate, "2026-11-05");
  assert.equal(outstandingEnrollmentCents, 1000, "initial Stripe checkout remains $10");
  assert.ok(october.paymentId, "new historical payments receive a stable source reference");
  assert.ok((await historyEvents("partial-fee")).includes("PRIOR_PAYMENT_RECORDED"));
  await assert.rejects(record({
    proposalId: "partial-fee", amountCents: 10000, paymentMethod: "cash",
    periods: ["2026-10"], enrollmentFeeAmountCents: 2000,
  }), /already recorded/);
});

test("partial membership remains recorded without falsely satisfying a period", async () => {
  await seedProposal("period-validation", { status: "AWAITING_CLIENT_SIGNATURE" });
  const record = await callable("manager", "recordProposalPriorPayment");
  await record({
    proposalId: "period-validation", amountCents: 7000, paymentMethod: "cash",
    periods: ["2026-10"], enrollmentFeeAmountCents: 0,
  });
  let saved = (await db.doc("proposals/period-validation").get()).data();
  assert.deepEqual(saved.priorPayments[0].periods, []);
  assert.equal(saved.priorPayments[0].requestedPeriods[0], "2026-10");
  assert.equal(saved.priorPayments[0].membershipPeriodAllocations[0].totalPaidCents, 7000);
  assert.equal(saved.priorPayments[0].membershipPeriodAllocations[0].fullyPaid, false);
  await record({
    proposalId: "period-validation", amountCents: 1000, paymentMethod: "cash",
    periods: ["2026-10"], enrollmentFeeAmountCents: 0,
  });
  saved = (await db.doc("proposals/period-validation").get()).data();
  assert.deepEqual(saved.priorPayments[1].periods, ["2026-10"]);
  assert.equal(saved.priorPayments[1].membershipPeriodAllocations[0].totalPaidCents, 8000);
  assert.equal(saved.priorPayments[1].membershipPeriodAllocations[0].fullyPaid, true);
  await assert.rejects(record({
    proposalId: "period-validation", amountCents: 8000, paymentMethod: "cash",
    periods: ["2026-13"], enrollmentFeeAmountCents: 0,
  }), /must use YYYY-MM/);
  saved = (await db.doc("proposals/period-validation").get()).data();
  assert.equal(saved.priorPayments.length, 2);
});

test("multi-athlete historical annual fees require explicit immutable attribution", async () => {
  await seedProposal("multi-attribution", {
    pricing: {
      monthlyBase: 160, monthlySponsor: 0, monthlyBalance: 160,
      enrollmentBase: 60, enrollmentPreviouslyPaidAmount: 0,
    },
    athletes: [
      { name: "Synthetic One", plan: "standard" },
      { name: "Synthetic Two", plan: "standard" },
    ],
    priorPayments: [{
      paymentId: "historical-october", amountCents: 18000,
      membershipAmountCents: 16000, enrollmentFeeAmountCents: 2000,
      paymentMethod: "cash", periods: ["2026-10"],
    }],
  });
  const record = await callable("manager", "recordProposalPrepaidCash");
  const base = {
    proposalId: "multi-attribution", amountCents: 196000,
    membershipAmountCents: 192000, paymentMethod: "cash",
    paymentDate: "2026-11-01", membershipStartDate: "2026-11-05",
    membershipPaidThroughDate: "2027-11-04", nextBillingDate: "2027-11-05",
    enrollmentFeeIncludedAthleteIndexes: [1, 2],
    enrollmentFeeAllocations: [
      { athleteIndex: 1, amountCents: 1000 },
      { athleteIndex: 2, amountCents: 3000 },
    ],
  };
  await assert.rejects(record(base), /must attribute historical enrollment-fee payments/);
  await record({
    ...base,
    historicalEnrollmentFeeAttributions: [{
      sourcePaymentReference: "historical-october",
      athleteIndex: 1,
      amountCents: 2000,
    }],
  });
  const saved = (await db.doc("proposals/multi-attribution").get()).data();
  assert.equal(saved.priorPayments[0].enrollmentFeeAmountCents, 2000);
  assert.equal(saved.enrollmentFeeAttributions[0].sourcePaymentReference, "historical-october");
  assert.equal(saved.enrollmentFeeAttributions[0].athleteIndex, 1);
  assert.equal(saved.enrollmentFeeAttributions[0].attributedBy, "manager");
  assert.ok(saved.enrollmentFeeAttributions[0].attributedAt);
  assert.ok((await historyEvents("multi-attribution"))
    .includes("ENROLLMENT_FEE_ATTRIBUTIONS_RECORDED"));
});

test("full 12-month cash payment with fee included produces separately reconciled UI state", async () => {
  await seedProposal("full-included");
  const record = await callable("manager", "recordProposalPrepaidCash");
  await record({
    proposalId: "full-included", amountCents: 99000, membershipAmountCents: 96000,
    paymentMethod: "cash", paymentDate: "2026-11-01",
    membershipStartDate: "2026-11-05", membershipPaidThroughDate: "2027-11-04",
    nextBillingDate: "2027-11-05", enrollmentFeeIncludedAthleteIndexes: [1],
    enrollmentFeeAllocations: [{ athleteIndex: 1, amountCents: 3000 }],
  });
  const saved = (await db.doc("proposals/full-included").get()).data();
  assert.equal(saved.status, "PAID");
  assert.equal(saved.cashPrepayment.membershipPaidInFull, true);
  assert.equal(saved.cashPrepayment.annualEnrollmentFee.outstandingCents, 0);
  assert.equal(saved.clientAcceptance.accepted, true);
  assert.deepEqual(paidInFullUiState(saved), {
    isPaidInFull: true, label: "Membership Paid in Full", feeOutstandingCents: 0,
    canApproveRenewal: true, canSetupAutopay: false,
  });
});

test("full 12-month check payment can exclude the separate annual fee", async () => {
  await seedProposal("full-excluded");
  const record = await callable("manager", "recordProposalPrepaidCash");
  await record({
    proposalId: "full-excluded", amountCents: 96000, membershipAmountCents: 96000,
    paymentMethod: "check", paymentDate: "2026-11-02",
    membershipStartDate: "2026-11-05", membershipPaidThroughDate: "2027-11-04",
    nextBillingDate: "2027-11-05", enrollmentFeeIncludedAthleteIndexes: [],
    enrollmentFeeAllocations: [],
  });
  const saved = (await db.doc("proposals/full-excluded").get()).data();
  assert.equal(saved.cashPrepayment.paymentMethod, "check");
  assert.equal(saved.cashPrepayment.membershipPaidInFull, true);
  assert.equal(saved.cashPrepayment.annualEnrollmentFee.outstandingCents, 3000);
  assert.equal(paidInFullUiState(saved).feeOutstandingCents, 3000);
});

test("renewal is date-guarded, blocked before approval, and approval is audited exactly once", async () => {
  await seedProposal("bad-date");
  const record = await callable("manager", "recordProposalPrepaidCash");
  await assert.rejects(record({
    proposalId: "bad-date", amountCents: 96000, membershipAmountCents: 96000,
    paymentMethod: "cash", paymentDate: "2026-11-01",
    membershipStartDate: "2026-11-05", membershipPaidThroughDate: "2027-11-04",
    nextBillingDate: "2027-11-04", enrollmentFeeIncludedAthleteIndexes: [],
  }), /after the prepaid paid-through date/i);
  await assert.rejects(record({
    proposalId: "bad-date", amountCents: 96000, membershipAmountCents: 96000,
    paymentMethod: "cash", paymentDate: "2026-02-30",
    membershipStartDate: "2026-11-05", membershipPaidThroughDate: "2027-11-04",
    nextBillingDate: "2027-11-05", enrollmentFeeIncludedAthleteIndexes: [],
  }), /date is invalid/i);

  const setup = await callable("manager", "createProposalAutopaySetup");
  await assert.rejects(setup({ proposalId: "full-included" }), /not waiting for cash-prepaid Stripe autopay setup/i);
  const approve = await callable("manager", "approveProposalRenewalAutopay");
  await approve({ proposalId: "full-included", approved: true });
  const saved = (await db.doc("proposals/full-included").get()).data();
  assert.equal(saved.billingFollowUpStatus, "AUTOPAY_SETUP_REQUIRED");
  assert.equal(saved.renewalArrangement.approved, true);
  assert.equal(paidInFullUiState(saved).canSetupAutopay, true);
  assert.equal((await historyEvents("full-included")).filter((event) => event === "RENEWAL_AUTOPAY_APPROVED").length, 1);
  await assert.rejects(approve({ proposalId: "full-included", approved: true }));
});

test("duplicate prepaid payment is rejected without a second audit event", async () => {
  const record = await callable("manager", "recordProposalPrepaidCash");
  await assert.rejects(record({
    proposalId: "full-excluded", amountCents: 96000, membershipAmountCents: 96000,
    paymentMethod: "check", paymentDate: "2026-11-02",
    membershipStartDate: "2026-11-05", membershipPaidThroughDate: "2027-11-04",
    nextBillingDate: "2027-11-05", enrollmentFeeIncludedAthleteIndexes: [],
  }));
  assert.equal((await historyEvents("full-excluded")).filter((event) => event === "CASH_PREPAYMENT_RECORDED").length, 1);
});

test("Review & Confirm status, Intake, activation, and legacy prepaid safeguards survive", async () => {
  await seedProposal("not-accepted", { status: "DRAFT" });
  const record = await callable("manager", "recordProposalPrepaidCash");
  await assert.rejects(record({
    proposalId: "not-accepted", amountCents: 96000, membershipAmountCents: 96000,
    paymentMethod: "cash", paymentDate: "2026-11-01",
    membershipStartDate: "2026-11-05", membershipPaidThroughDate: "2027-11-04",
    nextBillingDate: "2027-11-05", enrollmentFeeIncludedAthleteIndexes: [],
  }));

  await db.doc("intakeTokens/full-token").set({
    proposalId: "full-excluded", source: "management_enrollment", mode: "new_athlete",
    locationId: "santa-ynez-valley", used: false, intakeAudience: "parent_guardian",
  });
  const deliver = await callable("manager", "recordManualEnrollmentIntakeDelivery");
  await deliver({ tokenId: "full-token", method: "in_person", note: "Synthetic E2E" });
  assert.equal((await db.doc("intakeTokens/full-token").get()).data().deliveryStatus, "SENT");

  await db.doc("intakes/intake-full").set({
    proposalId: "full-excluded", mode: "new_athlete", status: "submitted",
    locationId: "santa-ynez-valley", minted: false,
  });
  await db.doc("intakes/intake-full").update({
    status: "approved", minted: true, approvedUid: "athlete-full",
    approvedAt: FieldValue.serverTimestamp(),
  });
  await waitFor(async () => (await db.doc(
    "proposals/full-excluded/history/athlete_activated_intake-full_athlete-full"
  ).get()).exists, "cash-paid athlete activation audit");

  await seedProposal("legacy-prepaid", {
    status: "PAID", paymentStatus: "paid", paymentMethod: "cash_prepaid",
    paidAt: Timestamp.now(), cashPrepayment: { amountCents: 96000, monthsCovered: 12 },
  });
  await db.doc("intakeTokens/legacy-token").set({
    proposalId: "legacy-prepaid", source: "management_enrollment", mode: "new_athlete",
    locationId: "santa-ynez-valley", used: false,
  });
  await deliver({ tokenId: "legacy-token", method: "in_person", note: "Legacy compatibility" });
  assert.equal((await db.doc("intakeTokens/legacy-token").get()).data().deliveryStatus, "SENT");
});

test("isolated Hosting serves the Management Billing UI and its paid-in-full state module", async () => {
  const host = process.env.HOSTING_EMULATOR_HOST;
  assert.ok(host, "Hosting emulator host is provided");
  const [page, module] = await Promise.all([
    fetch(`http://${host}/management/billing/`),
    fetch(`http://${host}/management/billing/paid-in-full-state.js`),
  ]);
  assert.equal(page.status, 200);
  assert.equal(module.status, 200);
  assert.match(await module.text(), /RENEWAL_AUTOPAY_APPROVAL_REQUIRED/);
});
