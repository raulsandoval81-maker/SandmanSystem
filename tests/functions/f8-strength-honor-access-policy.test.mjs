import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  F8_REMOTE_ACCESS_GATEWAY,
  hasReachedF8RemoteAccessGateway,
  resolveF8RemoteAccess,
} from "../../functions/lib/policy/f8StrengthHonorAccessPolicy.js";

const browserPolicySource = readFileSync(
  "public/assets/js/f8-strength-honor-access.js",
  "utf8"
);
const browserPolicy = await import(
  `data:text/javascript;base64,${Buffer.from(browserPolicySource).toString("base64")}`
);

test("F8 remote Strength and Honor share the Prospect Stripe 1 gateway", () => {
  assert.deepEqual(F8_REMOTE_ACCESS_GATEWAY, { progressionTier: "T1", stripeCount: 1 });
  assert.equal(hasReachedF8RemoteAccessGateway("T0", 4), false);
  assert.equal(hasReachedF8RemoteAccessGateway("T1", 0), false);
  assert.equal(hasReachedF8RemoteAccessGateway("T1", 1), true);
});

test("F8 Remote Combat uses the same Prospect Stripe 1 gateway", () => {
  const cases = [
    [{ progressionTier: "T0", stripeCount: 4 }, false],
    [{ progressionTier: "T1", stripeCount: 0 }, false],
    [{ progressionTier: "T1", stripeCount: 1 }, true],
    [{ progressionTier: "T2", stripeCount: 0 }, true],
    [{ progressionTier: "T4", stripeCount: 0 }, true],
  ];
  for (const [athlete, expected] of cases) {
    assert.equal(resolveF8RemoteAccess(athlete).combat, expected);
    assert.equal(browserPolicy.resolveF8RemoteAccess(athlete).combat, expected);
  }
});

test("adding Remote Combat leaves Strength and Honor gateway behavior unchanged", () => {
  const cases = [
    [{ progressionTier: "T0", stripeCount: 4, unlocks: { strength: true, honor: true } }, false],
    [{ progressionTier: "T1", stripeCount: 0 }, false],
    [{ progressionTier: "T1", stripeCount: 1 }, true],
    [{ progressionTier: "T2", stripeCount: 0 }, true],
  ];
  for (const [athlete, expected] of cases) {
    const server = resolveF8RemoteAccess(athlete);
    const browser = browserPolicy.resolveF8RemoteAccess(athlete);
    assert.equal(server.strength, athlete.progressionTier === "T0" ? false : expected);
    assert.equal(server.honor, athlete.progressionTier === "T0" ? false : expected);
    assert.equal(browser.strength, server.strength);
    assert.equal(browser.honor, server.honor);
  }
});

test("later progression ranks remain eligible after stripe resets", () => {
  assert.equal(hasReachedF8RemoteAccessGateway("T2", 0), true);
  assert.equal(hasReachedF8RemoteAccessGateway("T4", 0), true);
});

test("persistent unlock state keeps both remote lanes open", () => {
  assert.deepEqual(resolveF8RemoteAccess({
    progressionTier: "T1",
    stripeCount: 0,
    unlocks: { strength: true, honor: true },
  }), { combat: false, strength: true, honor: true, gatewayReached: false });
});

test("Shadow cannot use athlete assignments even when stale unlock flags exist", () => {
  assert.deepEqual(resolveF8RemoteAccess({
    progressionTier: "T0",
    stripeCount: 4,
    unlocks: { strength: true, honor: true },
  }), { combat: false, strength: false, honor: false, gatewayReached: false });
});

test("progressionTier takes precedence over a legacy tier field", () => {
  assert.equal(resolveF8RemoteAccess({
    progressionTier: "T0",
    tier: "T3",
    stripeCount: 4,
  }).gatewayReached, false);
});

test("invalid or missing progression data fails closed", () => {
  assert.equal(hasReachedF8RemoteAccessGateway("T7", 4), false);
  assert.equal(hasReachedF8RemoteAccessGateway(undefined, 4), false);
});

test("the authoritative XP transaction persists both unlocks at the gateway", () => {
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.match(source, /remoteAccess\.gatewayReached/);
  assert.match(source, /athletePatch\["unlocks\.strength"\] = true/);
  assert.match(source, /athletePatch\["unlocks\.honor"\] = true/);
});

test("active remote lane readers use the shared F8 access resolver", () => {
  const readers = [
    "public/athletes/arsenal/arsenal.app.js",
    "public/athletes/arsenal/honor/honor.app.js",
    "public/athletes/arsenal/strength/strength.app.js",
    "public/athletes/lanes/lanes.js",
    "public/athletes/lanes/lane-gate.js",
    "public/athletes/lanes/honor/honor.js",
    "public/athletes/lanes/strength/strength.js",
  ];
  for (const reader of readers) {
    assert.match(readFileSync(reader, "utf8"), /resolveF8RemoteAccess/);
  }
});
