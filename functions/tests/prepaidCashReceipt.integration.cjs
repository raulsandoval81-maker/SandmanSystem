// Emulator-only tests. No provider credentials, real parents, or Stripe.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("2C receipt tests require an isolated demo-* Firestore emulator.");
}
if (process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY) {
  throw new Error("2C receipt tests refuse Stripe or email provider credentials.");
}

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const emailModule = require("../lib/modules/email/resend");
const originalClient = emailModule.getResendClient;
const sendReceipt = require("../lib/billing/sendProposalPrepaidCashReceipt").sendProposalPrepaidCashReceipt;
const suffix = process.pid.toString().padStart(6, "0").slice(-6);
const idForOffset = (offset) => "P-" + String((Number(suffix) + offset) % 1000000).padStart(6, "0");
const id = idForOffset(0);
const manager = "2c-manager-" + suffix;
const outsider = "2c-outsider-" + suffix;
const recipient = "synthetic-receipt@example.test";
const call = (uid, proposalId = id, extra = {}) =>
  sendReceipt.run({auth: {uid, token: {}}, data: {proposalId, ...extra}});
const receiptRef = db.doc("proposals/" + id + "/delivery/cash_check_receipt");
const proposalRef = db.doc("proposals/" + id);
let emails = [];

function paidProposal(overrides = {}) {
  return {
    proposalId: id, locationId: "2c-location-" + suffix,
    status: "PAID", paymentStatus: "paid", paymentMethod: "cash_prepaid",
    paidAt: Timestamp.now(),
    lockedSnapshot: {prospect: {parentEmail: recipient}},
    cashPrepayment: {
      amountCents: 99000, membershipAmountCents: 96000,
      annualEnrollmentFee: {outstandingCents: 0, paidWithPrepaymentCents: 3000},
      paymentMethod: "check",
      paymentDate: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      membershipStartDate: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      membershipPaidThroughDate: Timestamp.fromDate(new Date("2027-10-31T12:00:00Z")),
      nextBillingDate: Timestamp.fromDate(new Date("2027-11-01T12:00:00Z")),
    },
    ...overrides,
  };
}

test.before(async () => {
  emailModule.getResendClient = () => ({
    emails: { send: async (payload) => {
      emails.push(payload);
      return {data: {id: "synthetic-email-" + emails.length}, error: null};
    }},
  });
  await db.doc("staff/" + manager).set({
    role: "management", status: "active", locationIds: ["2c-location-" + suffix]
  });
  await db.doc("staff/" + outsider).set({
    role: "management", status: "active", locationIds: ["other-location"]
  });
  await proposalRef.set(paidProposal());
});
test.after(async () => {
  emailModule.getResendClient = originalClient;
  await deleteApp(app);
});

test("2C receipt rejects staff from a different location", async () => {
  await assert.rejects(call(outsider), /location|permission/i);
  assert.equal(emails.length, 0);
});

test("2C receipt rejects an unverified cash/check payment", async () => {
  const unpaid = idForOffset(1);
  await db.doc("proposals/" + unpaid).set(paidProposal({proposalId: unpaid, status: "READY_FOR_CHECKOUT"}));
  await assert.rejects(call(manager, unpaid), /verified cash\/check/i);
  assert.equal(emails.length, 0);
});

test("2C sends a verified receipt exactly once and records an audit entry", async () => {
  const first = await call(manager);
  assert.equal(first.ok, true);
  assert.equal(first.alreadySent, false);
  assert.equal(first.recipient, recipient);
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /\$990\.00/);
  assert.match(emails[0].text, /\$960\.00/);
  assert.match(emails[0].text, /2027-10-31/);
  const recorded = (await receiptRef.get()).data();
  assert.equal(recorded.status, "SENT");
  assert.equal(recorded.providerId, "synthetic-email-1");
  const history = await proposalRef.collection("history").where("event", "==", "CASH_PREPAYMENT_RECEIPT_SENT").get();
  assert.equal(history.size, 1);
  const second = await call(manager);
  assert.equal(second.alreadySent, true);
  assert.equal(emails.length, 1);
  const proposal = (await proposalRef.get()).data();
  assert.equal(proposal.paymentMethod, "cash_prepaid");
  assert.equal(proposal.stripeCheckoutSessionId, undefined);
  assert.equal(proposal.stripeSubscriptionId, undefined);
});

test("2C fail-closes uncertain email outcomes and prevents duplicate sends", async () => {
  const uncertain = idForOffset(2);
  await db.doc("proposals/" + uncertain).set(paidProposal({proposalId: uncertain}));
  let attempts = 0;
  emailModule.getResendClient = () => ({
    emails: {send: async () => {attempts++; throw Error("synthetic unknown provider outcome");}}
  });
  await assert.rejects(call(manager, uncertain), /uncertain/i);
  await assert.rejects(call(manager, uncertain), /pending/i);
  assert.equal(attempts, 1);
  const saved = (await db.doc("proposals/" + uncertain + "/delivery/cash_check_receipt").get()).data();
  assert.equal(saved.status, "SENDING");
});

test("2C status is readable by authorized Management after an interrupted send", async () => {
  const state = await call(manager, idForOffset(2), {mode:"status"});
  assert.equal(state.status, "SENDING");
  await assert.rejects(call(outsider, idForOffset(2), {mode:"status"}), /location|permission/i);
});

