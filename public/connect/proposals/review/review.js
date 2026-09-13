import {
  auth,
  db,
  functions,
  httpsCallable,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  renderManagementLifecycle
} from "/assets/js/management-lifecycle.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const proposalId =
  String(
    params.get("proposalId") || ""
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
      Math.round(Number(value) || 0)
    ).toLocaleString();
}

function formatDate(value = "") {
  if (!value) return "—";

  const date =
    new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
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

function labelPlan(value = "") {
  const labels = {
    standard: "Combat",
    combo: "Combat + Fitness",
    fitness: "Fitness"
  };

  return labels[value] || value || "Membership";
}

function labelJourney(value = "") {
  const labels = {
    Zero2Hero: "Road2Champion",
    Road2Champion: "Road2Champion",
    Path2Legend: "Path2Legend",
    Quest2Mastery: "Quest2Mastery",
    Fitness: "Fitness"
  };

  return labels[value] || value || "—";
}

function labelDiscipline(value = "") {
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
    muaythai: "Muay Thai"
  };

  return labels[value] || value;
}

function setStatus(
  message = "",
  error = false
) {
  const target =
    $("reviewStatus");

  if (!target) return;

  target.textContent =
    message;

  target.classList.toggle(
    "status-error",
    error
  );
}

async function requireStaffSession() {
  if (
    typeof auth.authStateReady ===
    "function"
  ) {
    await auth.authStateReady();
  }

  if (auth.currentUser) {
    return auth.currentUser;
  }

  const returnUrl =
    window.location.pathname +
    window.location.search;

  window.location.assign(
    "/management/auth/?returnUrl=" +
    encodeURIComponent(returnUrl)
  );

  return null;
}

function renderLifecycle(status = "REVIEW") {
  const normalized =
    String(status || "REVIEW")
      .toUpperCase();

  const states = {
    REVIEW: {
      currentStage: "review",
      completedThrough:
        "prospect-builder"
    },

    APPROVED: {
      currentStage: "approval",
      completedThrough: "review"
    },

    READY_FOR_CHECKOUT: {
      currentStage: "checkout",
      completedThrough: "approval"
    },

    CHECKOUT_CREATED: {
      currentStage: "checkout",
      completedThrough: "approval"
    },

    PAYMENT_PENDING: {
      currentStage: "checkout",
      completedThrough: "approval"
    },

    PAID: {
      currentStage: "enrollment",
      completedThrough: "checkout"
    }
  };

  const state =
    states[normalized] ||
    states.REVIEW;

  renderManagementLifecycle(
    $("reviewLifecycle"),
    {
      ...state,

      currentLabel:
        normalized === "REVIEW"
          ? "Proposal Review"
          : normalized
              .replaceAll("_", " "),

      caseLabel:
        proposalId,

      guidance:
        normalized === "REVIEW"
          ? "Review the proposal, then approve it when the offer is ready."
          : "Continue with the next proposal stage."
    }
  );
}

function athleteMarkup(
  athlete = {}
) {
  const disciplines =
    Array.isArray(
      athlete.disciplines
    )
      ? athlete.disciplines
          .map(labelDiscipline)
          .join(" + ")
      : "";

  const commitment =
    athlete.billingTerm === "annual"
      ? "12-month agreement + autopay"
      : athlete.billingTerm === "monthly"
        ? "Month-to-month"
        : athlete.billingTerm || "—";

  return `
    <article class="review-athlete">
      <h3>
        ${esc(
          athlete.name ||
          "Athlete"
        )}
      </h3>

      <p>
        <strong>Journey:</strong>
        ${esc(
          labelJourney(
            athlete.journey
          )
        )}
      </p>

      <p>
        <strong>Membership:</strong>
        ${esc(
          labelPlan(
            athlete.plan
          )
        )}
      </p>

      ${
        disciplines
          ? `
            <p>
              <strong>Discipline:</strong>
              ${esc(disciplines)}
            </p>
          `
          : ""
      }

      <p>
        <strong>Billing:</strong>
        ${esc(commitment)}
      </p>
    </article>
  `;
}

