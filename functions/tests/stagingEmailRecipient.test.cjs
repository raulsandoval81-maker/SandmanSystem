"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { stagingRecipientDecision } = require("../lib/modules/email/resend");

test("staging email fails closed when no approved mailbox is configured", () => {
  assert.deepEqual(
    stagingRecipientDecision("synthetic@example.invalid", "sandman-combat-staging", ""),
    { allowed: false, reason: "ALLOWLIST_NOT_CONFIGURED" }
  );
});

test("staging email accepts only exact normalized allowlist entries", () => {
  const configured = " approved-test@example.invalid , second@example.invalid ";
  assert.equal(
    stagingRecipientDecision("APPROVED-TEST@example.invalid", "sandman-combat-staging", configured).allowed,
    true
  );
  assert.deepEqual(
    stagingRecipientDecision("family@example.com", "sandman-combat-staging", configured),
    { allowed: false, reason: "RECIPIENT_NOT_ALLOWED" }
  );
});

test("non-staging projects preserve existing recipient behavior", () => {
  assert.deepEqual(
    stagingRecipientDecision("family@example.com", "sandman-combat-prod", ""),
    { allowed: true }
  );
});
