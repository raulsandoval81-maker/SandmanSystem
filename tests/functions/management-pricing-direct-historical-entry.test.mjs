import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
const html = read("public/management/pricing/index.html");
const pricing = read("public/management/pricing/pricing.js");
const backend = read("functions/src/proposals/createProposalDraft.ts");
const builder = read("public/connect/admissions/calculator/calculator.js");

test("Management historical paper entry is separate from unsupported walk-in / existing athlete linking", () => {
  assert.match(html, /value="management_historical"/);
  assert.match(html, /id="historicalSourceReference"/);
  assert.match(html, /id="historicalAttestation"/);
  assert.match(pricing, /directHistorical && historical/);
  assert.match(pricing, /enrollmentAthleteRecord\?\.value !== "new"/);
  assert.match(pricing, /if \(appointmentId\) throw new Error/);
});

test("Direct route creates same canonical proposal without manufacturing an appointment", () => {
  assert.match(pricing, /"createProposalDraft"/);
  assert.match(pricing, /managementHistorical \? null : appointmentId/);
  assert.match(pricing, /managementHistorical \? null : \(/);
  assert.match(pricing, /sourceReference: String\(historicalSourceReference\.value\)/);
  assert.match(pricing, /historicalPrepaid \? "&historicalPrepaid=1"/);
  assert.match(builder, /el\.paymentArrangement\.value = "prepaid_cash_check"/);
});

test("Server enforces authorized historical source and one actual annual athlete", () => {
  assert.match(backend, /requireProposalStaffAccess/);
  assert.match(backend, /requireProposalLocationAccess/);
  assert.match(backend, /historicalInput\.confirmExistingAgreement !== true/);
  assert.match(backend, /historicalReference\.length < 8/);
  assert.match(backend, /rawAthlete\.billingTerm\) !== "annual"/);
  assert.match(backend, /athletes\.length !== 1/);
  assert.match(backend, /startDate > new Date\(\)/);
  assert.match(backend, /historicalInput && \(appointmentId \|\| admissionsRequestId \|\| conversionSourceProposalId\)/);
});

test("Atomic case key reuses original proposal and does not assert payment reconciliation", () => {
  assert.match(backend, /db\.collection\("historicalProposalCases"\)/);
  assert.match(backend, /await tx\.get\(historicalCaseRef\)/);
  assert.match(backend, /idempotent: true/);
  assert.match(backend, /tx\.create\(historicalCaseRef/);
  assert.match(backend, /paymentVerificationAtEntry: "NOT_VERIFIED"/);
  assert.match(pricing, /historicalPrepaid \? null : priorPaymentHandoff/);
});

test("Existing appointment proposal route remains preserved", () => {
  assert.match(pricing, /findDraftProposalForAppointment\(\)/);
  assert.match(pricing, /normalAdmission/);
  assert.match(backend, /collection\("admissions_appointments"\)/);
});
