const TEXT_REPLACEMENTS = new Map([
  ["Issue Client Review", "Send for Client Signature"],
  ["Reissue Client Review", "Resend Signature Request"],
  ["Approve & Begin Checkout", "Continue to Checkout"],
  ["Needs Review", "Ready for Client Signature"],
  ["Ready for Client Confirmation", "Ready for Client Signature"],
  ["Review — In Person", "Open for Signature — In Person"],
  ["Send for Review — Remote", "Send for Signature — Remote"],
  [
    "Family proposals waiting for review, changes, signature, or approval.",
    "Family proposals waiting for signature, requested changes, or checkout."
  ],
  [
    "Family proposals waiting for client confirmation, requested changes, signature, or Academy approval.",
    "Family proposals waiting for signature, requested changes, or checkout."
  ]
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
    message === "Client confirmation link (copied when browser permission allows):"
      ? "Client signature link (copied when browser permission allows):"
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
