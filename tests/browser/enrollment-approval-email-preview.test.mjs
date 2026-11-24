import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const page = read("public/connect/proposals/proposals.js");
const handler = read("functions/src/proposals/issueProposalEnrollmentHandoff.ts");

test("approval email shows a read-only preview before issuing its link", () => {
  assert.match(page, /async function previewEnrollmentApprovalEmail\(selectedProposalId\)/);
  assert.match(page, /getDoc\(doc\(db, "proposals", selectedProposalId\)\)/);
  assert.match(page, /dialog\.showModal\(\)/);
  assert.match(page, /data-email-to/);
  assert.match(page, /data-email-subject/);
  assert.match(page, /data-email-route/);
  assert.match(page, /data-email-body/);
  assert.match(page, /data-email-cancel/);
  assert.match(page, /data-email-send/);
  assert.match(page, /data-email-note maxlength="600"/);
  assert.match(page, /let personalNote = ""/);
  assert.match(page, /const reviewed = await previewEnrollmentApprovalEmail\(proposalId\)/);
  assert.match(page, /if \(!reviewed\) \{\s*button\.disabled = false;\s*button\.textContent = originalText;\s*return;/);
  const review = page.indexOf("const reviewed = await previewEnrollmentApprovalEmail(proposalId)");
  const call = page.indexOf('"issueProposalEnrollmentHandoff"');
  assert.ok(review > 0 && call > review, "Preview must precede the mutating email callable");
});

test("approved courtesy note is optional, validated and escaped for HTML", () => {
  assert.match(page, /delivery === "email" \? \{ personalNote \} : \{\}/);
  assert.match(page, /Only your optional courtesy note can be edited here/);
  assert.match(handler, /suppliedNote = req\.data\?\.personalNote/);
  assert.match(handler, /typeof suppliedNote !== "string"/);
  assert.match(handler, /personalNote\.length > 600/);
  assert.match(handler, /delivery !== "email" && personalNote/);
  assert.match(handler, /"Note from Sandman Academy:", personalNote/);
  assert.match(handler, /escapeHtml\(personalNote\)/);
  assert.match(handler, /personalNoteIncluded:/);
});

test("payment instructions and secure link remain controlled by the signed proposal", () => {
  assert.match(handler, /"prepaid_cash_check"/);
  assert.match(handler, /No new online payment is requested/);
  assert.match(handler, /"After confirmation, continue to secure Stripe payment."/);
  assert.match(handler, /const enrollmentPath\s*=/);
  assert.match(handler, /resolveBillingPublicBaseUrl\(\)/);
  assert.doesNotMatch(handler, /req\.data\?\.paymentArrangement/);
  assert.doesNotMatch(handler, /req\.data\?\.recipientEmail/);
});
