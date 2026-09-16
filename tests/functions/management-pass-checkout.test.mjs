import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { runManagementPassCheckout } = require(`${buildRoot}/modules/management/createManagementPassCheckout.js`);

const baseMessage = {
  topic: "request-pass",
  locationId: "santa-ynez-valley",
  passType: "combat-dropin-1day",
  email: "payer@example.com",
  assignedManagerUid: null,
  assignmentStatus: "PENDING_MANAGEMENT",
  status: "NEW",
  passAttendanceConfirmedAt: { seconds: 1 },
};
const manager = { uid: "manager-1", role: "management", staff: { locationIds: ["santa-ynez-valley"] } };
const input = { authUid: "manager-1", messageId: "message-1", publicBaseUrl: "https://www.sandmancombat.com" };

function harness(overrides = {}) {
  const calls = { created: [], saved: [], prices: [] };
  const message = { ...baseMessage, ...overrides.message };
  const deps = {
    loadActor: async () => overrides.actor || manager,
    loadMessage: async () => message,
    listPrices: async (lookupKey) => {
      calls.prices.push(lookupKey);
      return overrides.prices || [{
        id: "price_pass", active: true, lookup_key: lookupKey,
        unit_amount: 2500, currency: "usd", type: "one_time", recurring: null,
      }];
    },
    retrieveSession: async () => ({ id: "cs_existing", status: "open", url: "https://checkout.stripe.test/existing" }),
    createSession: async (params, idempotencyKey) => {
      calls.created.push({ params, idempotencyKey });
      return { id: "cs_new", url: "https://checkout.stripe.test/new" };
    },
    savePending: async (value) => { calls.saved.push(value); },
    ...overrides.deps,
  };
  return { calls, deps };
}

test("unauthenticated and inactive staff cannot start checkout", async () => {
  const { calls, deps } = harness();
  await assert.rejects(runManagementPassCheckout({ ...input, authUid: undefined }, deps), /authentication required/i);
  const inactive = harness({ deps: { loadActor: async () => { throw new Error("Active Management or Admin access required."); } } });
  await assert.rejects(runManagementPassCheckout(input, inactive.deps), /active management/i);
  assert.equal(calls.created.length + inactive.calls.created.length, 0);
});

test("Management is limited by stored location and queue assignment", async () => {
  const wrong = harness({ message: { locationId: "lompoc" } });
  await assert.rejects(runManagementPassCheckout(input, wrong.deps), /authorized scope/i);
  const assignedElsewhere = harness({ message: { assignedManagerUid: "manager-2" } });
  await assert.rejects(runManagementPassCheckout(input, assignedElsewhere.deps), /outside your Management queue/i);
  const missingLocation = harness({ message: { locationId: "" } });
  await assert.rejects(runManagementPassCheckout(input, missingLocation.deps), /valid location/i);
  assert.equal(wrong.calls.created.length + assignedElsewhere.calls.created.length + missingLocation.calls.created.length, 0);
});

test("authorized Management creates one correctly priced one-unit Checkout", async () => {
  const { calls, deps } = harness();
  const result = await runManagementPassCheckout(input, deps);
  assert.deepEqual(result, {
    checkoutUrl: "https://checkout.stripe.test/new", checkoutSessionId: "cs_new",
    paymentStatus: "pending", amountCents: 2500, currency: "usd",
  });
  assert.deepEqual(calls.prices, ["sandman_academy-2026-v3_combat_dropin_1day"]);
  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].idempotencyKey, "management-pass-message-1");
  assert.deepEqual(calls.created[0].params.line_items, [{ price: "price_pass", quantity: 1 }]);
  assert.equal(calls.created[0].params.metadata.paymentFlow, "management_pass");
  assert.equal(calls.created[0].params.metadata.locationId, "santa-ynez-valley");
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.saved[0].amountCents, 2500);
  assert.equal(calls.saved[0].confirmedPayerEmail, "payer@example.com");
});

test("Admin has explicit system-wide authority without location assignment", async () => {
  const { calls, deps } = harness({
    actor: { uid: "admin-1", role: "admin", staff: { locationIds: [] } },
    message: { locationId: "lompoc", assignedManagerUid: "someone-else" },
  });
  const result = await runManagementPassCheckout(input, deps);
  assert.equal(result.paymentStatus, "pending");
  assert.equal(calls.created[0].params.metadata.locationId, "lompoc");
});

