import {
  db,
  functions,
  httpsCallable,
  collection,
  getDocs,
  query,
  where
} from "/assets/js/firebase-init.js";

import {
  requireManagement,
  managementLoginUrl
} from "/management/shared/guards/management-guard.js";

const billingStatus =
  document.getElementById("billingStatus");

const billingQueue =
  document.getElementById("billingQueue");

const billingSearch =
  document.getElementById("billingSearch");

const refreshBilling =
  document.getElementById("refreshBilling");

const billingVisibleCount =
  document.getElementById(
    "billingVisibleCount"
  );

const countNeedsAction =
  document.getElementById(
    "countNeedsAction"
  );

const countWaiting =
  document.getElementById(
    "countWaiting"
  );

const countPaidReady =
  document.getElementById(
    "countPaidReady"
  );

const countClosed =
  document.getElementById(
    "countClosed"
  );

let managementContext = null;
let billingItems = [];
let activeView = "NEEDS_ACTION";

const recordPrepaidCashCall =
  httpsCallable(
    functions,
    "recordProposalPrepaidCash"
  );

const recordPriorPaymentCall =
  httpsCallable(
    functions,
    "recordProposalPriorPayment"
  );

const createAutopaySetupCall =
  httpsCallable(
    functions,
    "createProposalAutopaySetup"
  );

const clean = (value) =>
  String(value ?? "").trim();

const upper = (value) =>
  clean(value).toUpperCase();

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(
  message = "",
  isError = false
) {
  billingStatus.textContent = message;

  billingStatus.classList.toggle(
    "is-error",
    isError
  );
}

function timestampMillis(value) {
  if (!value) return 0;

  if (
    typeof value?.toMillis === "function"
  ) {
    return value.toMillis();
  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDate(value) {
  const millis =
    timestampMillis(value);

  if (!millis) return "—";

  return new Date(
    millis
  ).toLocaleString();
}

function moneyFromDollars(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD"
    }
  ).format(amount);
}

function moneyFromCents(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return moneyFromDollars(
    amount / 100
  );
}

function proposalName(proposal) {
  return (
    clean(
      proposal.prospect?.familyName
    ) ||
    clean(
      proposal.prospect
        ?.primaryContactName
    ) ||
    clean(
      proposal.athletes?.[0]?.name
    ) ||
    clean(proposal.proposalId) ||
    clean(proposal.id) ||
    "Proposal"
  );
}

function proposalAmount(proposal) {
  const candidates = [
    proposal.lockedSnapshot
      ?.pricing?.dueNow,

    proposal.pricing?.dueNow,

    proposal.pricing
      ?.dueAtEnrollment,

    proposal.dueNow,

    proposal.dueAtEnrollment,

    proposal.amountDue
  ];

  const found =
    candidates.find(
      (value) =>
        Number.isFinite(
          Number(value)
        )
    );

  return found === undefined
    ? "—"
    : moneyFromDollars(found);
}

function isClosedPass(message) {
  return [
    message.status,
    message.messageStatus,
    message.routingStage
  ].some(
    (value) =>
      upper(value) === "CLOSED"
  );
}

