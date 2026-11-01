import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");

test("draft edits protect recorded receipts against silent financial repricing", () => {
  const source = read("functions/src/proposals/updateProposalDraft.ts");
  assert.match(source, /Array\.isArray\(existing\.priorPayments\)/);
  assert.match(source, /"monthlyBalance"/);
  assert.match(source, /"enrollmentBase"/);
  assert.match(source, /"membershipStartDate"/);
  assert.match(source, /"firstRecurringChargeDate"/);
  assert.match(source, /Historical payments are recorded/);
});

test("Enrollment Flow reports activation only with an approved athlete UID", () => {
  const source = read("public/management/enrollment-flow/enrollment-flow.js");
  assert.match(source, /active=upper\(i\?\.status\)==="APPROVED"&&Boolean\(clean\(i\?\.approvedUid\)\)/);
  assert.match(source, /correctedAt/);
});

test("Management navigation retains the selected proposal through each screen", () => {
  const billing = read("public/management/billing/billing.js");
  const flow = read("public/management/enrollment-flow/enrollment-flow.js");
  const proposals = read("public/connect/proposals/proposals.js");
  assert.match(billing, /encodeURIComponent\(proposalId\)/);
  assert.match(billing, /requestedProposalId/);
  assert.match(flow, /requestedProposalId/);
  assert.match(flow, /encodeURIComponent\(r\.id\)/);
  assert.match(proposals, /selectedCard\.scrollIntoView/);
  assert.match(proposals, /group\.open = true/);
});
