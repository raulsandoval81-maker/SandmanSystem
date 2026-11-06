import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  if (!value) return "—";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "—";
}

function ensureStyles() {
  if (document.getElementById("proposalEmailAuditStyles")) return;

  const style = document.createElement("style");
  style.id = "proposalEmailAuditStyles";
  style.textContent = `
    .proposal-email-audit{
      display:grid;
      gap:4px;
      padding:10px 12px;
      border:1px solid var(--management-border);
      border-radius:11px;
      background:var(--management-surface-soft);
      color:var(--management-muted);
      font-size:.8rem;
      line-height:1.45;
    }

    .proposal-email-audit strong{
      color:var(--management-text);
      overflow-wrap:anywhere;
    }

    .proposal-email-audit__sent{
      color:var(--management-success);
      font-weight:800;
    }
  `;

  document.head.appendChild(style);
}

async function hydrateCard(card) {
  if (!card || card.dataset.emailAuditLoading === "1") return;

  const proposalId =
    String(card.dataset.proposalId || "").trim();

  if (!proposalId) return;

  card.dataset.emailAuditLoading = "1";

  try {
    const snapshot = await getDoc(
      doc(db, "proposals", proposalId)
    );

    if (!snapshot.exists()) return;

    const proposal = snapshot.data() || {};
    const contactEmail =
      String(proposal.prospect?.email || "").trim();
    const review = proposal.clientReview || {};
    const sentTo =
      String(review.emailRecipient || "").trim();
    const sentAt = review.emailSentAt;
    const deliveryStatus = String(review.deliveryStatus || "").trim();
    const deliveryError = String(review.deliveryError || "").trim();

    let audit = card.querySelector(
      ".proposal-email-audit"
    );

    if (!audit) {
      audit = document.createElement("div");
      audit.className = "proposal-email-audit";

      const actions = card.querySelector(
        ".proposal-card-actions"
      );

      if (actions) {
        card.insertBefore(audit, actions);
      } else {
        card.appendChild(audit);
      }
    }

    if (deliveryStatus === "sending" || deliveryStatus === "unknown" || deliveryStatus === "rejected") {
      const label = deliveryStatus === "sending"
        ? "Remote email is processing — do not resend yet."
        : deliveryStatus === "unknown"
          ? "Remote delivery outcome uncertain — verify before reissuing."
          : "Email provider rejected the remote send — not recorded as sent.";
      audit.innerHTML = `
        <span>${esc(label)}</span>
        ${deliveryError ? `<span>Provider detail: ${esc(deliveryError)}</span>` : ""}
        ${contactEmail ? `<span>Proposal contact: <strong>${esc(contactEmail)}</strong></span>` : ""}
      `;
    } else if (sentTo) {
      audit.innerHTML = `
        <span class="proposal-email-audit__sent">Remote email accepted by provider ✓</span>
        <span>Sent to: <strong>${esc(sentTo)}</strong></span>
        <span>Sent: <strong>${esc(formatTimestamp(sentAt))}</strong></span>
        ${contactEmail && contactEmail !== sentTo
          ? `<span>Proposal contact: <strong>${esc(contactEmail)}</strong></span>`
          : ""}
      `;
    } else if (contactEmail) {
      audit.innerHTML = `
        <span>Proposal contact: <strong>${esc(contactEmail)}</strong></span>
        <span>Remote confirmation email has not been recorded as sent.</span>
      `;
    } else {
      audit.innerHTML = `
        <span><strong>No proposal contact email recorded.</strong></span>
      `;
    }
  } catch (error) {
    console.error(
      "[proposal-email-audit] unable to load recipient audit:",
      error
    );
  } finally {
    card.dataset.emailAuditLoading = "0";
  }
}

function hydrateVisibleCards() {
  document
    .querySelectorAll(".proposal-card[data-proposal-id]")
    .forEach((card) => hydrateCard(card));
}

ensureStyles();
hydrateVisibleCards();

const observer = new MutationObserver(() => {
  hydrateVisibleCards();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
