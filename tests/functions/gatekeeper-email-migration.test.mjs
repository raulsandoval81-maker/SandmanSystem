import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL(
    "../../functions/src/modules/gatekeeper/sendGatekeeperEmail.ts",
    import.meta.url
  ),
  "utf8"
);

test("non-pending transitions and already-pending updates skip", () => {
  assert.match(source, /afterStatus\s*!==\s*"pending"/);
  assert.match(source, /beforeStatus\s*===\s*"pending"/);
});

test("Gen 1 and Gen 2 wrappers share one handler and one trigger path", () => {
  assert.match(source, /export const sendGatekeeperEmail = functions/);
  assert.match(source, /\.firestore\.document\("interest_leads\/\{leadId\}"\)/);
  assert.match(source, /export const sendGatekeeperEmailV2 = onDocumentUpdated/);
  assert.match(source, /document:\s*"interest_leads\/\{leadId\}"/);
  assert.equal(
    source.match(/handleGatekeeperUpdate\s*\(/g)?.length,
    3,
    "one shared handler definition plus two wrapper calls expected"
  );
});

test("both generations bind and read the same Resend secret", () => {
  assert.match(source, /defineSecret\("RESEND_API_KEY"\)/);
  assert.equal(
    source.match(/secrets:\s*\[RESEND_API_KEY\]/g)?.length,
    2
  );
  assert.equal(source.match(/RESEND_API_KEY\.value\(\)/g)?.length, 2);
  assert.doesNotMatch(source, /functions\s*\.\s*config\s*\(/);
});

test("both generations derive the same snapshot-based transition identity", () => {
  assert.match(
    source,
    /\[leadId, afterUpdateTime, TRANSITION_MARKER\]\.join\(":"\)/
  );
  assert.match(source, /snapshotUpdateTime\(change\.after\)/);
  assert.doesNotMatch(source, /event\.id/);
});

test("the delivery claim blocks concurrent processing and permits failed or expired retry", () => {
  assert.match(source, /collection\("gatekeeperEmailDeliveries"\)/);
  assert.match(source, /runTransaction/);
  assert.match(source, /existing\.status\s*===\s*"processing"/);
  assert.match(source, /leaseUntil\.getTime\(\)\s*>\s*Date\.now\(\)/);
  assert.match(source, /return \{ state: "busy" \}/);
  assert.match(source, /status:\s*"failed"/);
  assert.match(source, /attemptCount:\s*FieldValue\.increment\(1\)/);
});

test("completed delivery skips provider send and retries business synchronization", () => {
  assert.match(source, /existing\.status\s*===\s*"completed"/);
  assert.match(
    source,
    /syncConfirmationSent\(\s*change\.after\.ref,\s*appointmentRef,\s*claim\.emailId/s
  );
  const completedBranch = source.indexOf('if (claim.state === "completed")');
  const providerSend = source.indexOf("await resend", completedBranch);
  assert.ok(completedBranch >= 0 && providerSend > completedBranch);
});

test("provider key is the same deterministic transition hash for both wrappers", () => {
  assert.match(
    source,
    /return `gatekeeper-\$\{transitionHash\}`/
  );
  assert.match(
    source,
    /idempotencyKey:\s*gatekeeperProviderIdempotencyKey\(transitionHash\)/
  );
});

test("provider completion is durable before sent-status synchronization", () => {
  const durable = source.indexOf('status: "completed"');
  const sync = source.indexOf("await syncConfirmationSent(", durable);
  assert.ok(durable >= 0 && sync > durable);
  assert.match(source, /if \(!providerCompleted\)/);
});

test("failed pre-provider attempts preserve failed business status", () => {
  assert.match(source, /markDeliveryFailed\(/);
  assert.match(source, /markConfirmationFailed\(\s*change\.after\.ref/s);
  assert.match(source, /markConfirmationFailed\(\s*appointmentRef/s);
});
