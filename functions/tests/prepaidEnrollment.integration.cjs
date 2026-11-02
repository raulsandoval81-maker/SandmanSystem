// End-to-end prepaid acceptance gate. Emulator ONLY; never use production.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("Refusing to run prepaid acceptance outside isolated demo-* emulators.");
}
if (process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY) {
  throw new Error("Prepaid acceptance must not receive production Stripe or email credentials.");
}

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const { hashProposalReviewToken } = require("../lib/proposals/proposalClientReview");
const prepaid = require("../lib/billing/recordProposalPrepaidCash").recordProposalPrepaidCash;
const confirm = require("../lib/proposals/saveProposalEnrollmentAgreement").saveProposalEnrollmentAgreement;
const approveRenewal = require("../lib/billing/approveProposalRenewalAutopay").approveProposalRenewalAutopay;
const activate = require("../lib/approveAndActivate").approveAndActivate;

const suffix = `${process.pid}`;
const locationId = `prepaid-location-${suffix}`;
const manager = `prepaid-manager-${suffix}`;
const outsider = `prepaid-outsider-${suffix}`;
const proposalId = `P-PREPAID-${suffix}`;
const excludedId = `${proposalId}-EXCLUDED`;
const partialId = `${proposalId}-PARTIAL`;
const token = `enrollment-token-${suffix}`;
const snapshot = {
  prospect: { familyName: "Synthetic Prepaid Family", appointmentId: null },
  athletes: [{
    name: "Synthetic Athlete", plan: "standard", billingTerm: "annual",
    enrollmentType: "youth", disciplines: ["wrestling"],
  }],
  pricing: {
    monthlyBalance: 80, enrollmentBase: 30,
    membershipStartDate: "2026-10-05", dueNow: 110,
  },
};

const acceptedProposal = (id, overrides = {}) => ({
  proposalId: id,
  locationId,
  status: "READY_FOR_CHECKOUT",
  pricing: snapshot.pricing,
  agreement: { membershipStartDate: "2026-10-05" },
  athletes: snapshot.athletes,
  lockedSnapshot: snapshot,
  clientAcceptance: {
    signerName: "Synthetic Guardian",
    consentAccepted: true,
    signedAt: Timestamp.now(),
    signedSnapshot: snapshot,
  },
  enrollmentHandoff: {
    tokenHash: hashProposalReviewToken(token),
    expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
  },
  ...overrides,
});

const invoke = (callable, uid, data) => callable.run({ auth: { uid, token: {} }, data });
const payment = (id, overrides = {}) => ({
  proposalId: id,
  mode: "record",
  amountCents: 99000,
  membershipAmountCents: 96000,
  paymentMethod: "check",
  paymentDate: "2026-10-01",
  membershipStartDate: "2026-10-05",
  membershipPaidThroughDate: "2027-10-04",
  nextBillingDate: "2027-10-05",
  enrollmentFeeIncludedAthleteIndexes: [1],
  enrollmentFeeAllocations: [{ athleteIndex: 1, amountCents: 3000 }],
  ...overrides,
});
const activationPayload = (intakeId) => ({
  intakeId, mode: "new_athlete", foundry: "f8",
  virtueName: "Courage", virtueCode: "CRG", trackCode: "Z2H-WR",
  fullName: "Synthetic Athlete", publicName: "S. Athlete", dob: "2012-04-15",
  framework: "foundry8", programTrack: "zero2hero", art: "wrestling",
  ladderKey: "F8", mint: { lane: "CB" },
  team: { name: "Synthetic Team", city: "Test", state: "CA" },
  parent: {},
});

test.before(async () => {
  await Promise.all([
    db.doc(`staff/${manager}`).set({
      role: "management", status: "active", fullName: "Synthetic Manager",
      locationIds: [locationId],
    }),
    db.doc(`staff/${outsider}`).set({
      role: "management", status: "active", fullName: "Outside Manager",
      locationIds: ["another-location"],
    }),
    db.doc(`proposals/${proposalId}`).set(acceptedProposal(proposalId)),
    db.doc(`proposals/${excludedId}`).set(acceptedProposal(excludedId)),
    db.doc(`proposals/${partialId}`).set(acceptedProposal(partialId, {
      priorPayments: [{
        paymentId: "enrollment-only", amountCents: 1000,
        membershipAmountCents: 0, enrollmentFeeAmountCents: 1000,
        unappliedMembershipAmountCents: 0,
        membershipPeriodAllocations: [], periods: [],
      }],
    })),
  ]);
});

test.after(async () => deleteApp(app));

test("wrong-location Management cannot prepare prepaid reconciliation", async () => {
  await assert.rejects(
    invoke(prepaid, outsider, { proposalId, mode: "prepare" }),
    (error) => error.code === "permission-denied"
  );
});

test("accepted locked proposal prepares an auditable prepaid family route", async () => {
  const result = await invoke(prepaid, manager, { proposalId, mode: "prepare" });
  assert.equal(result.status, "AWAITING_FAMILY_CONFIRMATION");
  const saved = (await db.doc(`proposals/${proposalId}`).get()).data();
  assert.equal(saved.prepaidReconciliation.route, "management_prepaid_reconciliation");
  assert.equal(saved.cashPrepayment, undefined);
  assert.equal(saved.pendingCheckoutSessionId, undefined);
});

