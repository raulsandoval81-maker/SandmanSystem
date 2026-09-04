import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PROGRAM_THRESHOLDS } from "../../functions/lib/engines/promotion-engine/programThresholds.js";
import { getStripeStatus } from "../../functions/lib/engines/stripe-engine/stripeStatus.js";
import { evaluateProgression } from "../../functions/lib/engines/progression-engine/progressionEngine.js";
import { evaluateTesting } from "../../functions/lib/engines/testing-engine/testingEngine.js";
import { buildCertificatePayload } from "../../functions/lib/engines/certificate-engine/certificatePayloadEngine.js";

const athlete = (overrides = {}) => ({
  id: "F8_0001",
  uid: "F8_0001",
  name: "Youth Athlete",
  fullName: "Youth Athlete",
  team: "LAW",
  programCode: "F8",
  programName: "Foundry 8 • Zero2Hero",
  tier: 0,
  tierCode: "T0",
  stripe: 0,
  stripeCount: 0,
  xp: 0,
  xpCap: 800,
  coachUid: "coach-1",
  coach: "Coach",
  rankName: "Shadow",
  rankColor: "white",
  certificates: [],
  ...overrides,
});

test("legacy F8 adapter exposes only the canonical five ranks", () => {
  assert.deepEqual(PROGRAM_THRESHOLDS.F8.tiers.map(({ tier }) => tier), [0, 1, 2, 3, 4]);
  assert.deepEqual(PROGRAM_THRESHOLDS.F8.tiers.map(({ xp }) => xp), [800, 1600, 2400, 2800, 3200]);
  assert.ok(PROGRAM_THRESHOLDS.F8.tiers.every(({ stripesRequired }) => stripesRequired === 4));
});

test("legacy stripe adapter uses canonical Road2Champion thresholds", () => {
  const thresholds = (tier, cap) => [
    getStripeStatus(athlete({ tier, xp: 0 })).threshold,
    getStripeStatus(athlete({ tier, xp: Math.ceil(cap * 0.25), stripe: 1 })).threshold,
    getStripeStatus(athlete({ tier, xp: Math.ceil(cap * 0.5), stripe: 2 })).threshold,
    getStripeStatus(athlete({ tier, xp: Math.ceil(cap * 0.75), stripe: 3 })).threshold,
  ];
  assert.deepEqual(thresholds(0, 800), [200, 400, 600, 800]);
  assert.deepEqual(thresholds(2, 2400), [600, 1200, 1800, 2400]);
  assert.deepEqual(thresholds(4, 3200), [800, 1600, 2400, 3200]);
});

test("F8 testing requires all four stripes", () => {
  assert.equal(evaluateTesting(athlete({ stripe: 3, stripeCount: 3 })).eligible, false);
  assert.equal(evaluateTesting(athlete({ stripe: 4, stripeCount: 4 })).eligible, true);
});

test("progression and certificate paths consume the canonical Shadow threshold", () => {
  const progression = evaluateProgression(athlete({ xp: 200 }));
  assert.equal(progression.stripeDecision.threshold, 200);
  assert.equal(progression.stripeDecision.nextStripe, 1);
  const certificate = buildCertificatePayload(athlete({ xp: 200 }));
  assert.equal(certificate.certificateType, "STRIPE");
  assert.equal(certificate.stripe, 1);
});

test("new F8 initialization paths derive the canonical Shadow cap", () => {
  const activation = readFileSync("functions/src/approveAndActivate.ts", "utf8");
  const addDiscipline = readFileSync("functions/src/services/addDisciplineToAthlete.ts", "utf8");
  assert.doesNotMatch(activation, /xpCap:\s*600/);
  assert.match(activation, /xpCap:\s*resolveF8RankXpCap\("T0"\)/);
  assert.doesNotMatch(addDiscipline, /xpCap:\s*600/);
  assert.match(addDiscipline, /xpCap:\s*resolveF8RankXpCap\("T0"\)/);
});

test("F4 legacy adapter remains unchanged", () => {
  assert.deepEqual(PROGRAM_THRESHOLDS.F4.tiers.map(({ xp }) => xp), [1000, 1600, 2000, 2400, 3000]);
  assert.ok(PROGRAM_THRESHOLDS.F4.tiers.every(({ stripesRequired }) => stripesRequired === 4));
});
