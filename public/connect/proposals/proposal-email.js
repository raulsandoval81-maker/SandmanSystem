import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const ELIGIBLE_STATUSES =
  new Set([
    "REVIEW"
  ]);

function ensureStyles() {
  if (
    document.getElementById(
      "proposalEmailStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "proposalEmailStyles";

  style.textContent = `
    .proposal-send-review-btn{
      border-color:var(--management-border-strong);
      background:var(--management-surface);
      color:var(--management-text);
    }

    .proposal-send-review-btn:hover,
    .proposal-send-review-btn:focus-visible{
      border-color:var(--management-gold);
      background:var(--management-gold-soft);
      color:var(--management-text);
    }
  `;

  document.head.appendChild(style);
}

function addSendButtons() {
  document
    .querySelectorAll(".proposal-card")
    .forEach((card) => {
      const status =
        String(
          card.dataset.status || ""
        ).trim();

      if (!ELIGIBLE_STATUSES.has(status)) {
        return;
      }

      const actions =
        card.querySelector(
          ".proposal-card-actions"
        );

      if (
        !actions ||
        actions.querySelector(
          "[data-send-client-review]"
        )
      ) {
        return;
      }

      const proposalId =
        String(
          card.dataset.proposalId || ""
        ).trim();

      if (!proposalId) {
        return;
      }

      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        "proposal-open-btn proposal-send-review-btn";
      button.dataset.sendClientReview =
        proposalId;
      button.textContent =
        "Send Remote Confirmation";

      const deleteButton =
        actions.querySelector(
          ".proposal-delete-test-btn"
        );

      actions.insertBefore(
        button,
        deleteButton || null
      );
    });
}

async function sendReview(button) {
  const proposalId =
    String(
      button.dataset.sendClientReview || ""
    ).trim();

  if (!proposalId) {
    return;
  }

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "Sending…";

  try {
    const issueReview =
      httpsCallable(
        functions,
        "issueProposalClientReview"
      );

    const response =
      await issueReview({
        proposalId,
        delivery: "email"
      });

    const recipient =
      String(
        response.data?.recipient || ""
      ).trim();

    window.alert(
      recipient
        ? `Final confirmation sent to ${recipient}.`
        : "Final confirmation sent."
    );

    window.location.reload();
  } catch (error) {
    console.error(
      "[proposals] final confirmation email failed:",
      error
    );

    button.disabled = false;
    button.textContent =
      originalText;

    window.alert(
      error?.message ||
      "Unable to send the final confirmation email."
    );
  }
}

ensureStyles();
addSendButtons();

const observer =
  new MutationObserver(
    addSendButtons
  );

observer.observe(
  document.body,
  {
    childList: true,
    subtree: true
  }
);

document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-send-client-review]"
      );

    if (!button) {
      return;
    }

    event.preventDefault();
    sendReview(button);
  }
);