function classifyProposal(
  proposal,
  intake
) {
  const status =
    upper(proposal.status);

  if (
    ![
      "AWAITING_CLIENT_SIGNATURE",
      "READY_FOR_CHECKOUT",
      "CHECKOUT_CREATED",
      "PAYMENT_PENDING",
      "CASH_PREPAID_AUTOPAY_REQUIRED",
      "PAID",
      "VOID"
    ].includes(status)
  ) {
    return null;
  }

  const billingFollowUpStatus =
    upper(
      proposal.billingFollowUpStatus
    );

  if (
    status ===
    "AWAITING_CLIENT_SIGNATURE"
  ) {
    const membershipChoiceActive =
      proposal
        .membershipChoiceRequest
        ?.active === true;

    const priorPayments =
      Array.isArray(
        proposal.priorPayments
      )
        ? proposal.priorPayments
        : [];

    if (membershipChoiceActive) {
      return {
        view: "NEEDS_ACTION",
        state: "Membership Choice Pending",
        next: "Waiting for the family to choose a membership option."
      };
    }

    return {
      view: "NEEDS_ACTION",
      state: "Client Review",
      next:
        priorPayments.length > 0
          ? "Family review remains pending."
          : "Record prior payment if applicable; family review remains pending."
    };
  }

  if (
    billingFollowUpStatus ===
    "AUTOPAY_SETUP_REQUIRED"
  ) {
    return {
      view: "NEEDS_ACTION",
      state: "Cash Prepaid",
      next: "Set up Stripe autopay"
    };
  }

  if (status === "VOID") {
    return {
      view: "CLOSED",
      state: "Void",
      next: "No action"
    };
  }

  if (
    status === "READY_FOR_CHECKOUT"
  ) {
    return {
      view: "NEEDS_ACTION",
      state: "Review & Confirm Ready",
      next: "Complete Review & Confirm"
    };
  }

  if (
    status ===
    "CASH_PREPAID_AUTOPAY_REQUIRED"
  ) {
    return {
      view: "NEEDS_ACTION",
      state: "Cash Prepaid",
      next: "Set up Stripe autopay"
    };
  }

  if (
    status === "CHECKOUT_CREATED" ||
    status === "PAYMENT_PENDING"
  ) {
    return {
      view: "WAITING",
      state: "Payment Pending",
      next: "Waiting for payment"
    };
  }

  const intakeStatus =
    upper(intake?.status);

  if (
    status === "PAID" &&
    intakeStatus === "APPROVED"
  ) {
    return {
      view: "CLOSED",
      state: "Paid / Activated",
      next: "Complete"
    };
  }

  return {
    view: "PAID_READY",
    state: "Paid",
    next:
      intakeStatus === "SUBMITTED"
        ? "Review enrollment"
        : "Start enrollment"
  };
}

function classifyPass(message) {
  if (
    upper(message.topic) !==
    "REQUEST-PASS"
  ) {
    return null;
  }

  if (isClosedPass(message)) {
    return {
      view: "CLOSED",
      state: "Pass Closed",
      next: "Complete"
    };
  }

  const payment =
    upper(
      message.passPaymentStatus
    );

  const attended =
    Boolean(
      message.passAttendanceConfirmedAt
    );

  const verified =
    Boolean(
      clean(
        message.stripePaymentIntentId
      )
    );

  if (
    payment === "PAID" &&
    attended &&
    verified
  ) {
    return {
      view: "PAID_READY",
      state: "Paid / Verified",
      next: "Ready to close"
    };
  }

  if (
    [
      "FAILED",
      "CANCELED",
      "CANCELLED",
      "EXPIRED"
    ].includes(payment)
  ) {
    return {
      view: "NEEDS_ACTION",
      state: "Payment Problem",
      next: "Review payment"
    };
  }

  if (
    attended &&
    payment !== "PAID"
  ) {
    return {
      view: "NEEDS_ACTION",
      state: "Attendance Confirmed",
      next: "Collect payment"
    };
  }

  if (
    payment === "PENDING"
  ) {
    return {
      view: "WAITING",
      state: "Payment Pending",
      next: "Waiting for payment"
    };
  }

  if (
    payment === "PAID" &&
    !attended
  ) {
    return {
      view: "WAITING",
      state: "Paid",
      next: "Waiting for attendance"
    };
  }

  return {
    view: "WAITING",
    state: "Pass Requested",
    next: "Waiting for attendance"
  };
}

async function loadLocationCollection(
  name
) {
  if (
    managementContext.isSystemAdmin
  ) {
    const snapshot =
      await getDocs(
        collection(db, name)
      );

    return snapshot.docs.map(
      (record) => ({
        id: record.id,
        ...record.data()
      })
    );
  }

  const locationIds =
    managementContext.scope
      .locationIds || [];

  const records =
    new Map();

  for (
    let index = 0;
    index < locationIds.length;
    index += 10
  ) {
    const chunk =
      locationIds.slice(
        index,
        index + 10
      );

    const snapshot =
      await getDocs(
        query(
          collection(db, name),
          where(
            "locationId",
            "in",
            chunk
          )
        )
      );

    for (
      const record of snapshot.docs
    ) {
      records.set(
        record.id,
        {
          id: record.id,
          ...record.data()
        }
      );
    }
  }

  return [
    ...records.values()
  ];
}