async function loadProposal() {
  const user =
    await requireStaffSession();

  if (!user) return;

  if (!proposalId) {
    setStatus(
      "No proposal ID was supplied.",
      true
    );

    return;
  }

  const snapshot =
    await getDoc(
      doc(
        db,
        "proposals",
        proposalId
      )
    );

  if (!snapshot.exists()) {
    setStatus(
      `Proposal ${proposalId} was not found.`,
      true
    );

    return;
  }

  const proposal =
    snapshot.data() || {};

  const status =
    String(
      proposal.status || ""
    ).toUpperCase();

  const prospect =
    proposal.prospect || {};

  const coach =
    proposal.coach || {};

  const pricing =
    proposal.pricing || {};

  const athletes =
    Array.isArray(
      proposal.athletes
    )
      ? proposal.athletes
      : [];

  renderLifecycle(status);

  $("proposalIdLabel").textContent =
    proposalId;

  $("familyName").textContent =
    prospect.familyName ||
    "Unnamed Family";

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

  $("athletes").innerHTML =
    athletes.length
      ? athletes
          .map(athleteMarkup)
          .join("")
      : "<p>No athletes found.</p>";

  $("agreement").innerHTML = `
    <p>
      <strong>
        Enrollment package:
      </strong>
      ${esc(
        pricing.enrollmentPackageName ||
        "—"
      )}
      — ${money(
        pricing.enrollmentDueNow
      )}
    </p>

    <p>
      <strong>
        First-month membership:
      </strong>
      ${
        pricing.paymentStartMode ===
        "deferred"
          ? "Deferred"
          : `${money(
              pricing.proratedFirstMonth
            )} (${Number(
              pricing.prorationPercent ||
              0
            )}%)`
      }
    </p>

    <p>
      <strong>
        Total due now:
      </strong>
      ${money(
        pricing.dueNow
      )}
    </p>

    <p>
      <strong>
        Regular monthly membership:
      </strong>
      ${money(
        pricing.monthlyBalance
      )}/month
    </p>

    <p>
      <strong>
        Membership start:
      </strong>
      ${esc(
        formatDate(
          pricing.membershipStartDate
        )
      )}
    </p>

    <p>
      <strong>
        First recurring charge:
      </strong>
      ${esc(
        formatDate(
          pricing.firstRecurringChargeDate
        )
      )}
    </p>

    <p>
      <strong>
        Recurring billing:
      </strong>
      ${
        pricing.recurringBillingDay ||
        5
      }th of each month
    </p>

    <p>
      <strong>
        ${
          esc(
            pricing.renewalPackageName ||
            "Renewal package"
          )
        }:
      </strong>
      ${money(
        pricing.annualRenewal
      )}/year
    </p>

    <p>
      <strong>
        Prepared by:
      </strong>
      ${esc(
        coach.name ||
        "—"
      )}
    </p>
  `;

  $("recommendation").textContent =
    proposal.internalNotes ||
    "No management recommendation entered.";

  const approveButton =
    $("approveProposalButton");

  approveButton.hidden =
    status !== "REVIEW";

  approveButton.disabled =
    status !== "REVIEW";

  if (status === "REVIEW") {
    setStatus(
      "Proposal submitted and ready for review."
    );
  } else {
    setStatus(
      `Proposal status: ${status || "UNKNOWN"}.`
    );
  }
}

$("printProposalButton")
  ?.addEventListener(
    "click",
    () => window.print()
  );

$("approveProposalButton")
  ?.addEventListener(
    "click",
    async () => {
      const confirmed =
        window.confirm(
          `Approve ${proposalId}? ` +
          "This will move the proposal to Checkout Ready."
        );

      if (!confirmed) {
        return;
      }

      const button =
        $("approveProposalButton");

      button.disabled = true;
      button.textContent =
        "Approving…";

      try {
        const approve =
          httpsCallable(
            functions,
            "approveProposal"
          );

        const response =
          await approve({
            proposalId
          });

        if (
          response.data?.status !==
          "READY_FOR_CHECKOUT"
        ) {
          throw new Error(
            "READY_FOR_CHECKOUT status was not returned."
          );
        }

        window.location.assign(
          "/connect/proposals/"
        );
      } catch (error) {
        console.error(
          "Proposal approval failed:",
          error
        );

        button.disabled = false;
        button.textContent =
          "Approve Proposal";

        setStatus(
          error?.message ||
          "Unable to approve proposal.",
          true
        );
      }
    }
  );

loadProposal().catch(
  (error) => {
    console.error(
      "Unable to load proposal review:",
      error
    );

    setStatus(
      error?.message ||
      "Unable to load proposal review.",
      true
    );
  }
);
