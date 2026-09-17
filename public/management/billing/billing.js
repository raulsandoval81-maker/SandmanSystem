import {
  db,
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
      "READY_FOR_CHECKOUT",
      "CHECKOUT_CREATED",
      "PAYMENT_PENDING",
      "PAID",
      "VOID"
    ].includes(status)
  ) {
    return null;
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
      state: "Checkout Ready",
      next: "Begin checkout"
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
          proposalAmount(proposal),

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

            <a
              class="billing-action"
              href="${esc(item.href)}"
            >
              ${esc(item.actionLabel)} →
            </a>

          </article>
        `
      )
      .join("");
}

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