test("2C uncertain delivery requires System Admin and provider evidence to resolve", async () => {
  const uncertain = idForOffset(2);
  await assert.rejects(call(manager, uncertain, {mode:"confirm_not_sent", evidence:"Provider confirmed no email was accepted", confirmation:"PROVIDER_CONFIRMED_NOT_ACCEPTED"}), /System Admin/i);
  await db.doc("staff/" + manager).update({role:"system_admin"});
  await assert.rejects(call(manager, uncertain, {mode:"confirm_not_sent", evidence:"short", confirmation:"PROVIDER_CONFIRMED_NOT_ACCEPTED"}), /evidence/i);
  const resolved = await call(manager, uncertain, {mode:"confirm_not_sent", evidence:"Synthetic provider API confirmed no accepted email for the original attempt", confirmation:"PROVIDER_CONFIRMED_NOT_ACCEPTED"});
  assert.equal(resolved.status, "FAILED");
  const status = await call(manager, uncertain, {mode:"status"});
  assert.equal(status.status, "FAILED");
  const evidenceAudit = await db.collection("proposals").doc(uncertain).collection("history").where("event","==","CASH_RECEIPT_PROVIDER_NON_ACCEPTANCE_VERIFIED").get();
  assert.equal(evidenceAudit.size, 1);
});

const sendIntake = require("../lib/enrollment/sendEnrollmentIntakeEmail").sendEnrollmentIntakeEmail;
async function withVerifiedStagingRuntime(callback) {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
    throw new Error("Verified staging runtime may be simulated only inside a demo-* Firestore emulator.");
  }
  const overrides = {
    GCLOUD_PROJECT: undefined,
    GCP_PROJECT: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    FIREBASE_CONFIG: JSON.stringify({projectId: "sandman-combat-staging"}),
    SANDMAN_STAGING_ACK: "sandman-combat-staging",
    SANDMAN_STAGING_PROJECT_ID: "sandman-combat-staging",
    STAGING_TEST_EMAIL_ALLOWLIST: recipient,
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const intakeCall = (proposalId, tokenId, data = {}) => withVerifiedStagingRuntime(() =>
  sendIntake.run({tokenId, recipientEmail:recipient, confirmRecipient:true, twoC:true, ...data}, {auth:{uid:manager,token:{}}}));

async function createTwoCIntake(proposalId, tokenId) {
  await db.doc("intakeTokens/" + tokenId).set({
    proposalId, locationId:"2c-location-" + suffix, source:"management_enrollment",
    mode:"new_athlete", intakeAudience:"parent_guardian", used:false,
    status:"invited", exp:Date.now() + 3600000,
    prefill:{email:recipient,athleteName:"Synthetic Athlete"}
  });
}

test("2C Intake cannot bypass the accepted receipt gate", async () => {
  const idNoReceipt = idForOffset(3);
  const token = "2c-no-receipt-" + suffix;
  await db.doc("proposals/" + idNoReceipt).set(paidProposal({proposalId:idNoReceipt}));
  await createTwoCIntake(idNoReceipt,token);
  await assert.rejects(intakeCall(idNoReceipt,token), /provider-accepted receipt/i);
});

test("2C Intake accepts one provider send, then safely reuses its delivery status", async () => {
  const token = "2c-sent-" + suffix;
  await createTwoCIntake(id,token);
  const intakeEmails = [];
  emailModule.getResendClient = () => ({emails:{send:async (payload) => {
    intakeEmails.push(payload);
    return {data:{id:"synthetic-intake-email-" + intakeEmails.length},error:null};
  }}});
  const first = await intakeCall(id,token);
  assert.equal(first.ok,true);
  assert.equal(intakeEmails.length,1);
  assert.match(intakeEmails[0].html,/https:\/\/sandman-combat-staging\.web\.app/);
  assert.doesNotMatch(intakeEmails[0].html,/https:\/\/sandmancombat\.com/);
  const stored = (await db.doc("intakeTokens/" + token).get()).data();
  assert.equal(stored.twoCEmailStatus,"SENT");
  assert.equal(stored.deliveryStatus,"SENT");
  assert.equal(stored.deliveredTo,recipient);
  const second = await intakeCall(id,token);
  assert.equal(second.ok,true);
  assert.equal(second.alreadySent,true);
  assert.equal(intakeEmails.length,1);
});

test("2C uncertain Intake provider response remains reserved and cannot resend", async () => {
  const token = "2c-unknown-" + suffix;
  await createTwoCIntake(id,token);
  let attempts=0;
  emailModule.getResendClient = () => ({emails:{send:async () => {
    attempts++;
    throw Error("synthetic provider network failure");
  }}});
  await assert.rejects(intakeCall(id,token), /uncertain/i);
  await assert.rejects(intakeCall(id,token), /outcome is uncertain/i);
  assert.equal(attempts,1);
  const saved = (await db.doc("intakeTokens/" + token).get()).data();
  assert.equal(saved.twoCEmailStatus,"SENDING");
});

test("2C uncertain Intake recovery requires System Admin evidence", async () => {
  const token = "2c-unknown-" + suffix;
  await assert.rejects(sendIntake.run({tokenId:token,twoCRecovery:true,resolution:"confirm_not_sent",evidence:"Provider confirmed no message accepted",confirmation:"PROVIDER_CONFIRMED_NOT_ACCEPTED"}, {auth:{uid:outsider,token:{}}}), /location|permission/i);
  await assert.rejects(sendIntake.run({tokenId:token,twoCRecovery:true,resolution:"confirm_not_sent",evidence:"short",confirmation:"PROVIDER_CONFIRMED_NOT_ACCEPTED"}, {auth:{uid:manager,token:{}}}), /evidence/i);
  const resolved = await sendIntake.run({tokenId:token,twoCRecovery:true,resolution:"confirm_not_sent",evidence:"Synthetic provider confirmed no acceptance for this Intake email attempt",confirmation:"PROVIDER_CONFIRMED_NOT_ACCEPTED"}, {auth:{uid:manager,token:{}}});
  assert.equal(resolved.status,"FAILED");
  assert.equal((await db.doc("intakeTokens/" + token).get()).data().twoCEmailStatus,"FAILED");
});
