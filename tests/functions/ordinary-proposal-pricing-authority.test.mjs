import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { calculateSandmanMembershipPricing } from "../../public/assets/js/pricing/sandman-pricing-engine.js";

const require = createRequire(import.meta.url);
const { canonicalOrdinaryProposalPricing } = require("../../functions/lib/proposals/ordinaryProposalPricing.js");
const { buildClientProposalSnapshot } = require("../../functions/lib/proposals/proposalClientReview.js");

const combat = (overrides = {}) => ({
  index: 1, name: "Synthetic Athlete", plan: "standard",
  trainingAccess: "core-2", billingTerm: "month-to-month",
  credit: 0, disciplines: ["wrestling"], ...overrides,
});
const fitness = (overrides = {}) => ({
  index: 2, name: "Synthetic Fitness", plan: "fitness",
  trainingAccess: "2", billingTerm: "month-to-month", credit: 0, ...overrides,
});
const request = (overrides = {}) => ({
  supportPercent: 0, monthlySponsorPercent: 0, annualSponsorPercent: 0,
  membershipStartDate: "2026-11-01", paymentStartMode: "start_now",
  extraCode: "none", privatePromo: 0, enrollmentPreviouslyPaidAmount: 0,
  ...overrides,
});

test("ordinary pricing reproduces the approved browser catalog for a legitimate family", () => {
  const athletes = [
    combat({ index: 1, trainingAccess: "core-2", billingTerm: "annual", credit: 25 }),
    combat({ index: 2, trainingAccess: "dual-full", billingTerm: "six-month" }),
    fitness({ index: 3, trainingAccess: "3" }),
  ];
  const browser = calculateSandmanMembershipPricing(athletes);
  const pricing = canonicalOrdinaryProposalPricing(request({
    supportPercent: 25, monthlySponsorPercent: 25,
    monthlyBase: browser.monthlyMembership,
    stripeCatalogItems: browser.catalogItems,
  }), athletes);

  assert.equal(pricing.catalog, "ACADEMY_2026_V4");
  assert.equal(pricing.monthlyBase, 330); // h2 dual 6mo ($250) + Fitness 3-day ($80)
  assert.equal(pricing.monthlySponsor, 82.5);
  assert.equal(pricing.monthlyBalance, 247.5);
  assert.equal(pricing.enrollmentBase, 60);
  assert.equal(pricing.admissionsCredits, 25);
  assert.equal(pricing.support, 15);
  assert.equal(pricing.enrollmentDueNow, 20);
  assert.equal(pricing.proratedFirstMonth, 247.5);
  assert.deepEqual(pricing.stripeCatalogItems, browser.catalogItems);
});

test("server ordinary catalog stays in parity with every approved browser Combat rate", () => {
  const accesses = ["core-2", "competition-3", "classes-4", "discipline-5", "dual-full"];
  const terms = ["annual", "six-month", "month-to-month"];
  for (const size of [1, 2, 3, 4]) {
    for (const trainingAccess of accesses) {
      for (const billingTerm of terms) {
        const athletes = Array.from({ length: size }, (_, index) => combat({
          index: index + 1, trainingAccess, billingTerm,
        }));
        const browser = calculateSandmanMembershipPricing(athletes);
        const server = canonicalOrdinaryProposalPricing(request(), athletes);
        assert.equal(server.monthlyBase, browser.monthlyMembership,
          `household ${size}, ${trainingAccess}, ${billingTerm}`);
        assert.deepEqual(server.stripeCatalogItems, browser.catalogItems,
          `catalog household ${size}, ${trainingAccess}, ${billingTerm}`);
      }
    }
  }
});

test("tampered ordinary totals, catalog items, credits, promotions, and sponsorship fail closed", () => {
  const athletes = [combat()];
  for (const mutation of [
    { monthlyBase: 1 },
    { dueNow: 1 },
    { stripeCatalogItems: [] },
    { additionalMembershipMonthsDue: 25 },
    { monthlySponsorPercent: 10 },
    { privatePromo: 10 },
    { promotionCode: "FAKE25", promotionAmount: 25 },
  ]) {
    assert.throws(
      () => canonicalOrdinaryProposalPricing(request(mutation), athletes),
      /does not match|approved|not approved|invalid/,
    );
  }
  assert.throws(
    () => canonicalOrdinaryProposalPricing(request(), [combat({ credit: 20 })]),
    /credit is not approved/,
  );
});

test("approved one-time promotion is identified and capped against enrollment obligation", () => {
  const pricing = canonicalOrdinaryProposalPricing(request({
    promotionCode: "TEST25", promotionAmount: 25,
  }), [combat({ credit: 25 })]);
  assert.equal(pricing.promotionCode, "TEST25");
  assert.equal(pricing.promotionAmount, 25);
  assert.equal(pricing.promotion, 5);
  assert.equal(pricing.enrollmentDueNow, 0);
  assert.equal(pricing.dueNow, 100);
});

test("legacy draft shapes remain compatible while authoritative fields are added", () => {
  const pricing = canonicalOrdinaryProposalPricing({
    membershipStartDate: "2026-11-17",
    internalLegacyLabel: "preserve-me",
  }, [combat({ billingTerm: "annual" })]);

  assert.equal(pricing.internalLegacyLabel, "preserve-me");
  assert.equal(pricing.monthlyBase, 80);
  assert.equal(pricing.prorationPercent, 50);
  assert.equal(pricing.proratedFirstMonth, 40);
  assert.equal(pricing.enrollmentDueNow, 30);
  assert.equal(pricing.dueNow, 70);
  assert.equal(pricing.stripeCatalogItems[0].lookupKey,
    "sandman_academy-2026-v4_combat_h1_core2_12mo");
});

test("Review & Confirm freezes the server-authoritative ordinary pricing", () => {
  const pricing = canonicalOrdinaryProposalPricing(request({ monthlySponsorPercent: 25 }), [combat()]);
  const snapshot = buildClientProposalSnapshot("P-000999", {
    prospect: { familyName: "Synthetic Family" }, athletes: [combat()], pricing,
    agreement: { membershipStartDate: "2026-11-01" },
  });
  assert.deepEqual(snapshot.pricing, pricing);
  assert.equal(snapshot.pricing.monthlyBase, 100);
  assert.equal(snapshot.pricing.monthlyBalance, 75);
  assert.equal(snapshot.pricing.dueNow, 105);
});

test("seasonal pricing remains routed through its existing canonical policy", () => {
  const source = require("node:fs").readFileSync(
    new URL("../../functions/src/proposals/seasonalProposal.ts", import.meta.url), "utf8");
  assert.match(source, /isSeasonalProposalPricing\(pricing\)[\s\S]*canonicalSeasonalPricing\(pricing, athletes\)/);
  assert.match(source, /canonicalOrdinaryProposalPricing\(pricing, athletes\)/);
});

