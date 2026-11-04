import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("prepaid backend derives six or twelve months from locked accepted terms", () => {
  const policy = read("functions/src/billing/prepaidReconciliationPolicy.ts");
  const callable = read("functions/src/billing/recordProposalPrepaidCash.ts");
  assert.match(policy, /lockedPrepaidCoverageMonths/);
  assert.match(policy, /Paid-in-full household members must have the same agreement duration/);
  assert.match(callable, /const monthsCovered = lockedPrepaidCoverageMonths\(proposal\)/);
  assert.match(callable, /validateFullYearCoverage\([\s\S]*?monthsCovered/);
  assert.match(callable, /monthsCovered,/);
  assert.doesNotMatch(callable, /monthsCovered: 12/);
  assert.match(callable, /assertPrepaidFamilyConfirmation\(proposal\)/);
  assert.match(callable, /hasConflictingStripeActivity/);
});

test("prepaid calculation and exact dates support 6/12 months without extra discounts", () => {
  const module = read("functions/src/billing/prepaidMembershipPolicy.ts");
  assert.match(module, /expectedMonthlyMembershipCents \* monthsCovered/);
  assert.match(module, /monthsCovered: 6 \| 12 = 12/);
  assert.match(module, /paidThrough\.getTime\(\) !== expectedPaidThrough\.getTime\(\)/);
  assert.match(module, /nextBilling\.getTime\(\) !== earliestRenewal\.getTime\(\)/);
});

test("backend six-month eligibility supports approved term aliases only", () => {
  const policy = read("functions/src/billing/prepaidReconciliationPolicy.ts");
  assert.match(policy, /"annual", "12_month", "twelve_month"/);
  assert.match(policy, /"six-month", "sixmonth", "six_month", "6_month"/);
});
