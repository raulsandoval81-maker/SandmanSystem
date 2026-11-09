const { test } = require("node:test");
const assert = require("node:assert/strict");
const { canStartEarlyCashCheckIntake, issueEarlyCashCheckIntake } = require("../lib/enrollment/earlyCashCheckIntake");
const project = "sandman-combat-staging";
process.env.GCLOUD_PROJECT = project;
process.env.SANDMAN_STAGING_ACK = project;
process.env.SANDMAN_STAGING_PROJECT_ID = project;

const lockedSnapshot = { pricing: { paymentArrangement: "prepaid_cash_check" } };
const proposal = {
  status: "READY_FOR_CHECKOUT", locationId: "santa-ynez-valley", lockedSnapshot,
  prepaidReconciliation: { status: "AWAITING_FAMILY_CONFIRMATION" },
  clientAcceptance: { consentAccepted: true, signedAt: {}, signedSnapshot: lockedSnapshot, signerRole: "parent_guardian" },
  enrollmentConfirmation: { termsConfirmed: true, confirmedAt: {} },
};

test("only the staging, signed, separately acknowledged, unreconciled 2C route is eligible", () => {
  assert.equal(canStartEarlyCashCheckIntake(proposal), true);
  for (const changes of [
    { enrollmentConfirmation: { termsConfirmed: true } },
    { clientAcceptance: { ...proposal.clientAcceptance, signedSnapshot: {} } },
    { lockedSnapshot: { pricing: { paymentArrangement: "prepaid_stripe" } } },
    { stripeCheckoutSessionId: "cs_test_any" },
    { status: "PAID" },
  ]) assert.equal(canStartEarlyCashCheckIntake({ ...proposal, ...changes }), false);
  process.env.GCLOUD_PROJECT = "sandmandashboard";
  assert.equal(canStartEarlyCashCheckIntake(proposal), false);
  process.env.GCLOUD_PROJECT = project;
});

test("existing secure token is reused, session bound, and completed Intake does not reissue", async () => {
  const docs = new Map();
  const firestore = { doc: path => path };
  const ref = { id: "P-000003", firestore };
  const current = { ...proposal };
  const tx = {
    get: async ref => ({ ref, exists: docs.has(ref), data: () => docs.get(ref) }),
    create: (ref, data) => { assert.equal(docs.has(ref), false); docs.set(ref, data); },
    update: (target, data) => { assert.equal(target, ref); Object.assign(current, data); },
  };
  await assert.rejects(issueEarlyCashCheckIntake(tx, ref, current), { code: "unauthenticated" });
  const first = await issueEarlyCashCheckIntake(tx, ref, current, "guardian");
  assert.match(first.intakePath, /^\/intake-parent\/\?invite=[a-f0-9]{32}$/);
  assert.deepEqual(await issueEarlyCashCheckIntake(tx, ref, current, "guardian"), first);
  await assert.rejects(issueEarlyCashCheckIntake(tx, ref, current, "unrelated"), { code: "permission-denied" });
  docs.set(`intakes/${current.earlyCashCheckIntakeTokenId}`, {
    proposalId: ref.id, status: "submitted", ownerUid: "guardian",
  });
  assert.deepEqual(await issueEarlyCashCheckIntake(tx, ref, current, "guardian"), { intakeComplete: true });
  assert.equal(current.status, "READY_FOR_CHECKOUT");
  assert.equal(current.cashPrepayment, undefined);
});
