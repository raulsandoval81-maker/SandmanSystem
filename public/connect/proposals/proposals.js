    AWAITING_CLIENT_SIGNATURE: "issue-client-review",
    CLIENT_CHANGES_REQUESTED: "return-to-draft",
    CLIENT_SIGNED: "approve-proposal"
  })[status] || "";
}

function proposalActionHtml(status, id) {
  if (status === "BUILDING" || status === "DRAFT") {
    return `<a class="proposal-open-btn" href="/connect/admissions/calculator/?proposalId=${encodeURIComponent(id)}">Continue Draft</a>`;
  }

  if (status === "PAID") {
    return `<a class="proposal-open-btn" href="/intake-management/?proposalId=${encodeURIComponent(id)}">Continue to Enrollment</a>`;
  }

  if (status === "AWAITING_CLIENT_SIGNATURE") {
    return `
      <button class="proposal-open-btn" type="button" data-proposal-action="issue-client-review" data-proposal-id="${esc(id)}">
        Reissue Client Review
      </button>

      <button class="proposal-open-btn" type="button" data-proposal-action="record-manual-signature" data-proposal-id="${esc(id)}">
        Record Manual Signature · Safeguard
      </button>
    `;
  }

  if (
    status === "READY_FOR_CHECKOUT" ||
    status === "CHECKOUT_CREATED"
  ) {
    return `
      <button class="proposal-open-btn" type="button" data-proposal-action="preview-enrollment-verification" data-proposal-id="${esc(id)}">
        Preview Review & Confirm
      </button>

      <button class="proposal-open-btn" type="button" data-proposal-action="copy-enrollment-verification" data-proposal-id="${esc(id)}">
        Copy Secure Link
      </button>

      <button class="proposal-open-btn" type="button" data-proposal-action="email-enrollment-verification" data-proposal-id="${esc(id)}">
        Email Review & Confirm
      </button>

      <button class="proposal-open-btn" type="button" data-proposal-action="correct-proposal" data-proposal-id="${esc(id)}">
        Correct Proposal