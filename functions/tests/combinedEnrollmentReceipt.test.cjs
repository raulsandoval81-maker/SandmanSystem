const {test} = require("node:test");
const assert = require("node:assert/strict");
const {cashReceiptDetails, stripeReceiptDetails, sendCombinedEnrollmentReceipt, finishCombinedDelivery} =
  require("../lib/enrollment/combinedEnrollmentReceipt");

const proposalId = "P-000901";
const tokenId = "synthetic";
const recipient = "fixture@example.test";
const cash = {status: "PAID", paymentStatus: "paid", paymentMethod: "cash_prepaid", paidAt: 1,
  locationId: "synthetic", cashPrepayment: {
    amountCents: 99000, membershipAmountCents: 96000, paymentMethod: "check",
    annualEnrollmentFee: {paidWithPrepaymentCents: 3000, outstandingCents: 0},
    paymentDate: "2026-11-08", membershipStartDate: "2026-12-01",
    membershipPaidThroughDate: "2027-11-30", nextBillingDate: "2027-12-01",
  }};
const stripe = {status: "PAID", paymentStatus: "paid", paidAt: 1, locationId: "synthetic",
  stripeCheckoutSessionId: "cs_test_verified", stripePaymentIntentId: "pi_verified", stripeLivemode: false};
const session = {id: "cs_test_verified", metadata: {proposalId}, payment_intent: "pi_verified",
  payment_status: "paid", livemode: false, amount_total: 11000, currency: "usd"};

function fixture(proposal, overrides = {}) {
  const proposalPath = `proposals/${proposalId}`;
  const tokenPath = `intakeTokens/${tokenId}`;
  const receiptPath = proposalPath + "/delivery/" +
    (proposal.paymentMethod === "cash_prepaid" ? "cash_check_receipt" : "stripe_enrollment_receipt");
  const token = {proposalId, locationId: proposal.locationId, source: "management_enrollment",
    intakeAudience: "parent_guardian", exp: Date.now() + 100000, prefill: {email: recipient}, ...overrides};
  const state = new Map([[proposalPath, proposal], [tokenPath, token]]);
  let id = 0, chain = Promise.resolve();
  const ref = path => ({path, id: path.split("/").pop(), collection: name => ({
    doc: (key = String(++id)) => ref(path + "/" + name + "/" + key),
  })});
  const db = {doc: ref, collection: () => ({where: () => ({tokenQuery: true})}), runTransaction(callback) {
    const run = chain.then(async () => {
      const writes = [];
      const stage = (doc, value) => writes.push([doc.path, value]);
      const result = await callback({
        get: async doc => doc.tokenQuery ? {docs: [...state].filter(([path]) => path.startsWith("intakeTokens/"))
          .map(([path, data]) => ({id: path.split("/").pop(), data: () => data}))} : ({exists: state.has(doc.path), data: () => state.get(doc.path)}),
        set: stage, update: stage, create: stage,
      });
      for (const [path, data] of writes) state.set(path, {...state.get(path), ...data});
      return result;
    });
    chain = run.catch(() => {});
    return run;
  }};
  let calls = 0;
  const input = {db, proposalId, tokenId, recipient, uid: "synthetic-staff", proposal, token,
    payment: proposal.paymentMethod === "cash_prepaid" ? cashReceiptDetails(proposal) : stripeReceiptDetails(proposal, session, proposalId),
    url: "https://example.test/intake-parent/?invite=synthetic",
    send: async (lines, url) => { calls++; assert.match(lines[1], /Received:/); assert.equal(url, input.url); return {providerId: "accepted"}; }};
  return {input, state, tokenPath, receiptPath, calls: () => calls};
}

