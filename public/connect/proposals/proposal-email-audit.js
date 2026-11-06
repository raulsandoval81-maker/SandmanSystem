import {
  db,
  doc,
  getDoc,
  functions,
  httpsCallable
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
    const issuedAtMs = typeof review.issuedAt?.toMillis === "function"
      ? review.issuedAt.toMillis() : 0;
    const unresolved = deliveryStatus === "sending" || deliveryStatus === "unknown";
    const canRecover = unresolved && issuedAtMs > 0 &&
      (deliveryStatus !== "sending" || Date.now() - issuedAtMs >= 10 * 60 * 1000);
    const actions = card.querySelector(".proposal-card-actions");
    if (actions) {
      // No alternative issuance bypass while email provider outcome is unresolved.
      actions.querySelectorAll('[data-proposal-action="open-client-review"], [data-proposal-action="email-client-review"], [data-proposal-action="copy-client-review"]')
        .forEach((button) => { button.disabled = unresolved; });
      let recoveryButton = actions.querySelector("[data-delivery-recovery]");
      if (!unresolved) {
        recoveryButton?.remove();
      } else if (!recoveryButton) {
        recoveryButton = document.createElement("button");
        recoveryButton.type = "button";
        recoveryButton.className = "proposal-open-btn";
        recoveryButton.dataset.deliveryRecovery = "true";
        recoveryButton.textContent = "Reconcile & Reissue Remote Review";
        actions.appendChild(recoveryButton);
        recoveryButton.addEventListener("click", async () => {
          if (!window.confirm("Check your email provider records before continuing. An earlier review email may have reached the family. Reissuing REVOKES its secure link. Have you checked the provider outcome?")) return;
          const evidence = window.prompt("Record what you checked in the provider, when, and why reissue is required (at least 30 characters):");
          if (evidence === null || evidence.trim().length < 30) {
            window.alert("A detailed provider reconciliation record is required.");
            return;
          }
          if (!window.confirm("REVOKE the earlier secure review link and EMAIL one replacement to the proposal contact? The previous link will no longer work.")) return;
          recoveryButton.disabled = true;
          const label = recoveryButton.textContent;
          recoveryButton.textContent = "Reissuing…";
          try {
            const send = httpsCallable(functions, "issueProposalClientReview");
            const result = await send({
              proposalId,
              delivery: "email",
              deliveryRecovery: {
                providerChecked: true,
                acknowledgeRevocation: true,
                evidence: evidence.trim(),
                expectedIssuedAtMs: issuedAtMs,
              },
            });
            window.alert("New review accepted by email provider for " +
              (result.data?.recipient || "the family") + ". Inbox delivery is not confirmed. The old link is revoked.");
            window.location.reload();
          } catch (error) {
            window.alert(error?.message || "Reissue failed; verify the recorded delivery state.");
            recoveryButton.disabled = false;
            recoveryButton.textContent = label;
          }
        });
      }
      if (recoveryButton) {
        recoveryButton.disabled = !canRecover;
        recoveryButton.title = canRecover
          ? "Provider reconciliation and explicit link revocation are required."
          : "Delivery is still processing. Reconciliation is available after ten minutes.";
      }
    }

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
