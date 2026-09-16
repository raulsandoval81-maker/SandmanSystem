import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { runConfirmManagementPassAttendance } = require(`${buildRoot}/modules/management/confirmManagementPassAttendance.js`);
const { assertManagementPassMessage } = require(`${buildRoot}/modules/management/managementPassCheckoutPolicy.js`);
const { assertPassReadyToClose, passIntelligenceSummary } = require(`${buildRoot}/modules/management/managementPassClosePolicy.js`);

const manager = { uid: "manager-1", role: "management", staff: { locationIds: ["santa-ynez-valley"] } };
const admin = { uid: "admin-1", role: "admin", staff: { locationIds: [] } };
const message = {
  topic: "request-pass", passType: "combat-dropin-1day", locationId: "santa-ynez-valley",
  assignmentStatus: "PENDING_MANAGEMENT", status: "REVIEWING",
};
const input = { authUid: "manager-1", messageId: "message-1" };

function harness(overrides = {}) {
  const current = { ...message, ...overrides.message };
  const calls = { writes: 0 };
  const deps = {
    loadActor: async () => overrides.actor || manager,
    confirm: async (_messageId, actor) => {
      assertManagementPassMessage(current, actor);
      if (current.passAttendanceConfirmedAt) return true;
      current.passAttendanceConfirmedAt = { seconds: 1 };
      current.passAttendanceConfirmedBy = actor.uid;
      calls.writes++;
      return false;
    },
    ...overrides.deps,
  };
  return { calls, current, deps };
}

test("authorized location Management confirms attendance once; repeat is idempotent", async () => {
  const { calls, current, deps } = harness();
  assert.deepEqual(await runConfirmManagementPassAttendance(input, deps), {
    ok: true, messageId: "message-1", alreadyConfirmed: false,
  });
  assert.equal(current.passAttendanceConfirmedBy, "manager-1");
  assert.equal((await runConfirmManagementPassAttendance(input, deps)).alreadyConfirmed, true);
  assert.equal(calls.writes, 1);
});

test("wrong location, stale assignment, missing ownership, unsupported pass, and CLOSED fail without a write", async () => {
  for (const change of [
    { locationId: "lompoc" }, { locationId: "" },
    { assignedManagerUid: "other-manager" }, { passType: "unknown" }, { status: "CLOSED" },
  ]) {
    const { calls, deps } = harness({ message: change });
    await assert.rejects(runConfirmManagementPassAttendance(input, deps));
    assert.equal(calls.writes, 0);
  }
});

test("Admin can confirm across locations without fabricated scope", async () => {
  const { calls, current, deps } = harness({ actor: admin, message: { locationId: "lompoc" } });
  await runConfirmManagementPassAttendance({ ...input, authUid: admin.uid }, deps);
  assert.equal(current.passAttendanceConfirmedBy, admin.uid);
  assert.equal(calls.writes, 1);
});

test("unauthenticated and inactive staff are rejected before attendance writes", async () => {
  const { calls, deps } = harness();
  await assert.rejects(runConfirmManagementPassAttendance({ ...input, authUid: undefined }, deps), /authentication/i);
  const inactive = harness({ deps: { loadActor: async () => { throw new Error("Active Management or Admin access required."); } } });
  await assert.rejects(runConfirmManagementPassAttendance(input, inactive.deps), /active management/i);
  assert.equal(calls.writes + inactive.calls.writes, 0);
});

test("only paid and attended passes may close; non-pass closure remains unrestricted", () => {
  const paid = {
    ...message, passAttendanceConfirmedAt: { seconds: 10 },
    passAttendanceConfirmedBy: "manager-1", passPaymentStatus: "paid",
    stripePaymentIntentId: "pi_pass_1", passAmountCents: 2500,
    passCurrency: "usd", passPaidAt: { seconds: 20 },
    stripeCheckoutSessionId: "cs_pass_1", stripeReceiptUrl: "https://pay.stripe.com/r/example",
  };
  assert.doesNotThrow(() => assertPassReadyToClose(paid));
  assert.deepEqual(passIntelligenceSummary(paid), {
    passAttendanceConfirmedAt: paid.passAttendanceConfirmedAt,
    passAttendanceConfirmedBy: "manager-1", passPaymentStatus: "paid",
    passAmountCents: 2500, passCurrency: "usd", passPaidAt: paid.passPaidAt,
    stripeCheckoutSessionId: "cs_pass_1", stripePaymentIntentId: "pi_pass_1",
    stripeReceiptUrl: paid.stripeReceiptUrl,
  });
  for (const change of [
    { passAttendanceConfirmedAt: null },
    { passPaymentStatus: "pending" },
    { stripePaymentIntentId: "" },
  ]) assert.throws(() => assertPassReadyToClose({ ...paid, ...change }), /confirm attendance.*verified payment/i);
  assert.doesNotThrow(() => assertPassReadyToClose({ topic: "general" }));
  assert.deepEqual(passIntelligenceSummary({ topic: "general" }), {});
});

test("close transaction validates the fresh pass before either write", () => {
  const source = readFileSync(new URL("../../functions/src/modules/management/storeClosedMessageIntelligence.ts", import.meta.url), "utf8");
  const read = source.indexOf("const currentSnap = await tx.get(messageRef)");
  const guard = source.indexOf("assertPassReadyToClose(current)");
  const intelligenceWrite = source.indexOf("tx.set(", guard);
  const messageWrite = source.indexOf("tx.update(", intelligenceWrite);
  assert.ok(read >= 0 && read < guard && guard < intelligenceWrite && intelligenceWrite < messageWrite);
  assert.match(source, /\.\.\.passIntelligenceSummary\(snapshotMessage\)/);
  const index = readFileSync(new URL("../../functions/src/index.ts", import.meta.url), "utf8");
  assert.match(index, /export \{ confirmManagementPassAttendance \}/);
});
