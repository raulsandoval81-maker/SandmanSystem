const TEXT_REPLACEMENTS = new Map([
  ["Issue Client Review", "Send Remote Confirmation"],
  ["Reissue Client Review", "Resend Remote Confirmation"],
  ["Approve & Begin Checkout", "Continue to Checkout"],
  ["Needs Review", "Ready for Final Confirmation"],
  ["Ready for Client Confirmation", "Ready for Final Confirmation"],
  ["Ready for Client Signature", "Ready for Final Confirmation"],
  ["Awaiting Client Signature", "Awaiting Final Confirmation"],
  ["Client Signed", "Final Confirmation Complete"],
  ["Review — In Person", "In-Person Confirm → Stripe"],
  ["Open for Signature — In Person", "In-Person Confirm → Stripe"],
  ["Send for Review — Remote", "Remote Confirm → Stripe"],
  ["Send for Signature — Remote", "Remote Confirm → Stripe"],
  [
    "Family proposals waiting for review, changes, signature, or approval.",
    "Family proposals waiting for final confirmation, requested changes, or checkout."
  ],
  [
    "Family proposals waiting for client confirmation, requested changes, signature, or Academy approval.",
    "Family proposals waiting for final confirmation, requested changes, or checkout."
  ],
  [
    "Family proposals waiting for signature, requested changes, or checkout.",
    "Family proposals waiting for final confirmation, requested changes, or checkout."
  ],
  ["Ready for Client Signature", "Ready for Final Confirmation"]
]);

function normalizeProposalLanguage(root = document) {
  root
    .querySelectorAll(
      ".proposal-open-btn, .proposal-status, .proposal-group-head span, .proposal-count small"
    )
    .forEach((element) => {
      const current = String(element.textContent || "").trim();
      const replacement = TEXT_REPLACEMENTS.get(current);

      if (replacement) {
        element.textContent = replacement;
      }
    });
}

const originalPrompt = window.prompt.bind(window);

window.prompt = (message, defaultValue) => {
  const nextMessage =
    message === "Client review link (copied when browser permission allows):" ||
    message === "Client confirmation link (copied when browser permission allows):" ||
    message === "Client signature link (copied when browser permission allows):"
      ? "Final confirmation link (copied when browser permission allows):"
      : message;

  return originalPrompt(nextMessage, defaultValue);
};

normalizeProposalLanguage();

const observer = new MutationObserver(() => {
  normalizeProposalLanguage();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
