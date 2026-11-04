import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const safeguards = read("public/connect/proposals/proposal-safeguards.js");
const callable = read("functions/src/proposals/returnProposalToDraft.ts");

test("Correct Proposal restores its button after a callable failure", () => {
  const handlerStart = safeguards.indexOf('correctButton.addEventListener(');
  const handlerEnd = safeguards.indexOf('actions.appendChild(correctButton)', handlerStart);
  const handler = safeguards.slice(handlerStart, handlerEnd);
  const capture = handler.indexOf("const originalText =");
  const pending = handler.indexOf('correctButton.textContent =\n            "Reopening…"');
  const failure = handler.indexOf("} catch (error)");
  const enable = handler.indexOf("correctButton.disabled = false", failure);
  const restore = handler.indexOf("correctButton.textContent =\n              originalText", failure);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "correction handler is missing");
  assert.ok(capture >= 0 && capture < pending, "button text must be captured before it changes");
  assert.ok(failure > pending, "callable failure handler is missing");
  assert.ok(enable > failure && restore > enable, "failure must enable the button and restore its label");
});

test("return to draft preserves history and invalidates prior review authority", () => {
  assert.match(callable, /if \(!req\.auth\)/);
  assert.match(callable, /requireProposalStaffAccess/);
  assert.match(callable, /requireProposalLocationAccess/);
  assert.match(callable, /clientReview: FieldValue\.delete\(\)/);
  assert.match(callable, /clientAcceptance: FieldValue\.delete\(\)/);
  assert.match(callable, /lockedSnapshot: FieldValue\.delete\(\)/);
  assert.match(callable, /tx\.create\(historyRef, \{/);
  assert.match(callable, /fromStatus: status/);
  assert.match(callable, /toStatus: "DRAFT"/);
  assert.match(callable, /correctionReason:/);
  assert.doesNotMatch(callable, /tx\.delete\(/);
});
