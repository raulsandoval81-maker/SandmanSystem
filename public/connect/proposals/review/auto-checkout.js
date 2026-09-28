const acceptButton =
  document.getElementById(
    "acceptProposalButton"
  );

const confirmation =
  document.getElementById(
    "confirmation"
  );

const confirmationTitle =
  document.getElementById(
    "confirmationTitle"
  );

const checkoutButton =
  document.getElementById(
    "continueCheckoutButton"
  );

let continueAfterAcceptance = false;
let checkoutStarted = false;

acceptButton?.addEventListener(
  "click",
  () => {
    continueAfterAcceptance = true;
  },
  true
);

function continueWhenReady() {
  if (
    !continueAfterAcceptance ||
    checkoutStarted ||
    !confirmation ||
    confirmation.hidden ||
    !checkoutButton ||
    confirmationTitle?.textContent?.trim() !==
      "Proposal Accepted"
  ) {
    return;
  }

  checkoutStarted = true;
  continueAfterAcceptance = false;
  checkoutButton.click();
}

if (confirmation) {
  const observer =
    new MutationObserver(
      continueWhenReady
    );

  observer.observe(
    confirmation,
    {
      attributes: true,
      attributeFilter: ["hidden"],
      childList: true,
      subtree: true
    }
  );
}
