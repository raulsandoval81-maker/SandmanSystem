import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("paid-in-full source evidence uses a cross-proposal atomic Firestore claim", () => {
  const source = read("functions/src/billing/recordProposalPrepaidCash.ts");
  assert.match(source, /normalizedPaymentEvidence\(req\.data\?\.paymentEvidenceReference\)/);
  assert.match(source, /db\.collection\("prepaidPaymentEvidenceClaims"\)/);
  assert.match(source, /const existingEvidenceClaim = await tx\.get\(evidenceClaimRef\)/);
  assert.match(source, /if \(existingEvidenceClaim\.exists\)/);
  assert.match(source, /tx\.create\(evidenceClaimRef/);
  assert.match(source, /tx\.update\(\s*proposalRef/);
  assert.match(source, /paymentEvidenceFingerprint: evidenceFingerprint/);
  const evidenceRead = source.indexOf("await tx.get(evidenceClaimRef)");
  const claimWrite = source.indexOf("tx.create(evidenceClaimRef");
  const paidWrite = source.indexOf("tx.update(\n              proposalRef", claimWrite);
  assert.ok(evidenceRead > 0 && claimWrite > evidenceRead && paidWrite > claimWrite,
    "claim read/creation and proposal payment must be in same transaction");
});

test("Management requires original payment evidence and never populates it automatically", () => {
  const ui = read("public/management/billing/billing.js");
  assert.match(ui, /id="prepaidCashEvidenceReference"/);
  assert.match(ui, /paymentEvidenceReference,/);
  assert.match(ui, /getElementById\("prepaidCashEvidenceReference"\)\.value = ""/);
  assert.doesNotMatch(ui, /prepaidCashEvidenceReference"\)\.value = (?:proposalId|Date\.now|new Date)/);
});