async function loadPassMessages() {
  if (
    managementContext.isSystemAdmin
  ) {
    const snapshot =
      await getDocs(
        collection(
          db,
          "general_messages"
        )
      );

    return snapshot.docs
      .map(
        (record) => ({
          id: record.id,
          ...record.data()
        })
      )
      .filter(
        (message) =>
          upper(message.topic) ===
          "REQUEST-PASS"
      );
  }

  const locationIds =
    managementContext.scope
      .locationIds || [];

  const uid =
    managementContext.user.uid;

  const messages =
    new Map();

  for (
    let index = 0;
    index < locationIds.length;
    index += 10
  ) {
    const chunk =
      locationIds.slice(
        index,
        index + 10
      );

    const assigned =
      await getDocs(
        query(
          collection(
            db,
            "general_messages"
          ),
          where(
            "locationId",
            "in",
            chunk
          ),
          where(
            "assignedManagerUid",
            "==",
            uid
          )
        )
      );

    const pending =
      await getDocs(
        query(
          collection(
            db,
            "general_messages"
          ),
          where(
            "locationId",
            "in",
            chunk
          ),
          where(
            "assignedManagerUid",
            "==",
            null
          ),
          where(
            "assignmentStatus",
            "==",
            "PENDING_MANAGEMENT"
          )
        )
      );

    for (
      const snapshot of [
        assigned,
        pending
      ]
    ) {
      for (
        const record of snapshot.docs
      ) {
        const data =
          record.data();

        if (
          upper(data.topic) !==
          "REQUEST-PASS"
        ) {
          continue;
        }

        messages.set(
          record.id,
          {
            id: record.id,
            ...data
          }
        );
      }
    }
  }

  return [
    ...messages.values()
  ];
}

function buildProposalItems(
  proposals,
  intakes
) {
  const intakeByProposal =
    new Map();

  for (const intake of intakes) {
    const proposalId =
      clean(intake.proposalId);

    if (!proposalId) continue;

    const existing =
      intakeByProposal.get(
        proposalId
      );

    if (
      !existing ||
      timestampMillis(
        intake.updatedAt ||
        intake.createdAt
      ) >
      timestampMillis(
        existing.updatedAt ||
        existing.createdAt
      )
    ) {
      intakeByProposal.set(
        proposalId,
        intake
      );
    }
  }

  return proposals
    .map((proposal) => {
      const proposalId =
        clean(
          proposal.proposalId ||
          proposal.id
        );

      const intake =
        intakeByProposal.get(
          proposalId
        );

      const classification =
        classifyProposal(
          proposal,
          intake
        );

      if (!classification) {
        return null;
      }

      return {
        id:
          `proposal:${proposalId}`,

        source:
          "Proposal",

        name:
          proposalName(proposal),

        location:
          clean(
            proposal.locationName ||
            proposal.locationId
          ) || "—",

        amount:
          proposal
            .membershipChoiceRequest
            ?.active === true
            ? "Pending Selection"
            : proposal.cashPrepayment?.amountCents
              ? moneyFromCents(
                  proposal.cashPrepayment
                    .amountCents
                )
              : proposalAmount(proposal),

        proposalId,

        priorPayments:
          Array.isArray(
            proposal.priorPayments
          )
            ? proposal.priorPayments
            : [],

        canRecordPriorPayment:
          upper(proposal.status) ===
          "AWAITING_CLIENT_SIGNATURE",

        canRecordPrepaidCash:
          (
            upper(proposal.status) ===
            "READY_FOR_CHECKOUT"
          ) ||
          (
            upper(proposal.status) ===
            "PAID" &&
            !proposal.cashPrepayment &&
            ![
              proposal.stripePaymentIntentId,
              proposal.stripeCheckoutSessionId,
              proposal.pendingCheckoutSessionId,
              proposal.stripeSubscriptionId
            ].some(
              (value) =>
                Boolean(clean(value))
            )
          ),

        canSetupAutopay:
          upper(
            proposal.billingFollowUpStatus
          ) ===
            "AUTOPAY_SETUP_REQUIRED" &&
          clean(
            proposal.paymentMethod
          ) === "cash_prepaid" &&
          !clean(
            proposal.stripeSubscriptionId
          ),

        state:
          classification.state,

        next:
          classification.next,

        view:
          classification.view,

        updatedAt:
          proposal.paidAt ||
          intake?.approvedAt ||
          intake?.updatedAt ||
          proposal.updatedAt ||
          proposal.createdAt,

        actionLabel:
          classification.view ===
            "PAID_READY"
            ? "Enrollment"
            : "Proposal",

        href:
          classification.view ===
            "PAID_READY"
            ? "/intake-management/"
            : "/connect/proposals/"
      };
    })
    .filter(Boolean);
}