test("unsupported pass, missing stored payer, paid or closed message fail before Stripe", async () => {
  for (const [change, reason] of [
    [{ passType: "unknown" }, /unsupported pass/i],
    [{ email: "" }, /confirm the payer email/i],
    [{ passPaymentStatus: "paid" }, /already been paid/i],
    [{ status: "CLOSED" }, /closed message/i],
  ]) {
    const { calls, deps } = harness({ message: change });
    await assert.rejects(runManagementPassCheckout(input, deps), reason);
    assert.equal(calls.created.length, 0);
  }
});

test("checkout requires server-recorded attendance before creation or retrieval", async () => {
  const missing = harness({ message: { passAttendanceConfirmedAt: null } });
  await assert.rejects(runManagementPassCheckout(input, missing.deps), /confirm attendance/i);
  assert.equal(missing.calls.created.length, 0);
  assert.equal(missing.calls.prices.length, 0);

  const existing = harness({ message: {
    passAttendanceConfirmedAt: null,
    stripeCheckoutSessionId: "cs_existing",
    passPriceLookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
    passPayerEmail: "payer@example.com",
    passPaymentStatus: "pending",
  } });
  await assert.rejects(runManagementPassCheckout(input, existing.deps), /confirm attendance/i);
  assert.equal(existing.calls.created.length, 0);

  const attended = harness();
  const result = await runManagementPassCheckout(input, attended.deps);
  assert.equal(result.paymentStatus, "pending");
  assert.equal(attended.calls.created.length, 1);
});

test("client-supplied payer override is ignored; stored message email owns checkout", async () => {
  const { calls, deps } = harness();
  await runManagementPassCheckout({ ...input, payerEmail: "other@example.com" }, deps);
  assert.equal(calls.created[0].params.customer_email, "payer@example.com");
  assert.equal(calls.saved[0].confirmedPayerEmail, "payer@example.com");
});

test("Stripe price mismatch or duplicate active prices fail closed", async () => {
  for (const prices of [
    [],
    [{ id: "wrong", active: true, lookup_key: "wrong", unit_amount: 2500, currency: "usd", type: "one_time" }],
    [{ id: "wrong", active: true, lookup_key: "sandman_academy-2026-v3_combat_dropin_1day", unit_amount: 2600, currency: "usd", type: "one_time" }],
  ]) {
    const { calls, deps } = harness({ prices });
    await assert.rejects(runManagementPassCheckout(input, deps), /price|catalog/i);
    assert.equal(calls.created.length, 0);
  }
});

test("all three stored pass types resolve to their exact catalog amount", async () => {
  for (const [passType, suffix, amountCents] of [
    ["combat-dropin-1day", "combat_dropin_1day", 2500],
    ["combat-dropin-2day", "combat_dropin_2day", 4000],
    ["fitness-dropin", "fitness_dropin", 1500],
  ]) {
    const lookupKey = `sandman_academy-2026-v3_${suffix}`;
    const { calls, deps } = harness({
      message: { passType },
      prices: [{ id: `price_${suffix}`, active: true, lookup_key: lookupKey,
        unit_amount: amountCents, currency: "usd", type: "one_time", recurring: null }],
    });
    const result = await runManagementPassCheckout(input, deps);
    assert.equal(result.amountCents, amountCents);
    assert.deepEqual(calls.prices, [lookupKey]);
    assert.equal(calls.created[0].params.metadata.passType, passType);
  }
});

test("repeat call reuses the linked open session without creating another", async () => {
  const { calls, deps } = harness({ message: {
    stripeCheckoutSessionId: "cs_existing",
    passPriceLookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
    passPayerEmail: "payer@example.com",
    passPaymentStatus: "pending",
  } });
  const result = await runManagementPassCheckout(input, deps);
  assert.equal(result.checkoutSessionId, "cs_existing");
  assert.equal(calls.created.length, 0);
  assert.equal(calls.saved.length, 0);
});

test("callable is exported and server-owned linkage is transactionally rechecked", () => {
  const index = readFileSync(new URL("../../functions/src/index.ts", import.meta.url), "utf8");
  const source = readFileSync(new URL("../../functions/src/modules/management/createManagementPassCheckout.ts", import.meta.url), "utf8");
  assert.match(index, /export \{ createManagementPassCheckout \}/);
  assert.match(source, /db\.runTransaction/);
  assert.match(source, /assertPassCheckoutRequest\(current, actor, confirmedPayerEmail\)/);
  assert.match(source, /passPaymentStatus: "pending"/);
  assert.doesNotMatch(source, /passPaymentStatus: "paid"/);
});
