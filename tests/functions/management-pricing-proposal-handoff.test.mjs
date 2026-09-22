import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("walk-in retains appointment source and routes through Management Pricing", () => {
  const leads = read("public/connect/leads/leads.js");
  assert.match(leads, /"admissions_appointments",\s*leadId/);
  assert.match(leads, /\/management\/pricing\/\?appointmentId=/);
});

test("pricing requires Management and canonical appointment before proposal handoff", () => {
  const pricing = read("public/management/pricing/pricing.js");
  assert.match(pricing, /await requireManagement\(\)/);
  assert.match(pricing, /"admissions_appointments", appointmentId/);
  assert.match(pricing, /if \(!appointment\.locationId\)/);
  assert.match(pricing, /sandmanPricingProposalHandoff/);
  assert.match(pricing, /\/connect\/admissions\/calculator\/\?appointmentId=/);
});

test("Prospect Builder matches the appointment handoff and retains canonical proposal API", () => {
  const builder = read("public/connect/admissions/calculator/calculator.js");
  assert.match(builder, /handoff\?\.appointmentId !== appointmentId/);
  assert.match(builder, /applyManagementPricingHandoff\(\)/);
  assert.match(builder, /"createProposalDraft"/);
});