test("Cash/Check and verified Stripe each send once and record separate correlated audits", async () => {
  Object.assign(process.env, {GCLOUD_PROJECT: "sandman-combat-staging",
    SANDMAN_STAGING_ACK: "sandman-combat-staging", SANDMAN_STAGING_PROJECT_ID: "sandman-combat-staging"});
  for (const proposal of [cash, stripe]) {
    const f = fixture(proposal);
    await sendCombinedEnrollmentReceipt(f.input);
    assert.equal((await sendCombinedEnrollmentReceipt(f.input)).alreadySent, true);
    assert.equal(f.calls(), 1);
    assert.equal(f.state.get(f.receiptPath).providerId, "accepted");
    assert.equal(f.state.get(f.tokenPath).resendEmailId, "accepted");
    assert.equal([...f.state.keys()].filter(path => path.includes("/history/")).length, 2);
  }
  assert.throws(() => stripeReceiptDetails(stripe, {...session, payment_status: "unpaid"}, proposalId));
  assert.throws(() => stripeReceiptDetails(stripe, {...session, metadata: {proposalId: "P-000999"}}, proposalId));
  assert.throws(() => cashReceiptDetails({...cash, stripeSubscriptionId: "sub_other"}));
});

test("ambiguous provider outcome blocks retries and can be reconciled atomically", async () => {
  const f = fixture(cash);
  f.input.send = async () => ({});
  await assert.rejects(sendCombinedEnrollmentReceipt(f.input), /uncertain/);
  await assert.rejects(sendCombinedEnrollmentReceipt(f.input), /uncertain/);
  const receipt = f.state.get(f.receiptPath);
  assert.equal(receipt.status, "SENDING");
  assert.equal(f.state.get(f.tokenPath).twoCEmailStatus, "SENDING");
  await finishCombinedDelivery({...f.input, receiptRef: f.input.db.doc(f.receiptPath),
    attempt: receipt.combinedAttempt, accepted: true, providerId: "provider-evidence", evidence: "Verified acceptance in provider history"});
  assert.equal(f.state.get(f.receiptPath).status, "SENT");
  assert.equal(f.state.get(f.tokenPath).deliveryStatus, "SENT");
});

test("concurrent attempts, expired tokens, mismatched recipient and existing receipts fail closed", async () => {
  const f = fixture(cash);
  const outcomes = await Promise.allSettled([sendCombinedEnrollmentReceipt(f.input), sendCombinedEnrollmentReceipt(f.input)]);
  assert.equal(f.calls(), 1);
  assert.equal(outcomes.some(result => result.status === "rejected"), true);
  for (const overrides of [{exp: Date.now() - 1}, {used: true}, {prefill: {email: "different@example.test"}}]) {
    const invalid = fixture(cash, overrides);
    await assert.rejects(sendCombinedEnrollmentReceipt(invalid.input));
    assert.equal(invalid.calls(), 0);
  }
  const prior = fixture(cash);
  prior.state.set("intakeTokens/prior", {deliveryStatus: "SENT"});
  await assert.rejects(sendCombinedEnrollmentReceipt(prior.input), /Another Intake token/);
  assert.equal(prior.calls(), 0);
  const legacy = fixture(cash);
  legacy.state.set(legacy.receiptPath, {status: "SENT", recipient});
  await assert.rejects(sendCombinedEnrollmentReceipt(legacy.input), /delivery already exists/);
  assert.equal(legacy.calls(), 0);
});

test("definite provider rejection allows retry but failed finalization keeps the lock", async () => {
  const f = fixture(cash);
  const accept = f.input.send;
  f.input.send = async () => ({rejected: true});
  await assert.rejects(sendCombinedEnrollmentReceipt(f.input), /rejected/);
  assert.equal(f.state.get(f.receiptPath).status, "FAILED");
  assert.equal(f.state.get(f.tokenPath).twoCEmailStatus, "FAILED");
  const transact = f.input.db.runTransaction;
  f.input.send = async (...args) => {
    const result = await accept(...args);
    f.input.db.runTransaction = async () => { throw new Error("write failed"); };
    return result;
  };
  await assert.rejects(sendCombinedEnrollmentReceipt(f.input), /write failed/);
  f.input.db.runTransaction = transact;
  await assert.rejects(sendCombinedEnrollmentReceipt(f.input), /uncertain/);
  assert.equal(f.calls(), 1);
  assert.equal(f.state.get(f.receiptPath).status, "SENDING");
});