function buildPassItems(messages) {
  return messages
    .map((message) => {
      const classification =
        classifyPass(message);

      if (!classification) {
        return null;
      }

      const name =
        clean(message.contactName) ||
        clean(message.parentName) ||
        clean(message.athleteName) ||
        clean(message.email) ||
        "Pass Request";

      return {
        id:
          `pass:${message.id}`,

        source:
          "Day Pass",

        name,

        location:
          clean(
            message.locationName ||
            message.locationId
          ) || "—",

        amount:
          Number.isFinite(
            Number(
              message.passAmountCents
            )
          )
            ? moneyFromCents(
                message.passAmountCents
              )
            : "—",

        state:
          classification.state,

        next:
          classification.next,

        view:
          classification.view,

        updatedAt:
          message.closedAt ||
          message.passPaidAt ||
          message.passAttendanceConfirmedAt ||
          message.updatedAt ||
          message.createdAt,

        actionLabel:
          "Inbox",

        href:
          "/management/inbox/"
      };
    })
    .filter(Boolean);
}

function updateCounts() {
  const count =
    (view) =>
      billingItems.filter(
        (item) =>
          item.view === view
      ).length;

  countNeedsAction.textContent =
    count("NEEDS_ACTION");

  countWaiting.textContent =
    count("WAITING");

  countPaidReady.textContent =
    count("PAID_READY");

  countClosed.textContent =
    count("CLOSED");
}

