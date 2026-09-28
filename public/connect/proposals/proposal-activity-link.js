function addActivityLinks() {
  const cards = Array.from(
    document.querySelectorAll(
      ".proposal-card"
    )
  );

  if (!cards.length) {
    return false;
  }

  cards.forEach((card) => {
    const proposalId = String(
      card.dataset.proposalId || ""
    ).trim();

    if (!proposalId) {
      return;
    }

    const actions =
      card.querySelector(
        ".proposal-card-actions"
      );

    if (!actions) {
      return;
    }

    if (
      actions.querySelector(
        "[data-view-proposal-activity]"
      )
    ) {
      return;
    }

    const link =
      document.createElement("a");

    link.className =
      "proposal-open-btn";

    link.dataset.viewProposalActivity =
      proposalId;

    link.href =
      "/connect/proposals/activity/" +
      `?proposalId=${encodeURIComponent(
        proposalId
      )}`;

    link.textContent =
      "View Activity";

    actions.appendChild(link);
  });

  return true;
}

let attempts = 0;
const maxAttempts = 20;

const timer = window.setInterval(
  () => {
    attempts += 1;

    const installed =
      addActivityLinks();

    if (
      installed ||
      attempts >= maxAttempts
    ) {
      window.clearInterval(timer);
    }
  },
  250
);

addActivityLinks();
