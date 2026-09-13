import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const proposalId =
  String(
    params.get("proposalId") || ""
  ).trim();

const token =
  String(
    params.get("token") || ""
  ).trim();

const $ = (id) =>
  document.getElementById(id);

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  return "$" +
    Math.max(
      0,
      Math.round(
        Number(value) || 0
      )
    ).toLocaleString();
}

function formatDate(value = "") {
  if (!value) return "—";

  const date =
    new Date(
      `${value}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric"
    }
  );
}

function normalize(value = "") {
  return String(value)
    .trim()
    .toLowerCase();
}

function labelJourney(value = "") {
  const key =
    normalize(value)
      .replaceAll("-", "")
      .replaceAll("_", "");

  const labels = {
    zero2hero:
      "Road2Champion",

    road2champion:
      "Road2Champion",

    path2legend:
      "Path2Legend",

    quest2mastery:
      "Quest2Mastery",

    fitness:
      "Fitness"
  };

  return (
    labels[key] ||
    String(value) ||
    "—"
  );
}

function labelPlan(value = "") {
  const labels = {
    standard:
      "Combat",

    combo:
      "Combat + Fitness",

    fitness:
      "Fitness"
  };

  return (
    labels[normalize(value)] ||
    String(value) ||
    "Membership"
  );
}

function labelDiscipline(value = "") {
  const labels = {
    wrestling:
      "Wrestling",

    boxing:
      "Boxing",

    "muay-thai":
      "Muay Thai",

    muaythai:
      "Muay Thai"
  };

  return (
    labels[normalize(value)] ||
    String(value)
  );
}

function labelBilling(value = "") {
  const key =
    normalize(value);

  if (
    key === "annual" ||
    key === "12-month" ||
    key === "12_month"
  ) {
    return "12-month agreement + autopay";
  }

  if (
    key === "monthly" ||
    key === "month-to-month" ||
    key === "month_to_month"
  ) {
    return "Month-to-month";
  }

  return String(value) || "—";
}

function showMessage(
  message,
  error = false
) {
  const target =
    $("pageMessage");

  target.hidden = false;
  target.textContent =
    message;

  target.classList.toggle(
    "error",
    error
  );
}

function hideMessage() {
  $("pageMessage").hidden = true;
}

function renderAthletes(
  athletes = []
) {
  $("athletes").innerHTML =
    athletes.length
      ? athletes.map(
          (athlete = {}) => {
            const disciplines =
              Array.isArray(
                athlete.disciplines
              )
                ? athlete.disciplines
                    .map(
                      labelDiscipline
                    )
                    .join(" · ")
                : "";

            return `
              <article class="athlete-card">
                <h3>
                  ${esc(
                    athlete.name ||
                    "Athlete"
                  )}
                </h3>

                <p class="athlete-line">
                  ${esc(
                    labelJourney(
                      athlete.journey
                    )
                  )}
                </p>

                <p class="athlete-line">
                  ${esc(
                    labelPlan(
                      athlete.plan
                    )
                  )}
                  ${
                    disciplines
                      ? ` · ${esc(disciplines)}`
                      : ""
                  }
                </p>

                <p class="athlete-line">
                  ${esc(
                    labelBilling(
                      athlete.billingTerm
                    )
                  )}
                </p>
              </article>
            `;
          }
        ).join("")
      : `
          <p>
            No athlete membership information
            was included in this proposal.
          </p>
        `;
}

function scheduleItem(
  label,
  value
) {
  return `
    <div class="schedule-item">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </div>
  `;
}

function renderProposal(
  proposal = {}
) {
  const prospect =
    proposal.prospect || {};

  const pricing =
    proposal.pricing || {};

  const familyName =
    prospect.familyName ||
    "Family Proposal";

  $("proposalNumber").textContent =
    `Membership Proposal · ${proposalId}`;

  $("familyName").textContent =
    familyName;

  $("proposalFamilyName").textContent =
    familyName;

  $("dueNow").textContent =
    money(
      pricing.dueNow
    );

  $("monthlyMembership").textContent =
    `${money(
      pricing.monthlyBalance
    )}/month`;

  $("annualRenewal").textContent =
    `${money(
      pricing.annualRenewal
    )}/year`;

  renderAthletes(
    Array.isArray(
      proposal.athletes
    )
      ? proposal.athletes
      : []
  );

  const firstMonth =
    pricing.paymentStartMode ===
    "deferred"
      ? "Deferred to next billing cycle"
      : `${money(
          pricing.proratedFirstMonth
        )} (${Number(
          pricing.prorationPercent ||
          0
        )}%)`;

  $("paymentSchedule").innerHTML =
    [
      scheduleItem(
        "Membership start",
        formatDate(
          pricing.membershipStartDate
        )
      ),

      scheduleItem(
        "Enrollment package",
        `${
          pricing.enrollmentPackageName ||
          "Enrollment package"
        } · ${money(
          pricing.enrollmentDueNow
        )}`
      ),

      scheduleItem(
        "First-month membership",
        firstMonth
      ),

      scheduleItem(
        "Total due now",
        money(
          pricing.dueNow
        )
      ),

      scheduleItem(
        "Regular monthly membership",
        `${money(
          pricing.monthlyBalance
        )}/month`
      ),

      scheduleItem(
        "First recurring charge",
        formatDate(
          pricing.firstRecurringChargeDate
        )
      ),

      scheduleItem(
        "Recurring billing",
        `${
          pricing.recurringBillingDay ||
          5
        }th of each month`
      ),

      scheduleItem(
        "Next annual package",
        `${
          pricing.renewalPackageName ||
          "Renewal package"
        } · ${money(
          pricing.annualRenewal
        )}/year`
      )
    ].join("");
}

function showConfirmation(
  title,
  text
) {
  $("proposalContent").hidden =
    true;

  $("confirmation").hidden =
    false;

  $("confirmationTitle").textContent =
    title;

  $("confirmationText").textContent =
    text;

  $("proposalStatus").textContent =
    title;
}

async function loadProposal() {
  if (
    !proposalId ||
    !token
  ) {
    throw new Error(
      "This proposal review link is incomplete."
    );
  }

  const getReview =
    httpsCallable(
      functions,
      "getProposalClientReview"
    );

  const response =
    await getReview({
      proposalId,
      token
    });

  const data =
    response.data || {};

  if (!data.proposal) {
    throw new Error(
      "Proposal details are unavailable."
    );
  }

  renderProposal(
    data.proposal
  );

  if (data.signed) {
    showConfirmation(
      "Proposal Accepted",
      "Thank you. Your signed proposal has been returned to Sandman Academy for final approval. Checkout will follow after Academy approval."
    );

    return;
  }

  if (
    data.changesRequested
  ) {
    showConfirmation(
      "Changes Requested",
      "Your request has been sent to Sandman Academy. The Academy will prepare an updated proposal for you to review."
    );

    return;
  }

  $("proposalStatus").textContent =
    "Ready for Your Review";
}

async function acceptProposal() {
  hideMessage();

  const signerRole =
    $("signerRole").value;

  const signerName =
    $("signerName")
      .value
      .trim();

  const signature =
    $("signature")
      .value
      .trim();

  const consentAccepted =
    $("consentAccepted")
      .checked;

  if (
    !signerRole ||
    !signerName ||
    !signature ||
    !consentAccepted
  ) {
    showMessage(
      "Complete the signer relationship, legal name, signature, and acceptance checkbox before continuing.",
      true
    );

    return;
  }

  const button =
    $("acceptProposalButton");

  button.disabled =
    true;

  button.textContent =
    "Submitting…";

  try {
    const accept =
      httpsCallable(
        functions,
        "acceptProposalClientReview"
      );

    const response =
      await accept({
        proposalId,
        token,
        signerRole,
        signerName,
        signature,
        consentAccepted
      });

    if (
      response.data?.status !==
      "CLIENT_SIGNED"
    ) {
      throw new Error(
        "The signed status was not returned."
      );
    }

    showConfirmation(
      "Proposal Accepted",
      "Thank you. Your signed proposal has been returned to Sandman Academy for final approval. Checkout will follow after Academy approval."
    );
  } catch (error) {
    console.error(
      "Proposal acceptance failed:",
      error
    );

    button.disabled =
      false;

    button.textContent =
      "Sign & Accept Proposal";

    showMessage(
      error?.message ||
      "Unable to accept the proposal.",
      true
    );
  }
}

async function requestChanges() {
  hideMessage();

  const message =
    $("changeRequestMessage")
      .value
      .trim();

  if (message.length < 3) {
    showMessage(
      "Tell us what you would like changed before sending your request.",
      true
    );

    return;
  }

  const button =
    $("sendChangeRequestButton");

  button.disabled =
    true;

  button.textContent =
    "Sending…";

  try {
    const requestChangesCall =
      httpsCallable(
        functions,
        "requestProposalClientChanges"
      );

    const response =
      await requestChangesCall({
        proposalId,
        token,
        message
      });

    if (
      response.data?.status !==
      "CLIENT_CHANGES_REQUESTED"
    ) {
      throw new Error(
        "The change-request status was not returned."
      );
    }

    showConfirmation(
      "Changes Requested",
      "Your request has been sent to Sandman Academy. The Academy will prepare an updated proposal for you to review."
    );
  } catch (error) {
    console.error(
      "Proposal change request failed:",
      error
    );

    button.disabled =
      false;

    button.textContent =
      "Send Change Request";

    showMessage(
      error?.message ||
      "Unable to send your change request.",
      true
    );
  }
}

$("acceptProposalButton")
  .addEventListener(
    "click",
    acceptProposal
  );

$("requestChangesButton")
  .addEventListener(
    "click",
    () => {
      $("changeRequestPanel")
        .hidden = false;

      $("changeRequestMessage")
        .focus();
    }
  );

$("cancelChangeRequestButton")
  .addEventListener(
    "click",
    () => {
      $("changeRequestPanel")
        .hidden = true;
    }
  );

$("sendChangeRequestButton")
  .addEventListener(
    "click",
    requestChanges
  );

$("printProposalButton")
  .addEventListener(
    "click",
    () => window.print()
  );

loadProposal().catch(
  (error) => {
    console.error(
      "Unable to load client proposal:",
      error
    );

    $("proposalContent").hidden =
      true;

    $("proposalStatus")
      .textContent =
      "Link Unavailable";

    $("proposalStatus")
      .classList
      .add("error");

    showMessage(
      error?.message ||
      "This proposal review link is unavailable.",
      true
    );
  }
);
