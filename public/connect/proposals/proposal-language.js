const TEXT_REPLACEMENTS = new Map([
  ["Issue Client Review", "Send for Client Confirmation"],
  ["Reissue Client Review", "Resend Client Confirmation"],
  ["Needs Review", "Ready for Client Confirmation"],
  [
    "Family proposals waiting for review, changes, signature, or approval.",
    "Family proposals waiting for client confirmation, requested changes, signature, or Academy approval."
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
    message === "Client review link (copied when browser permission allows):"
      ? "Client confirmation link (copied when browser permission allows):"
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
