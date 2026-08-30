import {
  db,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from "/assets/js/firebase-init.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";

/* ==================================================
   Route Context
   ================================================== */

const params =
  new URLSearchParams(window.location.search);

const appointmentId =
  params.get("appointmentId") || "";

let proposalId =
  params.get("proposalId") || "";
  
/* ==================================================
   Existing Appointment Context Elements
   ================================================== */

const appointmentContext =
  document.getElementById(
    "appointmentContext"
  );

const appointmentContextStatus =
  document.getElementById(
    "appointmentContextStatus"
  );

const appointmentContextDetails =
  document.getElementById(
    "appointmentContextDetails"
  );

const openProspectBuilderBtn =
  document.getElementById(
    "openProspectBuilderBtn"
  );

/* ==================================================
   General Helpers
   ================================================== */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(value) {
  return (
    value === undefined ||
    value === null ||
    value === ""
  )
    ? "—"
    : value;
}

function money(value) {
  const amount =
    Number(value || 0);

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }
  ).format(
    Number.isFinite(amount)
      ? amount
      : 0
  );
}

function timestampToMillis(value) {
  if (!value) {
    return 0;
  }

  if (
    typeof value.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  const date =
    new Date(value);

  return Number.isFinite(
    date.getTime()
  )
    ? date.getTime()
    : 0;
}

function formatTimestamp(value) {
  const millis =
    timestampToMillis(value);

  if (!millis) {
    return "—";
  }

  return new Date(
    millis
  ).toLocaleString(
    [],
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  );
}

function formatDate(value = "") {
  if (!value) {
    return "—";
  }

  const date =
    new Date(`${value}T12:00:00`);

  return Number.isFinite(
    date.getTime()
  )
    ? date.toLocaleDateString()
    : value;
}

/* ==================================================
   Labels
   ================================================== */

function labelForLocation(value = "") {
  const labels = {
    lompoc:
      "Lompoc",

    solvang:
      "Solvang",

    either:
      "Either Location"
  };

  return (
    labels[value] ||
    value ||
    "—"
  );
}

function labelForProgram(value = "") {
  const labels = {
    "zero2hero-wrestling":
      "Zero2Hero Wrestling",

    "zero2hero-boxing":
      "Zero2Hero Boxing",

    "zero2hero-muay-thai":
      "Zero2Hero Muay Thai",

    "path2legend-wrestling":
      "Path2Legend Wrestling",

    "path2legend-boxing":
      "Path2Legend Boxing",

    "path2legend-muay-thai":
      "Path2Legend Muay Thai",

    "quest2mastery-mma":
      "Quest2Mastery MMA",

    "quest2mastery-submission-grappling":
      "Quest2Mastery Submission Grappling",

    fitness:
      "Everyday Fitness"
  };

  return (
    labels[value] ||
    value ||
    "—"
  );
}

function labelForJourney(value = "") {
  const labels = {
    zero2hero:
      "Zero2Hero",

    path2legend:
      "Path2Legend",

    quest2mastery:
      "Quest2Mastery",

    fitness:
      "Everyday Fitness",

    "everyday-fitness":
      "Everyday Fitness"
  };

  return (
    labels[value] ||
    value ||
    "—"
  );
}

function labelForPrimaryGoal(value = "") {
  const labels = {
    confidence:
      "Build Confidence",

    "self-defense":
      "Learn Self-Defense",

    selfdefense:
      "Learn Self-Defense",

    competition:
      "Competition",

    fitness:
      "Fitness & Health",

    character:
      "Character & Discipline",

    discipline:
      "Character & Discipline",

    exploring:
      "Just Exploring",

    health:
      "Health",

    "weight-loss":
      "Weight Loss",

    weightloss:
      "Weight Loss"
  };

  return (
    labels[value] ||
    value ||
    "—"
  );
}

function labelForStartingPath(value = "") {
  const labels = {
    new:
      "New Athlete",

    assessment:
      "Placement Assessment"
  };

  return (
    labels[value] ||
    value ||
    "—"
  );
}

function labelForStatus(value = "") {
  const labels = {
    DRAFT:
      "Draft",

    REVIEW:
      "Needs Review",

    APPROVED:
      "Approved",

    LOCKED:
      "Locked",

    READY_FOR_CHECKOUT:
      "Checkout Ready",

    CHECKOUT_CREATED:
      "Checkout Created",

    PAYMENT_PENDING:
      "Payment Pending",

    PAID:
      "Paid",

    VOID:
      "Void"
  };

  return (
    labels[value] ||
    value ||
    "Unknown"
  );
}

/* ==================================================
   Proposal Queue DOM
   ================================================== */

function ensureProposalQueue() {
  let queue =
    document.getElementById(
      "proposalQueue"
    );

  if (queue) {
    return queue;
  }

  queue =
    document.createElement(
      "section"
    );

  queue.id =
    "proposalQueue";

  queue.className =
    "proposal-queue";

  const existingContext =
    appointmentContext;

  if (
    existingContext &&
    existingContext.parentNode
  ) {
    existingContext.parentNode.insertBefore(
      queue,
      existingContext
    );
  } else {
    const main =
      document.querySelector("main") ||
      document.querySelector(".page") ||
      document.body;

    main.appendChild(
      queue
    );
  }

  return queue;
}

function proposalQueueStyles() {
  if (
    document.getElementById(
      "proposalQueueStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "proposalQueueStyles";

  style.textContent = `
    .proposal-queue{
      display:grid;
      gap:28px;
      margin-top:24px;
      color:var(--management-text);
    }

    .proposal-queue-header{
      display:flex;
      justify-content:space-between;
      gap:20px;
      align-items:flex-start;
      flex-wrap:wrap;
    }

    .proposal-queue-header h2{
      margin:0;
      color:var(--management-text);
    }

    .proposal-queue-header p{
      margin:6px 0 0;
      color:var(--management-muted);
      line-height:1.5;
    }

    .proposal-queue-counts{
      display:grid;
      grid-template-columns:
        repeat(4,minmax(110px,1fr));
      gap:8px;
    }

    .proposal-count{
      display:flex;
      align-items:center;
      justify-content:center;
      min-height:44px;
      padding:9px 12px;
      border:1px solid var(--management-border);
      border-radius:11px;
      background:var(--management-surface);
      color:var(--management-text);
      font-size:.82rem;
      font-weight:800;
      white-space:nowrap;
    }

    .proposal-group{
      display:grid;
      gap:14px;
    }

    .proposal-group-head{
      display:flex;
      justify-content:space-between;
      gap:16px;
      align-items:end;
      padding-bottom:10px;
      border-bottom:
        1px solid var(--management-border);
    }

    .proposal-group-head h3{
      margin:0;
      color:var(--management-text);
      font-size:1.05rem;
    }

    .proposal-group-head span{
      display:block;
      margin-top:4px;
      color:var(--management-muted);
      font-size:.82rem;
      line-height:1.4;
    }

    .proposal-group-head > strong{
      color:var(--management-text);
      font-size:1rem;
    }

    .proposal-list{
      display:grid;
      gap:12px;
    }

    .proposal-card{
      display:grid;
      gap:16px;
      padding:18px;
      border:
        1px solid var(--management-border);
      border-radius:16px;
      background:var(--management-surface);
      color:var(--management-text);
      box-shadow:
        0 8px 22px rgba(40,32,15,.045);
    }

    .proposal-card-top{
      display:flex;
      justify-content:space-between;
      gap:14px;
      align-items:flex-start;
      flex-wrap:wrap;
    }

    .proposal-card-id{
      display:block;
      margin-bottom:5px;
      color:var(--management-muted);
      font-size:.74rem;
      font-weight:850;
      letter-spacing:.08em;
      text-transform:uppercase;
    }

    .proposal-card h4{
      margin:0;
      color:var(--management-text);
      font-size:1.15rem;
    }

    .proposal-status{
      display:inline-flex;
      align-items:center;
      min-height:30px;
      padding:6px 10px;
      border:1px solid var(--management-border-strong);
      border-radius:999px;
      background:var(--management-neutral-soft);
      color:var(--management-neutral);
      font-size:.72rem;
      font-weight:900;
      letter-spacing:.04em;
      text-transform:uppercase;
    }

    .proposal-card[data-status="PAID"]
      .proposal-status{
      border-color:#a9d0b7;
      background:var(--management-success-soft);
      color:var(--management-success);
    }

    .proposal-card[data-status="APPROVED"]
      .proposal-status,
    .proposal-card[data-status="READY_FOR_CHECKOUT"]
      .proposal-status,
    .proposal-card[data-status="CHECKOUT_CREATED"]
      .proposal-status{
      border-color:#dcc77f;
      background:var(--management-gold-soft);
      color:#59440b;
    }

    .proposal-card[data-status="REVIEW"]
      .proposal-status{
      border-color:#dcc77f;
      background:#fff8df;
      color:var(--management-warning);
    }

    .proposal-card[data-status="LOCKED"]
      .proposal-status,
    .proposal-card[data-status="VOID"]
      .proposal-status{
      border-color:var(--management-border);
      background:var(--management-neutral-soft);
      color:var(--management-neutral);
    }

    .proposal-athletes{
      display:grid;
      gap:5px;
      padding:11px 12px;
      border-radius:11px;
      background:var(--management-surface-soft);
      color:var(--management-text);
      font-size:.88rem;
      line-height:1.45;
    }

    .proposal-card-grid{
      display:grid;
      grid-template-columns:
        repeat(4,minmax(0,1fr));
      gap:10px;
    }

    .proposal-card-grid div{
      min-width:0;
      padding:11px 12px;
      border:
        1px solid var(--management-border);
      border-radius:11px;
      background:var(--management-surface-soft);
    }

    .proposal-card-grid small{
      display:block;
      margin-bottom:5px;
      color:var(--management-muted);
      font-size:.68rem;
      font-weight:850;
      letter-spacing:.05em;
      text-transform:uppercase;
    }

    .proposal-card-grid strong{
      display:block;
      color:var(--management-text);
      line-height:1.35;
      overflow-wrap:anywhere;
    }

    .proposal-card-actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
    }

    .proposal-open-btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:42px;
      padding:10px 15px;
      border:1px solid var(--management-gold);
      border-radius:10px;
      background:var(--management-gold);
      color:#fffdf8;
      font-weight:850;
      text-decoration:none;
    }

    .proposal-open-btn:hover,
    .proposal-open-btn:focus-visible{
      border-color:#95620a;
      background:#95620a;
      color:#fffdf8;
    }

    .proposal-empty{
      padding:16px;
      border:
        1px dashed var(--management-border-strong);
      border-radius:14px;
      background:var(--management-surface-soft);
      color:var(--management-muted);
    }

    .proposal-error{
      padding:16px;
      border:1px solid #e2aaa6;
      border-radius:14px;
      background:var(--management-danger-soft);
      color:var(--management-danger);
    }

    @media(max-width:900px){
      .proposal-queue-counts{
        width:100%;
        grid-template-columns:
          repeat(2,minmax(0,1fr));
      }

      .proposal-card-grid{
        grid-template-columns:
          repeat(2,minmax(0,1fr));
      }
    }

    @media(max-width:520px){
      .proposal-queue{
        gap:24px;
      }

      .proposal-queue-counts{
        grid-template-columns:
          repeat(2,minmax(0,1fr));
      }

      .proposal-count{
        min-height:48px;
        white-space:normal;
        text-align:center;
      }

      .proposal-card{
        padding:15px;
      }

      .proposal-card-grid{
        grid-template-columns:1fr;
      }

      .proposal-open-btn{
        width:100%;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}

/* ==================================================
   Proposal Data Helpers
   ================================================== */

function getFamilyName(proposal) {
  return (
    proposal.prospect?.familyName ||
    proposal.prospect?.primaryContactName ||
    "Unnamed Family"
  );
}

function getCoachName(proposal) {
  return (
    proposal.coach?.name ||
    "—"
  );
}

function getMonthlyBalance(proposal) {
  const pricing =
    proposal.pricing || {};

  return Number(
    pricing.monthlyBalance ??
    pricing.monthlyTotal ??
    pricing.monthly ??
    0
  );
}

function getDueNow(proposal) {
  const pricing =
    proposal.pricing || {};

  return Number(
    pricing.dueNow ??
    pricing.enrollmentBalance ??
    pricing.enrollmentTotal ??
    0
  );
}

function athleteSummaryHtml(
  proposal
) {
  const athletes =
    Array.isArray(
      proposal.athletes
    )
      ? proposal.athletes
      : [];

  if (!athletes.length) {
    return `
      <span>
        No athletes attached
      </span>
    `;
  }

  return athletes
    .map((athlete) => {
      const name =
        athlete.name ||
        "Athlete";

      const journey =
        labelForJourney(
          athlete.journey
        );

      const planLabels = {
        standard:
          "Combat",

        combo:
          "Combat + Fitness",

        fitness:
          "Everyday Fitness"
      };

      const plan =
        planLabels[
          athlete.plan
        ] ||
        athlete.plan ||
        "Membership";

      return `
        <span>
          <strong>${esc(name)}</strong>
          ·
          ${esc(journey)}
          ·
          ${esc(plan)}
        </span>
      `;
    })
    .join("");
}

function actionLabel(
  status
) {
  switch (status) {
    case "REVIEW":
      return "Review Proposal";

    case "DRAFT":
      return "Continue Draft";

    case "READY_FOR_CHECKOUT":
      return "Open Checkout-Ready Proposal";

    case "APPROVED":
      return "Open Approved Proposal";

    case "LOCKED":
      return "Open Locked Proposal";

    case "PAID":
      return "Continue to Enrollment";

    default:
      return "Open Proposal";
  }
}

function proposalCardHtml(
  proposal
) {
  const id =
    proposal.proposalId ||
    proposal.id;

  const status =
    proposal.status ||
    "UNKNOWN";

  const familyName =
    getFamilyName(
      proposal
    );

  const coachName =
    getCoachName(
      proposal
    );

  const monthly =
    getMonthlyBalance(
      proposal
    );

  const dueNow =
    getDueNow(
      proposal
    );

  const updated =
    proposal.updatedAt ||
    proposal.createdAt;

  const href =
    status === "PAID"
      ? "/intake-management/" +
        `?proposalId=${encodeURIComponent(id)}`
      : "/connect/admissions/calculator/" +
        `?proposalId=${encodeURIComponent(id)}`;

  return `
    <article
      class="proposal-card"
      data-proposal-id="${esc(id)}"
      data-status="${esc(status)}"
    >
      <div class="proposal-card-top">
        <div>
          <span class="proposal-card-id">
            ${esc(id)}
          </span>

          <h4>
            ${esc(familyName)}
          </h4>
        </div>

        <span class="proposal-status">
          ${esc(
            labelForStatus(
              status
            )
          )}
        </span>
      </div>

      <div class="proposal-athletes">
        ${athleteSummaryHtml(
          proposal
        )}
      </div>

      <div class="proposal-card-grid">
        <div>
          <small>
            Monthly
          </small>

          <strong>
            ${money(monthly)}
          </strong>
        </div>

        <div>
          <small>
            Due at Enrollment
          </small>

          <strong>
            ${money(dueNow)}
          </strong>
        </div>

        <div>
          <small>
            Coach
          </small>

          <strong>
            ${esc(coachName)}
          </strong>
        </div>

        <div>
          <small>
            Last Updated
          </small>

          <strong>
            ${esc(
              formatTimestamp(
                updated
              )
            )}
          </strong>
        </div>
      </div>

      <div class="proposal-card-actions">
        <a
          class="proposal-open-btn"
          href="${href}"
        >
          ${esc(
            actionLabel(
              status
            )
          )}
        </a>
      </div>
    </article>
  `;
}

/* ==================================================
   Proposal Queue Grouping
   ================================================== */

const proposalGroups = [
  {
    key:
      "REVIEW",

    title:
      "Needs Review",

    description:
      "Submitted proposals awaiting review and approval."
  },

  {
    key:
      "DRAFT",

    title:
      "Drafts",

    description:
      "Working proposals that have not yet been submitted."
  },

  {
    key:
      "READY_FOR_CHECKOUT",

    title:
      "Checkout Ready",

    description:
      "Approved proposals ready for the payment and enrollment handoff."
  },

  {
    key:
      "OTHER",

    title:
      "Other / Completed",

    description:
      "Approved, paid, locked, void, or other proposal states."
  }
];

function proposalGroupKey(
  proposal
) {
  const status =
    proposal.status || "";

  if (
    status === "REVIEW" ||
    status === "DRAFT" ||
    status ===
      "READY_FOR_CHECKOUT"
  ) {
    return status;
  }

  return "OTHER";
}

/* ==================================================
   Load Proposal Queue
   ================================================== */

async function loadProposalQueue() {
  proposalQueueStyles();

  const queue =
    ensureProposalQueue();

  queue.innerHTML = `
    <div class="proposal-queue-header">
      <div>
        <h2>
          Proposal Queue
        </h2>

        <p>
          Review drafts, submitted proposals,
          approvals, and checkout-ready offers.
        </p>
      </div>

      <div
        id="proposalQueueCounts"
        class="proposal-queue-counts"
      >
        Loading…
      </div>
    </div>

    <div id="proposalQueueBody">
      Loading proposals…
    </div>
  `;

  if (appointmentContext) {
    appointmentContext.hidden =
      true;
  }

  const context =
    await requireManagement();

  let proposalDocs = [];

  if (context.isSystemAdmin) {
    const snapshot =
      await getDocs(
        collection(
          db,
          "proposals"
        )
      );

    proposalDocs =
      snapshot.docs;
  } else {
    const locationIds =
      Array.isArray(
        context.scope?.locationIds
      )
        ? context.scope.locationIds
            .map((value) =>
              String(value || "").trim()
            )
            .filter(Boolean)
        : [];

    if (locationIds.length) {
      const chunks = [];

      for (
        let index = 0;
        index < locationIds.length;
        index += 10
      ) {
        chunks.push(
          locationIds.slice(
            index,
            index + 10
          )
        );
      }

      const snapshots =
        await Promise.all(
          chunks.map(
            (locationChunk) =>
              getDocs(
                query(
                  collection(
                    db,
                    "proposals"
                  ),
                  where(
                    "locationId",
                    "in",
                    locationChunk
                  )
                )
              )
          )
        );

      const byId =
        new Map();

      for (const snapshot of snapshots) {
        for (const proposalDoc of snapshot.docs) {
          byId.set(
            proposalDoc.id,
            proposalDoc
          );
        }
      }

      proposalDocs =
        Array.from(
          byId.values()
        );
    }
  }

  const proposals =
    proposalDocs
      .map((snapshotDoc) => ({
        id:
          snapshotDoc.id,

        ...snapshotDoc.data()
      }))
      .sort(
        (a, b) =>
          timestampToMillis(
            b.updatedAt ||
            b.createdAt
          ) -
          timestampToMillis(
            a.updatedAt ||
            a.createdAt
          )
      );

  const counts =
    {
      REVIEW: 0,
      DRAFT: 0,
      READY_FOR_CHECKOUT: 0,
      OTHER: 0
    };

  proposals.forEach(
    (proposal) => {
      counts[
        proposalGroupKey(
          proposal
        )
      ] += 1;
    }
  );

  const countsEl =
    document.getElementById(
      "proposalQueueCounts"
    );

  if (countsEl) {
    countsEl.innerHTML = `
      <span class="proposal-count">
        ${proposals.length}
        Total
      </span>

      <span class="proposal-count">
        ${counts.REVIEW}
        Review
      </span>

      <span class="proposal-count">
        ${counts.DRAFT}
        Draft
      </span>

      <span class="proposal-count">
        ${counts.READY_FOR_CHECKOUT}
        Checkout Ready
      </span>
    `;
  }

  const body =
    document.getElementById(
      "proposalQueueBody"
    );

  if (!body) {
    return;
  }

  if (!proposals.length) {
    body.innerHTML = `
      <div class="proposal-empty">
        No proposals have been created yet.
      </div>
    `;

    return;
  }

  body.innerHTML =
    proposalGroups
      .map((group) => {
        const records =
          proposals.filter(
            (proposal) =>
              proposalGroupKey(
                proposal
              ) === group.key
          );

        return `
          <section class="proposal-group">
            <div class="proposal-group-head">
              <div>
                <h3>
                  ${esc(group.title)}
                </h3>

                <span>
                  ${esc(
                    group.description
                  )}
                </span>
              </div>

              <strong>
                ${records.length}
              </strong>
            </div>

            <div class="proposal-list">
              ${
                records.length
                  ? records
                      .map(
                        proposalCardHtml
                      )
                      .join("")
                  : `
                    <div class="proposal-empty">
                      No proposals in this stage.
                    </div>
                  `
              }
            </div>
          </section>
        `;
      })
      .join("");
}

/* ==================================================
   Appointment Handoff
   ================================================== */

function buildTalkingPoints(
  appointment
) {
  const athleteName =
    appointment.athleteName ||
    appointment.participantName ||
    "the athlete";

  const primaryGoal =
    labelForPrimaryGoal(
      appointment.primaryGoal
    );

  const programInterest =
    labelForProgram(
      appointment.programInterest
    );

  const recommendedJourney =
    labelForJourney(
      appointment.recommendedJourney
    );

  const recommendedDiscipline =
    appointment.recommendedDiscipline ||
    "No discipline selected yet";

  const startingPath =
    labelForStartingPath(
      appointment.recommendedStartingPath ||
      appointment.admissionsPath
    );

  const coachAssessment =
    appointment.coachAssessment ||
    "No coach assessment has been recorded yet.";

  const nextStep =
    appointment.enrollmentDecision ===
      "ready-to-enroll"
      ? "Work through program and billing options, select the best fit, and finalize the proposal."
      : appointment.enrollmentDecision ===
        "follow-up"
        ? "Prepare options for follow-up and address the family's remaining questions."
        : appointment.enrollmentDecision ===
          "undecided"
          ? "Clarify concerns and compare the most suitable program and billing options."
          : "Review the appointment outcome before advancing the proposal.";

  return `
    <div>
      <h3>
        Meeting Talking Points
      </h3>

      <p>
        <strong>
          Why they came in:
        </strong>

        ${esc(
          primaryGoal !== "—"
            ? primaryGoal
            : programInterest
        )}
      </p>

      <p>
        <strong>
          Current interest:
        </strong>

        ${esc(
          programInterest
        )}
      </p>

      <p>
        <strong>
          Coach recommendation:
        </strong>

        ${esc(
          recommendedJourney
        )}
        ·
        ${esc(
          recommendedDiscipline
        )}
      </p>

      <p>
        <strong>
          Starting path:
        </strong>

        ${esc(
          startingPath
        )}
      </p>

      <p>
        <strong>
          Coach observation:
        </strong>

        ${esc(
          coachAssessment
        )}
      </p>

      <p>
        <strong>
          Conversation focus:
        </strong>

        Help ${esc(
          athleteName
        )} and the family compare
        the available options and
        identify the best fit.
      </p>

      <p>
        <strong>
          Recommended next step:
        </strong>

        ${esc(
          nextStep
        )}
      </p>
    </div>
  `;
}

async function loadAppointmentContext() {
  if (!appointmentId) {
    return;
  }

  const queue =
    document.getElementById(
      "proposalQueue"
    );

  if (queue) {
    queue.hidden =
      true;
  }

  if (
    openProspectBuilderBtn
  ) {
    openProspectBuilderBtn.hidden = false;

    openProspectBuilderBtn.href =
      "/connect/admissions/calculator/" +
      `?appointmentId=${encodeURIComponent(
        appointmentId
      )}`;
  }

  const snapshot =
    await getDoc(
      doc(
        db,
        "admissions_appointments",
        appointmentId
      )
    );

  if (!snapshot.exists()) {
    throw new Error(
      "The appointment handoff could not be found."
    );
  }

  const appointment = {
    id:
      snapshot.id,

    ...snapshot.data()
  };

  const athleteName =
    appointment.athleteName ||
    appointment.participantName ||
    "—";

  const parentName =
    appointment.registrantRole ===
      "adult-athlete"
      ? "Adult athlete"
      : appointment.parentName ||
        "—";

  const programInterest =
    labelForProgram(
      appointment.programInterest
    );

  const recommendedJourney =
    labelForJourney(
      appointment.recommendedJourney
    );

  const recommendedDiscipline =
    displayValue(
      appointment.recommendedDiscipline
    );

  const startingPath =
    labelForStartingPath(
      appointment.recommendedStartingPath ||
      appointment.admissionsPath
    );

  const primaryGoal =
    labelForPrimaryGoal(
      appointment.primaryGoal
    );

  const appointmentLocation =
    labelForLocation(
      appointment.appointmentLocation ||
      appointment.preferredLocation
    );

  const coachName =
    displayValue(
      appointment.appointmentCoach
    );

  const appointmentDate =
    formatDate(
      appointment.appointmentDate
    );

  const coachAssessment =
    displayValue(
      appointment.coachAssessment
    );

  const appointmentNotes =
    displayValue(
      appointment.appointmentNotes
    );

  const leadNotes =
    displayValue(
      appointment.leadNotes
    );

  const hasPrivateNotes =
    Boolean(
      String(
        appointment.privateAdmissionsNotes ||
        ""
      ).trim()
    );

  if (
    appointmentContextDetails
  ) {
    appointmentContextDetails.innerHTML = `
      <div>
        <h3>
          Family and Athlete
        </h3>

        <p>
          <strong>
            Athlete:
          </strong>

          ${esc(
            athleteName
          )}
        </p>

        <p>
          <strong>
            Parent / Guardian:
          </strong>

          ${esc(
            parentName
          )}
        </p>

        <p>
          <strong>
            Age:
          </strong>

          ${esc(
            displayValue(
              appointment.athleteAge
            )
          )}
        </p>

        <p>
          <strong>
            Phone:
          </strong>

          ${esc(
            displayValue(
              appointment.phone
            )
          )}
        </p>

        <p>
          <strong>
            Email:
          </strong>

          ${esc(
            displayValue(
              appointment.email
            )
          )}
        </p>

        <p>
          <strong>
            Athlete T-Shirt Size:
          </strong>

          ${esc(
            displayValue(
              appointment.shirtSize
            )
          )}
        </p>
      </div>

      <div>
        <h3>
          Appointment Context
        </h3>

        <p>
          <strong>
            Program Interest:
          </strong>

          ${esc(
            programInterest
          )}
        </p>

        <p>
          <strong>
            Primary Goal:
          </strong>

          ${esc(
            primaryGoal
          )}
        </p>

        <p>
          <strong>
            Starting Path:
          </strong>

          ${esc(
            startingPath
          )}
        </p>

        <p>
          <strong>
            Academy:
          </strong>

          ${esc(
            appointmentLocation
          )}
        </p>

        <p>
          <strong>
            Appointment Date:
          </strong>

          ${esc(
            appointmentDate
          )}
        </p>

        <p>
          <strong>
            Coach:
          </strong>

          ${esc(
            coachName
          )}
        </p>
      </div>

      <div>
        <h3>
          Coach Recommendation
        </h3>

        <p>
          <strong>
            Recommended Journey:
          </strong>

          ${esc(
            recommendedJourney
          )}
        </p>

        <p>
          <strong>
            Recommended Discipline:
          </strong>

          ${esc(
            recommendedDiscipline
          )}
        </p>

        <p>
          <strong>
            Coach Assessment:
          </strong>

          ${esc(
            coachAssessment
          )}
        </p>

        <p>
          <strong>
            Appointment Notes:
          </strong>

          ${esc(
            appointmentNotes
          )}
        </p>

        <p>
          <strong>
            Original Family Notes:
          </strong>

          ${esc(
            leadNotes
          )}
        </p>

        <p>
          <strong>
            Private Admissions Notes:
          </strong>

          ${
            hasPrivateNotes
              ? "Available to authorized staff"
              : "None recorded"
          }
        </p>
      </div>

      ${buildTalkingPoints(
        appointment
      )}
    `;
  }

  if (
    appointmentContextStatus
  ) {
    appointmentContextStatus.textContent =
      `Appointment handoff loaded: ${appointment.id}`;
  }

  if (
    appointmentContext
  ) {
    appointmentContext.hidden =
      false;
  }
}

/* ==================================================
   Optional proposalId redirect
   ================================================== */

function redirectProposalId() {
  if (
    !proposalId
  ) {
    return false;
  }

  window.location.replace(
    "/connect/admissions/calculator/" +
    `?proposalId=${encodeURIComponent(
      proposalId
    )}`
  );

  return true;
}

/* ==================================================
   Start
   ================================================== */

try {
  // Proposal work belongs to Management.
  // The shared guard also supplies location scope.
  await requireManagement();

  if (
    redirectProposalId()
  ) {
    // Redirecting into Prospect Builder.
  } else if (
    appointmentId
  ) {
    await loadAppointmentContext();
  } else {
    await loadProposalQueue();
  }
} catch (error) {
  console.error(
    "[proposals] failed:",
    error
  );

  if (
    appointmentId
  ) {
    if (
      appointmentContextStatus
    ) {
      appointmentContextStatus.textContent =
        error?.message ||
        "Unable to load appointment context.";
    }

    if (
      appointmentContext
    ) {
      appointmentContext.hidden =
        false;
    }
  } else {
    proposalQueueStyles();

    const queue =
      ensureProposalQueue();

    queue.innerHTML = `
      <div class="proposal-error">
        <strong>
          Unable to load proposals.
        </strong>

        <p>
          ${esc(
            error?.message ||
            "Proposal queue could not be loaded."
          )}
        </p>
      </div>
    `;
  }
}
/* Proposal Queue header alignment */
document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");

  style.textContent = `
    .proposal-queue-header{
      display:grid !important;
      grid-template-columns:1fr !important;
      gap:16px !important;
      align-items:start !important;
    }

    .proposal-queue-counts{
      width:100% !important;
      display:grid !important;
      grid-template-columns:
        repeat(4,minmax(0,1fr)) !important;
      gap:10px !important;
    }

    .proposal-count{
      min-height:58px !important;
      display:flex !important;
      align-items:center !important;
      justify-content:center !important;
      text-align:center !important;
      border-radius:12px !important;
      background:var(--management-surface-soft) !important;
    }

    @media(max-width:700px){
      .proposal-queue-counts{
        grid-template-columns:
          repeat(2,minmax(0,1fr)) !important;
      }
    }
  `;

  document.head.appendChild(style);
});