function visibleItems() {
  const search =
    clean(
      billingSearch.value
    ).toLowerCase();

  return billingItems
    .filter(
      (item) =>
        item.view === activeView
    )
    .filter((item) => {
      if (!search) {
        return true;
      }

      return [
        item.name,
        item.source,
        item.location,
        item.amount,
        item.state,
        item.next
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort(
      (a, b) =>
        timestampMillis(
          b.updatedAt
        ) -
        timestampMillis(
          a.updatedAt
        )
    );
}


function formatPriorPaymentPeriod(value = "") {
  const match =
    clean(value).match(
      /^(\d{4})-(\d{2})$/
    );

  if (!match) {
    return value || "—";
  }

  const date =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      1
    );

  return date.toLocaleDateString(
    [],
    {
      month: "long",
      year: "numeric"
    }
  );
}

function priorPaymentSummaryHtml(item) {
  const payments =
    Array.isArray(item.priorPayments)
      ? item.priorPayments
      : [];

  if (!payments.length) {
    return "";
  }

  return `
    <div class="billing-prior-payments">
      <small>Prior payments recorded</small>

      <div class="billing-prior-payment-list">
        ${payments
          .map((payment) => {
            const periods =
              Array.isArray(payment.periods)
                ? payment.periods
                : [];

            const first =
              periods[0] || "";

            const last =
              periods[
                periods.length - 1
              ] || first;

            const periodLabel =
              first && last && first !== last
                ? `${formatPriorPaymentPeriod(first)} – ${formatPriorPaymentPeriod(last)}`
                : formatPriorPaymentPeriod(first);

            const method =
              clean(payment.paymentMethod)
                .toLowerCase() === "check"
                ? "Check"
                : "Cash";

            const amount =
              moneyFromCents(
                payment.amountCents
              );

            const enrollment =
              payment.enrollmentFeeIncluded
                ? "Enrollment included"
                : "Enrollment not included";

            return `
              <div class="billing-prior-payment-item">
                <strong>
                  ${esc(periodLabel)} ·
                  ${esc(method)} ·
                  ${esc(amount)}
                </strong>

                <span>
                  ${esc(enrollment)}
                </span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function render() {
  const items =
    visibleItems();

  billingVisibleCount.textContent =
    `${items.length} ${
      items.length === 1
        ? "record"
        : "records"
    }`;

  if (!items.length) {
    billingQueue.innerHTML = `
      <div class="billing-empty">
        No billing records in this view.
      </div>
    `;

    return;
  }

  billingQueue.innerHTML =
    items
      .map(
        (item) => `
          <article class="billing-row">

            <div class="billing-person">
              <span class="billing-type">
                ${esc(item.source)}
              </span>

              <strong>
                ${esc(item.name)}
              </strong>

              <small>
                ${esc(item.location)}
              </small>
            </div>

            <div class="billing-cell">
              <small>Amount</small>
              <strong>
                ${esc(item.amount)}
              </strong>
            </div>

            <div class="billing-cell">
              <small>Status</small>
              <strong class="billing-state">
                ${esc(item.state)}
              </strong>
            </div>

            <div class="billing-cell">
              <small>Next</small>
              <strong>
                ${esc(item.next)}
              </strong>
            </div>

            <div class="billing-cell">
              <small>Updated</small>
              <strong>
                ${esc(
                  formatDate(
                    item.updatedAt
                  )
                )}
              </strong>
            </div>

            ${priorPaymentSummaryHtml(item)}

            <div class="billing-actions">
              ${item.canRecordPriorPayment
                ? `
                  <button
                    class="billing-action billing-prior-payment-action"
                    type="button"
                    data-prior-payment-proposal-id="${esc(item.proposalId)}"
                    data-prior-payment-name="${esc(item.name)}"
                  >
                    Record prior payment
                  </button>
                `
                : ""
              }

              ${item.canRecordPrepaidCash
                ? `
                  <button
                    class="billing-action billing-cash-action"
                    type="button"
                    data-cash-proposal-id="${esc(item.proposalId)}"
                    data-cash-name="${esc(item.name)}"
                  >
                    Record prepaid cash
                  </button>
                `
                : ""
              }

              ${item.canSetupAutopay
                ? `
                  <button
                    class="billing-action billing-autopay-action"
                    type="button"
                    data-autopay-proposal-id="${esc(item.proposalId)}"
                  >
                    Create autopay setup link
                  </button>
                `
                : ""
              }

              <a
                class="billing-action"
                href="${esc(item.href)}"
              >
                ${esc(item.actionLabel)} →
              </a>
            </div>

          </article>
        `
      )
      .join("");
}


function priorPaymentPeriods(
  startValue,
  endValue
) {
  const matchStart =
    clean(startValue).match(
      /^(\d{4})-(\d{2})$/
    );

  const matchEnd =
    clean(endValue).match(
      /^(\d{4})-(\d{2})$/
    );

  if (!matchStart || !matchEnd) {
    return [];
  }

  const start =
    new Date(
      Number(matchStart[1]),
      Number(matchStart[2]) - 1,
      1
    );

  const end =
    new Date(
      Number(matchEnd[1]),
      Number(matchEnd[2]) - 1,
      1
    );

  if (
    end.getTime() <
    start.getTime()
  ) {
    return [];
  }

  const periods = [];
  const cursor =
    new Date(start);

  while (
    cursor.getTime() <=
    end.getTime() &&
    periods.length < 12
  ) {
    periods.push(
      `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}`
    );

    cursor.setMonth(
      cursor.getMonth() + 1
    );
  }

  return periods;
}

function ensurePriorPaymentDialog() {
  let dialog =
    document.getElementById(
      "priorPaymentDialog"
    );

  if (dialog) return dialog;

  dialog =
    document.createElement(
      "dialog"
    );

  dialog.id =
    "priorPaymentDialog";

  dialog.className =
    "billing-cash-dialog";

  dialog.innerHTML = `
    <form
      id="priorPaymentForm"
      class="billing-cash-form"
      method="dialog"
    >
      <div class="billing-cash-head">
        <div>
          <p class="eyebrow">
            Management · Billing
          </p>
          <h2>
            Record prior payment
          </h2>
          <p id="priorPaymentFamily"></p>
        </div>

        <button
          class="billing-cash-close"
          type="button"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <input
        id="priorPaymentProposalId"
        type="hidden"
      >

      <div class="billing-cash-grid">
        <label>
          <span>Amount received</span>
          <input
            id="priorPaymentAmount"
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            required
          >
        </label>

        <label>
          <span>Payment method</span>
          <select id="priorPaymentMethod">
            <option value="cash">Cash</option>
            <option value="check">Check</option>
          </select>
        </label>

        <label>
          <span>First month covered</span>
          <input
            id="priorPaymentStartMonth"
            type="month"
            required
          >
        </label>

        <label>
          <span>Last month covered</span>
          <input
            id="priorPaymentEndMonth"
            type="month"
            required
          >
        </label>

        <label class="billing-cash-check">
          <input
            id="priorPaymentEnrollmentFee"
            type="checkbox"
          >
          <span>
            Annual enrollment fee was included
          </span>
        </label>
      </div>

      <label class="billing-cash-note">
        <span>Management note</span>
        <textarea
          id="priorPaymentNote"
          rows="3"
          placeholder="Example: September and October dues paid before digital billing transition."
        ></textarea>
      </label>

      <p class="billing-cash-warning">
        This creates a billing audit record only. It does not mark the proposal paid, change the proposal stage, or replace Review &amp; Confirm.
      </p>

      <div class="billing-cash-footer">
        <button
          class="button button-secondary"
          type="button"
          data-prior-payment-cancel
        >
          Cancel
        </button>

        <button
          id="priorPaymentSubmit"
          class="button"
          type="submit"
        >
          Record payment
        </button>
      </div>

      <p
        id="priorPaymentStatus"
        class="billing-status"
        aria-live="polite"
      ></p>
    </form>
  `;

  document.body.appendChild(
    dialog
  );

  const close = () => {
    dialog.close();
  };

  dialog
    .querySelector(
      ".billing-cash-close"
    )
    ?.addEventListener(
      "click",
      close
    );

  dialog
    .querySelector(
      "[data-prior-payment-cancel]"
    )
    ?.addEventListener(
      "click",
      close
    );

  dialog
    .querySelector(
      "#priorPaymentForm"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const status =
          document.getElementById(
            "priorPaymentStatus"
          );

        const submit =
          document.getElementById(
            "priorPaymentSubmit"
          );

        const proposalId =
          clean(
            document.getElementById(
              "priorPaymentProposalId"
            )?.value
          );

        const amount =
          Number(
            document.getElementById(
              "priorPaymentAmount"
            )?.value
          );

        const paymentMethod =
          clean(
            document.getElementById(
              "priorPaymentMethod"
            )?.value
          );

        const periods =
          priorPaymentPeriods(
            document.getElementById(
              "priorPaymentStartMonth"
            )?.value,
            document.getElementById(
              "priorPaymentEndMonth"
            )?.value
          );

        const enrollmentFeeIncluded =
          document.getElementById(
            "priorPaymentEnrollmentFee"
          )?.checked === true;

        const note =
          clean(
            document.getElementById(
              "priorPaymentNote"
            )?.value
          );

        if (
          !proposalId ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !periods.length
        ) {
          if (status) {
            status.textContent =
              "Complete the amount and month range.";
          }
          return;
        }

        if (submit) {
          submit.disabled = true;
          submit.textContent =
            "Recording…";
        }

        if (status) {
          status.textContent =
            "Recording prior payment…";
        }

        try {
          await recordPriorPaymentCall({
            proposalId,
            amountCents:
              Math.round(amount * 100),
            paymentMethod,
            periods,
            enrollmentFeeIncluded,
            note
          });

          if (status) {
            status.textContent =
              "Prior payment recorded. Proposal stage was not changed.";
          }

          await loadBilling();

          window.setTimeout(
            () => dialog.close(),
            500
          );
        } catch (error) {
          console.error(
            "[billing] prior payment failed:",
            error
          );

          if (status) {
            status.textContent =
              error?.message ||
              "Unable to record prior payment.";
          }
        } finally {
          if (submit) {
            submit.disabled = false;
            submit.textContent =
              "Record payment";
          }
        }
      }
    );

  return dialog;
}

function openPriorPaymentDialog(
  proposalId,
  name
) {
  const dialog =
    ensurePriorPaymentDialog();

  document.getElementById(
    "priorPaymentProposalId"
  ).value = proposalId;

  document.getElementById(
    "priorPaymentFamily"
  ).textContent = name;

  document.getElementById(
    "priorPaymentAmount"
  ).value = "";

  document.getElementById(
    "priorPaymentMethod"
  ).value = "cash";

  document.getElementById(
    "priorPaymentStartMonth"
  ).value = "";

  document.getElementById(
    "priorPaymentEndMonth"
  ).value = "";

  document.getElementById(
    "priorPaymentEnrollmentFee"
  ).checked = false;

  document.getElementById(
    "priorPaymentNote"
  ).value = "";

  document.getElementById(
    "priorPaymentStatus"
  ).textContent = "";

  dialog.showModal();
}


function ensureCashDialog() {
  let dialog =
    document.getElementById(
      "prepaidCashDialog"
    );

  if (dialog) return dialog;

  dialog =
    document.createElement(
      "dialog"
    );

  dialog.id =
    "prepaidCashDialog";

  dialog.className =
    "billing-cash-dialog";

  dialog.innerHTML = `
    <form
      id="prepaidCashForm"
      class="billing-cash-form"
      method="dialog"
    >
      <div class="billing-cash-head">
        <div>
          <p class="eyebrow">
            Management · Billing
          </p>
          <h2>
            Record prepaid cash
          </h2>
          <p id="prepaidCashFamily"></p>
        </div>

        <button
          class="billing-cash-close"
          type="button"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <input
        id="prepaidCashProposalId"
        type="hidden"
      >

      <div class="billing-cash-grid">
        <label>
          <span>Cash received</span>
          <input
            id="prepaidCashAmount"
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            required
          >
        </label>

        <label>
          <span>Months covered</span>
          <input
            id="prepaidCashMonths"
            type="number"
            min="1"
            step="1"
            value="1"
            required
          >
        </label>

        <label>
          <span>Stripe takes over</span>
          <input
            id="prepaidCashNextBilling"
            type="date"
            required
          >
        </label>

        <label class="billing-cash-check">
          <input
            id="prepaidCashEnrollmentFee"
            type="checkbox"
          >
          <span>
            Annual enrollment fee was included
          </span>
        </label>
      </div>

      <label class="billing-cash-note">
        <span>Management note</span>
        <textarea
          id="prepaidCashNote"
          rows="3"
          placeholder="Optional note about what the cash covers."
        ></textarea>
      </label>

      <p class="billing-cash-warning">
        This records prepaid dues only. It does not create a Stripe payment or mark the proposal Stripe-paid.
      </p>

      <div class="billing-cash-footer">
        <button
          class="button button-secondary"
          type="button"
          data-cash-cancel
        >
          Cancel
        </button>

        <button
          id="prepaidCashSubmit"
          class="button"
          type="submit"
        >
          Record cash
        </button>
      </div>

      <p
        id="prepaidCashStatus"
        class="billing-status"
        aria-live="polite"
      ></p>
    </form>
  `;

  document.body.appendChild(
    dialog
  );

  const close = () => {
    dialog.close();
  };

  dialog
    .querySelector(
      ".billing-cash-close"
    )
    ?.addEventListener(
      "click",
      close
    );

  dialog
    .querySelector(
      "[data-cash-cancel]"
    )
    ?.addEventListener(
      "click",
      close
    );

  dialog
    .querySelector(
      "#prepaidCashForm"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const status =
          document.getElementById(
            "prepaidCashStatus"
          );

        const submit =
          document.getElementById(
            "prepaidCashSubmit"
          );

        const proposalId =
          clean(
            document.getElementById(
              "prepaidCashProposalId"
            )?.value
          );

        const amount =
          Number(
            document.getElementById(
              "prepaidCashAmount"
            )?.value
          );

        const monthsCovered =
          Number(
            document.getElementById(
              "prepaidCashMonths"
            )?.value
          );

        const nextBillingDate =
          clean(
            document.getElementById(
              "prepaidCashNextBilling"
            )?.value
          );

        const enrollmentFeePaid =
          document.getElementById(
            "prepaidCashEnrollmentFee"
          )?.checked === true;

        const note =
          clean(
            document.getElementById(
              "prepaidCashNote"
            )?.value
          );

        if (
          !proposalId ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !Number.isInteger(
            monthsCovered
          ) ||
          monthsCovered <= 0 ||
          !nextBillingDate
        ) {
          if (status) {
            status.textContent =
              "Complete the cash amount, months covered, and next Stripe billing date.";
            status.classList.add(
              "is-error"
            );
          }

          return;
        }

        submit.disabled = true;

        if (status) {
          status.textContent =
            "Recording prepaid cash…";
          status.classList.remove(
            "is-error"
          );
        }

        try {
          await recordPrepaidCashCall({
            proposalId,
            amountCents:
              Math.round(
                amount * 100
              ),
            monthsCovered,
            enrollmentFeePaid,
            nextBillingDate,
            note,
          });

          if (status) {
            status.textContent =
              "Cash recorded. Stripe autopay setup is still required.";
          }

          await loadBilling();

          window.setTimeout(
            () => dialog.close(),
            450
          );
        } catch (error) {
          console.error(
            "[billing] prepaid cash failed:",
            error
          );

          if (status) {
            status.textContent =
              error?.message ||
              "Unable to record prepaid cash.";
            status.classList.add(
              "is-error"
            );
          }
        } finally {
          submit.disabled = false;
        }
      }
    );

  return dialog;
}

function openCashDialog(
  proposalId,
  familyName
) {
  const dialog =
    ensureCashDialog();

  document.getElementById(
    "prepaidCashProposalId"
  ).value = proposalId;

  document.getElementById(
    "prepaidCashFamily"
  ).textContent =
    familyName || proposalId;

  document.getElementById(
    "prepaidCashAmount"
  ).value = "";

  document.getElementById(
    "prepaidCashMonths"
  ).value = "1";

  document.getElementById(
    "prepaidCashNextBilling"
  ).value = "";

  document.getElementById(
    "prepaidCashEnrollmentFee"
  ).checked = false;

  document.getElementById(
    "prepaidCashNote"
  ).value = "";

  const status =
    document.getElementById(
      "prepaidCashStatus"
    );

  status.textContent = "";
  status.classList.remove(
    "is-error"
  );

  dialog.showModal();
}

billingQueue.addEventListener(
  "click",
  async (event) => {
    const cashButton =
      event.target.closest(
        "[data-cash-proposal-id]"
      );

    if (cashButton) {
      openCashDialog(
        clean(
          cashButton.dataset
            .cashProposalId
        ),
        clean(
          cashButton.dataset
            .cashName
        )
      );
      return;
    }

    const autopayButton =
      event.target.closest(
        "[data-autopay-proposal-id]"
      );

    if (!autopayButton) return;

    const proposalId =
      clean(
        autopayButton.dataset
          .autopayProposalId
      );

    if (!proposalId) return;

    const originalText =
      autopayButton.textContent;

    autopayButton.disabled = true;
    autopayButton.textContent =
      "Creating link…";

    try {
      const response =
        await createAutopaySetupCall({
          proposalId,
        });

      if (
        response.data?.alreadyComplete ||
        response.data?.reconciled ||
        response.data?.status ===
          "AUTOPAY_READY"
      ) {
        setStatus(
          "Stripe autopay is already set up for this enrollment."
        );
        await loadBilling();
        return;
      }

      const setupUrl =
        clean(
          response.data?.setupUrl
        );

      if (!setupUrl) {
        throw new Error(
          "Stripe did not return an autopay setup link."
        );
      }

      try {
        await navigator.clipboard.writeText(
          setupUrl
        );
      } catch {
        // The prompt below remains the reliable handoff.
      }

      window.prompt(
        "Autopay setup link (copied when browser permission allows):",
        setupUrl
      );

      setStatus(
        "Autopay setup link is ready. No charge is made when the family saves their card."
      );
    } catch (error) {
      console.error(
        "[billing] autopay setup failed:",
        error
      );

      setStatus(
        error?.message ||
          "Unable to create the Stripe autopay setup link.",
        true
      );
    } finally {
      autopayButton.disabled = false;
      autopayButton.textContent =
        originalText;
    }
  }
);

billingQueue?.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-prior-payment-proposal-id]"
      );

    if (!button) return;

    openPriorPaymentDialog(
      clean(
        button.dataset
          .priorPaymentProposalId
      ),
      clean(
        button.dataset
          .priorPaymentName
      )
    );
  }
);


