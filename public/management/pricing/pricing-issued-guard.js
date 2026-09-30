import {
  db,
  collection,
  getDocs,
  query,
  where
} from "/assets/js/firebase-init.js";

function clean(value = "") {
  return String(value ?? "").trim();
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : 0;
}

async function proposalsForAppointment(appointmentId) {
  const proposalsRef = collection(db, "proposals");
  const results = [];

  const direct = await getDocs(
    query(
      proposalsRef,
      where("appointmentId", "==", appointmentId)
    )
  );

  direct.forEach((snapshot) => {
    results.push({ id: snapshot.id, ...snapshot.data() });
  });

  if (!results.length) {
    const nested = await getDocs(
      query(
        proposalsRef,
        where("prospect.appointmentId", "==", appointmentId)
      )
    );

    nested.forEach((snapshot) => {
      results.push({ id: snapshot.id, ...snapshot.data() });
    });
  }

  return results.sort(
    (a, b) =>
      timestampMillis(b.updatedAt || b.createdAt) -
      timestampMillis(a.updatedAt || a.createdAt)
  );
}

function statusLabel(proposal) {
  const status = clean(proposal?.status).toUpperCase();

  if (
    status === "AWAITING_CLIENT_SIGNATURE" &&
    proposal?.clientReview?.emailSentAt
  ) {
    return "Remote Proposal Sent";
  }

  return ({
    BUILDING: "Proposal In Progress",
    DRAFT: "Proposal Draft",
    REVIEW: "Proposal Signature",
    AWAITING_CLIENT_SIGNATURE: "Awaiting Client Signature",
    CLIENT_CHANGES_REQUESTED: "Client Changes Requested",
    CLIENT_SIGNED: "Signature Received",
    READY_FOR_CHECKOUT: "Checkout Ready",
    CHECKOUT_CREATED: "Checkout Created",
    PAYMENT_PENDING: "Payment Pending",
    PAID: "Paid"
  })[status] || status.replaceAll("_", " ") || "Proposal";
}

function guidanceFor(proposal) {
  const status = clean(proposal?.status).toUpperCase();

  if (
    status === "AWAITING_CLIENT_SIGNATURE" &&
    proposal?.clientReview?.emailSentAt
  ) {
    return "Awaiting confirmation receipt. The proposal is already with the family; do not resend or rebuild pricing.";
  }

  if (status === "AWAITING_CLIENT_SIGNATURE") {
    return "The proposal is already open for family signature. Pricing is no longer active for this appointment.";
  }

  if (["BUILDING", "DRAFT"].includes(status)) {
    return "A proposal already exists for this appointment. Continue from the existing proposal instead of starting pricing again.";
  }

  if (status === "PAID") {
    return "Payment is complete. Continue from the proposal or enrollment workflow.";
  }

  return "This appointment already has an active proposal. Continue from that proposal instead of rebuilding pricing.";
}

function collapsePricingToProposal(proposal) {
  const wrap = document.querySelector("main.pricing-wrap");
  const header = wrap?.querySelector(".pricing-header");
  if (!wrap || !header) return;

  const proposalId = clean(proposal?.proposalId || proposal?.id);
  if (!proposalId) return;

  Array.from(wrap.children).forEach((child) => {
    if (child === header || child.dataset?.existingProposalGuard === "true") return;
    child.hidden = true;
  });

  const intro = header.querySelector(".pricing-intro");
  if (intro) {
    intro.textContent =
      "This admissions case has already moved into the proposal workflow.";
  }

  let receipt = wrap.querySelector("[data-existing-proposal-guard='true']");
  if (!receipt) {
    receipt = document.createElement("section");
    receipt.dataset.existingProposalGuard = "true";
    receipt.className = "pricing-panel";
    header.insertAdjacentElement("afterend", receipt);
  }

  const remoteSent =
    clean(proposal?.status).toUpperCase() === "AWAITING_CLIENT_SIGNATURE" &&
    Boolean(proposal?.clientReview?.emailSentAt);

  receipt.innerHTML = `
    <p class="section-label">Current Case</p>
    <h2>${statusLabel(proposal)}</h2>
    <p>${guidanceFor(proposal)}</p>
    <p><strong>Proposal:</strong> ${proposalId}</p>
    <div class="pricing-actions">
      <a class="button button-primary" href="/connect/proposals/?proposalId=${encodeURIComponent(proposalId)}">Open Proposal</a>
      <a class="button" href="/connect/proposals/activity/?proposalId=${encodeURIComponent(proposalId)}">${remoteSent ? "View Activity Receipt" : "View Activity"}</a>
    </div>
  `;
}

export async function guardIssuedPricingCase() {
  if (!window.location.pathname.startsWith("/management/pricing/")) return;

  const appointmentId = clean(
    new URLSearchParams(window.location.search).get("appointmentId")
  );

  if (!appointmentId) return;

  const proposals = await proposalsForAppointment(appointmentId);
  const activeProposal = proposals.find(
    (proposal) => clean(proposal.status).toUpperCase() !== "VOID"
  );

  if (activeProposal) {
    collapsePricingToProposal(activeProposal);
  }
}
