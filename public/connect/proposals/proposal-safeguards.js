import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const reopenProposal =
  httpsCallable(
    functions,
    "returnProposalToDraft"
  );

const issueProposalClientReview =
  httpsCallable(
    functions,
    "issueProposalClientReview"
  );

const recordManualProposalSignature =
  httpsCallable(
    functions,
    "recordManualProposalSignature"
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

      // Destructive test deletion does not belong in the live workflow.
      // Production mistakes use Correct Proposal so history is preserved.
      actions
        .querySelectorAll("[data-delete-test-proposal]")
        .forEach((button) => button.remove());

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
            "Resend Remote Confirmation";

          issueButton.title =
            "Send another remote confirmation email to the proposal contact. The send is recorded in Activity.";

          issueButton.addEventListener(
            "click",
            async (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();

              const confirmed =
                window.confirm(
                  `Send another remote confirmation for ${proposalId}?\n\nThe email will be sent to the authoritative proposal contact and recorded in Activity.`
                );

              if (!confirmed) {
                return;
              }

              const originalText =
                issueButton.textContent;

              issueButton.disabled = true;
              issueButton.textContent =
                "Sending…";

              try {
                const response =
                  await issueProposalClientReview({
                    proposalId,
                    delivery: "email"
                  });

                const recipient =
                  clean(
                    response.data?.recipient
                  );

                window.alert(
                  recipient
                    ? `Remote confirmation sent to ${recipient}.`
                    : "Remote confirmation sent."
                );

                window.location.reload();
              } catch (error) {
                console.error(
                  "Proposal resend failed:",
                  error
                );

                window.alert(
                  error?.message ||
                  "The remote confirmation could not be sent."
                );

                issueButton.disabled = false;
                issueButton.textContent =
                  originalText;
              }
            },
            true
          );
        }

        if (
          !actions.querySelector(
            '[data-record-manual-signature], [data-proposal-action="record-manual-signature"]'
          )
        ) {
          const manualButton =
            document.createElement("button");

          manualButton.type = "button";
          manualButton.className =
            "proposal-open-btn";
          manualButton.dataset.recordManualSignature =
            proposalId;
          manualButton.textContent =
            "Record Manual Signature";
          manualButton.title =
            "Use when the family already signed a paper/manual form. Records the signature in Activity and moves the proposal to Checkout Ready.";

          manualButton.addEventListener(
            "click",
            async () => {
              const signerName =
                clean(
                  window.prompt(
                    "Name shown on the signed paper form:"
                  )
                );

              if (!signerName) {
                return;
              }

              const signerChoice =
                clean(
                  window.prompt(
                    "Signer relationship: type P for Parent/Guardian or A for Adult Athlete.",
                    "P"
                  )
                ).toUpperCase();

              const signerRole =
                signerChoice === "A"
                  ? "adult_athlete"
                  : signerChoice === "P"
                    ? "parent_guardian"
                    : "";

              if (!signerRole) {
                window.alert(
                  "Use P for Parent/Guardian or A for Adult Athlete."
                );
                return;
              }

              const confirmed =
                window.confirm(
                  `Confirm that the signed paper/manual form for ${proposalId} is on file.\n\nThis records the client signature and moves the proposal to Checkout Ready.`
                );

              if (!confirmed) {
                return;
              }

              const originalText =
                manualButton.textContent;

              manualButton.disabled = true;
              manualButton.textContent =
                "Recording…";

              try {
                await recordManualProposalSignature({
                  proposalId,
                  signerName,
                  signerRole
                });

                window.alert(
                  `${proposalId} manual signature recorded. The proposal is now Checkout Ready.`
                );

                window.location.reload();
              } catch (error) {
                console.error(
                  "Manual proposal signature failed:",
                  error
                );

                window.alert(
                  error?.message ||
                  "The manual signature could not be recorded."
                );

                manualButton.disabled = false;
                manualButton.textContent =
                  originalText;
              }
            }
          );

          actions.appendChild(
            manualButton
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
            "Proposal issued ✓ Awaiting final confirmation.";

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
              `Reopen ${proposalId} as a draft?\n\nThe current confirmation link will stop working. Existing history will be preserved.\n\nReason: ${reason}`
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
              originalText;
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