async function loadBilling() {
  refreshBilling.disabled = true;

  setStatus(
    "Loading billing activity…"
  );

  try {
    managementContext =
      await requireManagement();

    const [
      proposals,
      intakes,
      passMessages
    ] =
      await Promise.all([
        loadLocationCollection(
          "proposals"
        ),

        loadLocationCollection(
          "intakes"
        ),

        loadPassMessages()
      ]);

    billingItems = [
      ...buildProposalItems(
        proposals,
        intakes
      ),

      ...buildPassItems(
        passMessages
      )
    ];

    updateCounts();
    render();

    setStatus(
      `${billingItems.length} billing records loaded.`
    );
  } catch (error) {
    console.error(
      "[billing] load failed:",
      error
    );

    billingItems = [];

    updateCounts();
    render();

    setStatus(
      "Unable to load Billing. Check Management access and Firestore permissions.",
      true
    );

    if (
      error?.code ===
      "permission-denied"
    ) {
      return;
    }
  } finally {
    refreshBilling.disabled = false;
  }
}

for (
  const button of document.querySelectorAll(
    "[data-view]"
  )
) {
  button.addEventListener(
    "click",
    () => {
      activeView =
        button.dataset.view;

      for (
        const item of document.querySelectorAll(
          "[data-view]"
        )
      ) {
        item.classList.toggle(
          "is-active",
          item === button
        );
      }

      render();
    }
  );
}

billingSearch.addEventListener(
  "input",
  render
);

refreshBilling.addEventListener(
  "click",
  () => {
    void loadBilling();
  }
);

try {
  await loadBilling();
} catch (error) {
  console.error(error);

  window.location.href =
    managementLoginUrl();
}
