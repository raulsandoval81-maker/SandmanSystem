import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("Admissions presents the approved eight-stage lifecycle", async () => {
  const source = await read("public/assets/js/management-lifecycle.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const lifecycle = await import(moduleUrl);

  assert.deepEqual(
    lifecycle.MANAGEMENT_LIFECYCLE_STAGES.map(({ id, label }) => [id, label]),
    [
      ["interest", "Interest"],
      ["lead", "Lead"],
      ["appointment", "Appointment"],
      ["outcome", "Outcome"],
      ["prospect-builder", "Prospect Builder"],
      ["review-approve", "Review & Approve"],
      ["checkout-enrollment", "Checkout & Enrollment"],
      ["intake-activation", "Intake & Activation"],
    ]
  );

  assert.equal(lifecycle.visibleStageForProposalStatus("DRAFT"), "prospect-builder");
  assert.equal(lifecycle.visibleStageForProposalStatus("REVIEW"), "review-approve");
  assert.equal(lifecycle.visibleStageForProposalStatus("AWAITING_CLIENT_SIGNATURE"), "review-approve");
  assert.equal(lifecycle.visibleStageForProposalStatus("CLIENT_CHANGES_REQUESTED"), "review-approve");
  assert.equal(lifecycle.visibleStageForProposalStatus("CLIENT_SIGNED"), "review-approve");
  assert.equal(lifecycle.visibleStageForProposalStatus("READY_FOR_CHECKOUT"), "checkout-enrollment");
  assert.equal(lifecycle.visibleStageForProposalStatus("CHECKOUT_CREATED"), "checkout-enrollment");
  assert.equal(lifecycle.visibleStageForProposalStatus("PAID"), "checkout-enrollment");
});

test("Prospect Builder hands submitted work to Review & Approve", async () => {
  const [builder, markup] = await Promise.all([
    read("public/connect/admissions/calculator/calculator.js"),
    read("public/connect/admissions/calculator/index.html"),
  ]);

  assert.doesNotMatch(builder, /issueProposalClientReview/);
  assert.doesNotMatch(builder, /review-handoff/);
  assert.match(builder, /window\.location\.assign\(\s*"\/connect\/proposals\/"\s*\)/);
  assert.doesNotMatch(markup, /id="(?:resetButton|approveProposalButton|checkoutProposalButton)"/);
  assert.match(markup, /id="saveDraftButton"/);
  assert.match(markup, /id="submitReviewButton"/);
});

test("Review & Approve owns secure revision, approval, and checkout handoffs", async () => {
  const [queue, callable] = await Promise.all([
    read("public/connect/proposals/proposals.js"),
    read("functions/src/proposals/returnProposalToDraft.ts"),
  ]);

  assert.doesNotMatch(queue, /\/connect\/proposals\/review\/\?proposalId/);
  assert.match(queue, /\["BUILDING", "DRAFT"\]/);
  assert.match(queue, /issueProposalClientReview/);
  assert.match(queue, /returnProposalToDraft/);
  assert.match(queue, /approveProposal/);
  assert.match(queue, /createProposalCheckout/);
  assert.match(queue, /\/intake-management\/\?proposalId=/);

  assert.match(callable, /if \(!req\.auth\)/);
  assert.match(callable, /requireProposalStaffAccess/);
  assert.match(callable, /requireProposalLocationAccess/);
  assert.match(callable, /CLIENT_CHANGES_REQUESTED/);
  assert.match(callable, /clientReview: FieldValue\.delete\(\)/);
  assert.match(callable, /toStatus: "DRAFT"/);
});