test("recording is blocked until the family completes Review & Confirm", async () => {
  await assert.rejects(
    invoke(prepaid, manager, payment(proposalId)),
    /Review & Confirm/
  );
  const result = await invoke(confirm, manager, {
    proposalId, enrollmentToken: token,
    confirmation: { termsConfirmed: true },
  });
  assert.equal(result.enrollment.status, "AWAITING_MANAGEMENT_RECONCILIATION");
  assert.equal(result.enrollment.paymentRoute, "management_prepaid_reconciliation");
});

test("full-year check with annual fee included records exactly once without Stripe", async () => {
  const result = await invoke(prepaid, manager, payment(proposalId));
  assert.equal(result.status, "PAID");
  assert.equal(result.paymentMethod, "check");
  assert.equal(result.annualEnrollmentFee.outstandingCents, 0);
  const saved = (await db.doc(`proposals/${proposalId}`).get()).data();
  assert.equal(saved.cashPrepayment.paymentMethod, "check");
  assert.equal(saved.cashPrepayment.monthsCovered, 12);
  assert.equal(saved.stripeCheckoutSessionId, undefined);
  assert.equal(saved.stripeSubscriptionId, undefined);
  await assert.rejects(invoke(prepaid, manager, payment(proposalId)), /already been recorded/);
});

test("annual fee may remain fully outstanding", async () => {
  await invoke(prepaid, manager, { proposalId: excludedId, mode: "prepare" });
  await invoke(confirm, manager, {
    proposalId: excludedId, enrollmentToken: token,
    confirmation: { termsConfirmed: true },
  });
  const result = await invoke(prepaid, manager, payment(excludedId, {
    amountCents: 96000,
    enrollmentFeeIncludedAthleteIndexes: [],
    enrollmentFeeAllocations: [],
  }));
  assert.equal(result.annualEnrollmentFee.outstandingCents, 3000);
});

test("historical enrollment attribution and partial new fee allocation remain auditable", async () => {
  await invoke(prepaid, manager, { proposalId: partialId, mode: "prepare" });
  await invoke(confirm, manager, {
    proposalId: partialId, enrollmentToken: token,
    confirmation: { termsConfirmed: true },
  });
  const result = await invoke(prepaid, manager, payment(partialId, {
    amountCents: 97000,
    enrollmentFeeAllocations: [{ athleteIndex: 1, amountCents: 1000 }],
  }));
  assert.equal(result.annualEnrollmentFee.previouslyPaidCents, 1000);
  assert.equal(result.annualEnrollmentFee.paidWithPrepaymentCents, 1000);
  assert.equal(result.annualEnrollmentFee.outstandingCents, 1000);
});

test("renewal autopay is blocked before payment and requires separate approval afterward", async () => {
  const unrecordedId = `${proposalId}-UNRECORDED`;
  await db.doc(`proposals/${unrecordedId}`).set(acceptedProposal(unrecordedId));
  await assert.rejects(
    invoke(approveRenewal, manager, { proposalId: unrecordedId, approved: true }),
    /complete twelve-month prepaid membership/
  );
  const result = await invoke(approveRenewal, manager, { proposalId, approved: true });
  assert.equal(result.billingFollowUpStatus, "AUTOPAY_SETUP_REQUIRED");
  assert.equal((await db.doc(`proposals/${proposalId}`).get()).get("stripeSubscriptionId"), undefined);
});

test("paid prepaid proposal reaches Intake and real activation callable", async () => {
  const intakeId = `prepaid-intake-${suffix}`;
  await db.doc("counters/f8").set({ next: 1 });
  await db.doc(`intakes/${intakeId}`).set({
    status: "submitted", mode: "new_athlete", proposalId, locationId,
    intakeAudience: "parent_guardian", dob: "2012-04-15",
    athlete: { name: "Synthetic Athlete", dob: "2012-04-15" },
    waiver: {
      agreed: true, signatureName: "Synthetic Guardian", signatureDate: "2026-11-02",
      signerType: "parent_guardian", signingAuthority: "guardian_for_athlete",
    },
    emergency: { name: "Synthetic Guardian", phoneDigits: "8055550100" },
    medical: "None",
  });
  const result = await invoke(activate, manager, activationPayload(intakeId));
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, false);
  assert.equal((await db.doc(`athletes/${result.uid}`).get()).exists, true);
  const intake = (await db.doc(`intakes/${intakeId}`).get()).data();
  assert.equal(intake.status, "approved");
  assert.equal(intake.approvedUid, result.uid);
});

test("a second activation is rejected and does not create a duplicate athlete", async () => {
  const intakeId = `prepaid-intake-${suffix}`;
  const intake = (await db.doc(`intakes/${intakeId}`).get()).data();
  assert.ok(intake.approvedUid);
  await assert.rejects(
    invoke(activate, manager, activationPayload(intakeId)),
    /Submission not approvable: approved/
  );
  assert.equal((await db.doc("counters/f8").get()).get("next"), 2);
  const cashHistory = await db.doc(`proposals/${proposalId}`).collection("history")
    .where("event", "==", "CASH_PREPAYMENT_RECORDED").get();
  assert.equal(cashHistory.size, 1);
  const activationReceipts = await db.collection("receipts")
    .where("intakeId", "==", intakeId).get();
  assert.equal(activationReceipts.size, 1);
  assert.equal(activationReceipts.docs[0].get("type"), "MINT_ACTIVATE");
});
