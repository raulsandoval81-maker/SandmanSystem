import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const reopenProposal =
  httpsCallable(
    functions,
    "returnProposalToDraft"
  );

function clean(value = "") {
  return String(value || "").trim();
}

function addSafeguards() {
  document
    .querySelectorAll(".proposal-card")
    .forEach((card) => {
      const status =
        clean(card.dataset.status)
          .toUpperCase();

      const proposalId =
        clean(card.dataset.proposalId) ||
        clean(
          card.querySelector("[data-proposal-id]")
            ?.dataset.proposalId
        );

      const actions =
        card.querySelector(
          ".proposal-card-actions"
        );

      if (!proposalId || !actions) {
        return;
      }

      if (
        status === "AWAITING_CLIENT_SIGNATURE"
      ) {
        const issueButton =
          actions.querySelector(
            '[data-proposal-action="issue-client-review"]'
          );

        if (
          issueButton &&
          !issueButton.dataset.repeatGuardInstalled
        ) {
          issueButton.dataset.repeatGuardInstalled =
            "true";

          issueButton.textContent =
            "Resend Signature Request";

          issueButton.title =
            "Use only when the family needs another signature request. The prior send remains in Activity.";

          issueButton.addEventListener(
            "click",
            (event) => {
              const confirmed =
                window.confirm(
                  `A signature request was already issued for ${proposalId}.\n\nSend another request?\n\nCancel is the safe choice unless the family actually needs a resend.`
                );

              if (!confirmed) {
                event.preventDefault();
                event.stopImmediatePropagation();
              }
            },
            true
          );
        }

        if (
          !actions.querySelector(
            "[data-proposal-affirmation]"
          )
        ) {
          const note =
            document.createElement("span");

          note.dataset.proposalAffirmation =
            "true";

          note.className =
            "proposal-action-note";

          note.textContent =
            "Proposal issued ✓ Awaiting family signature.";

          actions.prepend(note);
        }
      }

      if (
        ![
          "REVIEW",
          "AWAITING_CLIENT_SIGNATURE"
        ].includes(status)
      ) {
        return;
      }

      if (
        actions.querySelector(
          "[data-correct-proposal]"
        )
      ) {
        return;
      }

      const correctButton =
        document.createElement("button");

      correctButton.type = "button";
      correctButton.className =
        "proposal-open-btn";
      correctButton.dataset.correctProposal =
        proposalId;
      correctButton.textContent =
        "Correct Proposal";
      correctButton.title =
        "Reopen this proposal as a draft when Management finds a real mistake. The correction is recorded in Activity.";

      correctButton.addEventListener(
        "click",
        async () => {
          const reason =
            clean(
              window.prompt(
                `Why does ${proposalId} need to be corrected?\n\nThis reason will be preserved in the proposal history.`
              )
            );

          if (!reason) {
            return;
          }

          if (reason.length < 8) {
            window.alert(
              "Please enter a clear correction reason of at least 8 characters."
            );
            return;
          }

          const confirmed =
            window.confirm(
              `Reopen ${proposalId} as a draft?\n\nThe current signature link will stop working. Existing history will be preserved.\n\nReason: ${reason}`
            );

          if (!confirmed) {
            return;
          }

          correctButton.disabled = true;
          correctButton.textContent =
            "Reopening…";

          try {
            await reopenProposal({
              proposalId,
              reason
            });

            window.alert(
              `${proposalId} reopened as a draft. The correction was recorded in Activity.`
            );

            window.location.href =
              `/connect/admissions/calculator/?proposalId=${encodeURIComponent(proposalId)}`;
          } catch (error) {
            console.error(
              "Proposal correction failed:",
              error
            );

            window.alert(
              error?.message ||
              "The proposal could not be reopened."
            );

            correctButton.disabled = false;
            correctButton.textContent =
              "Correct Proposal";
          }
        }
      );

      actions.appendChild(correctButton);
    });
}

addSafeguards();

const observer =
  new MutationObserver(addSafeguards);

observer.observe(
  document.body,
  {
    childList: true,
    subtree: true
  }
);
