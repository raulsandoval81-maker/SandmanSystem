import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../public/management/pricing/index.html", import.meta.url), "utf8");
const pricing = readFileSync(new URL("../../public/management/pricing/pricing.js", import.meta.url), "utf8");
const builder = readFileSync(new URL("../../public/connect/admissions/calculator/calculator.js", import.meta.url), "utf8");

test("historical enrollment entry is in Pricing, not a competing Edge Case proposal creator", () => {
  assert.match(html, /id="enrollmentPaymentRoute"/);
  assert.match(html, /value="historical_prepaid_check"/);
  assert.match(html, /original payment and family confirmation/);
  assert.match(pricing, /"createProposalDraft"/);
  assert.match(pricing, /historicalPrepaid \? "&historicalPrepaid=1"/);
});

test("historical PIF requires appointment, original start date, single Combat annual athlete", () => {
  assert.match(pricing, /!sourceAppointment \|\| !appointmentId/);
  assert.match(pricing, /original membership start date/);
  assert.match(pricing, /cards\.length !== 1/);
  assert.match(pricing, /term\.value = "annual"/);
});

test("historical check PIF never auto-records the receipt as an unrelated prior payment", () => {
  assert.match(pricing, /historicalPrepaid \? null : priorPaymentHandoff\(\)/);
  assert.match(pricing, /historicalPrepaid \? null : priorPaymentHandoff\(\)/);
  assert.match(builder, /el\.paymentArrangement\.value = "prepaid_cash_check"/);
  assert.match(builder, /proposalStatus === "DRAFT"/);
  assert.match(builder, /proposal\.priorPayments\.length/);
  assert.match(builder, /original payment is NOT yet reconciled/);
});
