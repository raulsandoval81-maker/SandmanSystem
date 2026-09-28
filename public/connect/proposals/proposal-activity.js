import {
  db,
  functions,
  httpsCallable,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const getPlacementActivity =
  httpsCallable(
    functions,
    "getEnrollmentPlacementActivity"
  );

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function millis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();

  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.getTime()
    : 0;
}

function eventTime(item = {}) {
  return item.occurredAt || item.createdAt || null;
}

function formatTimestamp(value) {
  const valueMillis = millis(value);

  if (!valueMillis) {
    return "Time pending";
  }

  return new Date(valueMillis).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function eventLabel(item = {}) {
  const event =
    String(item.event || "")
      .trim()
      .toUpperCase();

  const labels = {
    CREATED: "Proposal Created",
    CLIENT_REVIEW_ISSUED: "Client Review Issued",
    CLIENT_REVIEW_EMAIL_SENT: "Remote Review Email Sent",
    CLIENT_SIGNED: "Client Signed",
    CHECKOUT_CREATED: "Checkout Created",
    CHECKOUT_RESTARTED: "Checkout Restarted",
    PAYMENT_PENDING: "Payment Pending",
    PAID: "Payment Complete",
    INTAKE_INVITE_CREATED: "Intake Invite Created",
    INTAKE_SUBMITTED: "Intake Submitted",
    ATHLETE_ACTIVATED: "Athlete Activated"
  };

  if (labels[event]) {
    return labels[event];
  }

  if (
    event === "STATUS_CHANGED" &&
    item.fromStatus &&
    item.toStatus
  ) {
    return `${item.fromStatus} → ${item.toStatus}`;
  }

  return event
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ") ||
    "Proposal Activity";
}

function eventDetail(item = {}) {
  const parts = [];

  const delivery =
    String(item.delivery || "")
      .trim()
      .toLowerCase();

  if (delivery === "email") {
    parts.push("Remote review");
  } else if (delivery === "local") {
    parts.push("In-person review");
  }

  if (
    item.event === "CLIENT_REVIEW_EMAIL_SENT" &&
    item.to
  ) {
    parts.push(`Sent to ${item.to}`);
  }

  if (item.event === "INTAKE_INVITE_CREATED") {
    parts.push(
      item.intakeAudience === "adult_athlete"
        ? "Adult athlete intake handoff"
        : "Parent / guardian intake handoff"
    );
  }

  if (item.event === "INTAKE_SUBMITTED") {
    parts.push(
      item.intakeAudience === "adult_athlete"
        ? "Submitted by adult athlete"
        : "Submitted by parent / guardian"
    );
  }

  if (
    item.event === "ATHLETE_ACTIVATED" &&
    item.athleteUid
  ) {
    parts.push(`Athlete ${item.athleteUid}`);
  }

  const actor =
    item.createdByName ||
    item.createdBy ||
    "";

  if (actor) {
    parts.push(`By ${actor}`);
  }

  return parts.join(" · ");
}

function placementLabel(item = {}) {
  const event =
    String(item.event || "")
      .trim()
      .toUpperCase();

  return ({
    COACH_ASSESSMENT_SENT:
      "Coach Assessment Sent",
    COACH_ASSESSMENT_RETURNED:
      "Returned to Management",
    EXPERIENCE_VALIDATED:
      "Experience Validation",
    PLACEMENT_RECORDED:
      "Placement Recorded"
  })[event] || eventLabel(item);
}

function placementDetail(item = {}) {
  const parts = [];
  const discipline =
    String(item.discipline || "").trim();
  const outcome =
    String(item.outcome || "")
      .trim()
      .toUpperCase();

  if (discipline) {
    parts.push(`Discipline: ${discipline}`);
  }

  if (
    item.event === "EXPERIENCE_VALIDATED" &&
    outcome
  ) {
    parts.push(
      outcome === "REJECTED"
        ? "Rejected"
        : outcome === "AWARDED"
          ? "Approved"
          : outcome
    );
  }

  return parts.join(" · ");
}

function timelineItem(item) {
  return `
    <li class="proposal-activity__item">
      <span
        class="proposal-activity__dot"
        aria-hidden="true"
      ></span>

      <div>
        <strong>${esc(item.label)}</strong>
        <span>${esc(formatTimestamp(item.createdAt))}</span>
        ${
          item.detail
            ? `<small>${esc(item.detail)}</small>`
            : ""
        }
      </div>
    </li>
  `;
}

function activitySection(
  title,
  description,
  items
) {
  return `
    <section class="proposal-activity__phase">
      <div class="proposal-activity__phase-head">
        <div>
          <h5>${esc(title)}</h5>
          <p>${esc(description)}</p>
        </div>

        <span>${items.length}</span>
      </div>

      ${
        items.length
          ? `
            <ol class="proposal-activity__list">
              ${items.map(timelineItem).join("")}
            </ol>
          `
          : `
            <p class="proposal-activity__empty">
              No activity recorded in this phase yet.
            </p>
          `
      }
    </section>
  `;
}

function installStyles() {
  if (
    document.getElementById(
      "proposalActivityStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "proposalActivityStyles";

  style.textContent = `
    .proposal-activity-toggle{
      border-color:var(--management-border-strong)!important;
      background:var(--management-surface)!important;
      color:var(--management-text)!important;
    }

    .proposal-activity-toggle:hover,
    .proposal-activity-toggle:focus-visible{
      border-color:var(--management-gold)!important;
      background:var(--management-gold-soft)!important;
    }

    .proposal-activity{
      display:grid;
      gap:16px;
      padding:18px;
      border:1px solid var(--management-border);
      border-radius:14px;
      background:var(--management-surface-soft);
      color:var(--management-text);
    }

    .proposal-activity[hidden]{
      display:none!important;
    }

    .proposal-activity__head{
      display:flex;
      justify-content:space-between;
      gap:14px;
      align-items:flex-start;
      flex-wrap:wrap;
    }

    .proposal-activity__head h5,
    .proposal-activity__phase h5{
      margin:0;
      color:var(--management-text);
      font-size:.96rem;
    }

    .proposal-activity__head p,
    .proposal-activity__phase-head p{
      margin:4px 0 0;
      color:var(--management-muted);
      font-size:.8rem;
      line-height:1.45;
    }

    .proposal-activity__case{
      color:var(--management-muted);
      font-size:.78rem;
      font-weight:850;
      letter-spacing:.05em;
    }

    .proposal-activity__phase{
      display:grid;
      gap:11px;
      padding-top:14px;
      border-top:1px solid var(--management-border);
    }

    .proposal-activity__phase-head{
      display:flex;
      justify-content:space-between;
      gap:12px;
      align-items:flex-start;
    }

    .proposal-activity__phase-head>span{
      min-width:30px;
      padding:4px 8px;
      border-radius:999px;
      background:var(--management-neutral-soft);
      text-align:center;
      font-size:.76rem;
      font-weight:850;
    }

    .proposal-activity__list{
      display:grid;
      gap:0;
      margin:0;
      padding:0;
      list-style:none;
    }

    .proposal-activity__item{
      position:relative;
      display:grid;
      grid-template-columns:18px 1fr;
      gap:10px;
      min-height:56px;
      padding:3px 0 11px;
    }

    .proposal-activity__item:not(:last-child)::before{
      content:"";
      position:absolute;
      left:7px;
      top:18px;
      bottom:-2px;
      width:2px;
      background:var(--management-border);
    }

    .proposal-activity__dot{
      position:relative;
      z-index:1;
      width:16px;
      height:16px;
      margin-top:2px;
      border:3px solid var(--management-surface-soft);
      border-radius:50%;
      background:var(--management-gold);
      box-shadow:0 0 0 1px var(--management-border-strong);
    }

    .proposal-activity__item div{
      display:grid;
      gap:3px;
    }

    .proposal-activity__item span,
    .proposal-activity__item small,
    .proposal-activity__empty{
      color:var(--management-muted);
    }

    .proposal-activity__item span{
      font-size:.78rem;
    }

    .proposal-activity__item small{
      font-size:.76rem;
    }

    .proposal-activity__empty{
      margin:0;
      font-size:.82rem;
    }
  `;

  document.head.appendChild(style);
}

async function loadActivity(
  card,
  panel,
  proposalId
) {
  if (
    panel.dataset.loaded === "true" ||
    panel.dataset.loading === "true"
  ) {
    return;
  }

  panel.dataset.loading = "true";
  panel.innerHTML = `
    <p class="proposal-activity__empty">
      Loading ${esc(proposalId)} activity…
    </p>
  `;

  try {
    const [historySnapshot, placementResult] =
      await Promise.all([
        getDocs(
          collection(
            db,
            "proposals",
            proposalId,
            "history"
          )
        ),
        getPlacementActivity({
          proposalId
        })
      ]);

    const proposalItems =
      historySnapshot.docs
        .map((historyDoc) => ({
          id: historyDoc.id,
          ...historyDoc.data()
        }))
        .sort(
          (a, b) =>
            millis(eventTime(a)) -
            millis(eventTime(b))
        )
        .map((item) => ({
          label: eventLabel(item),
          detail: eventDetail(item),
          createdAt: eventTime(item)
        }));

    const placementItems =
      Array.isArray(
        placementResult?.data?.activity
      )
        ? placementResult.data.activity
            .slice()
            .sort(
              (a, b) =>
                millis(a.occurredAt) -
                millis(b.occurredAt)
            )
            .map((item) => ({
              label: placementLabel(item),
              detail: placementDetail(item),
              createdAt: item.occurredAt
            }))
        : [];

    panel.innerHTML = `
      <div class="proposal-activity__head">
        <div>
          <h5>Case Activity</h5>
          <p>
            A-to-Z history for this exact proposal record.
          </p>
        </div>

        <span class="proposal-activity__case">
          ${esc(proposalId)}
        </span>
      </div>

      ${activitySection(
        "Proposal & Enrollment",
        "Proposal creation through payment and athlete activation.",
        proposalItems
      )}

      ${activitySection(
        "Placement & Onboarding",
        "Coach assessment through Management validation and placement.",
        placementItems
      )}
    `;

    panel.dataset.loaded = "true";
  } catch (error) {
    console.error(
      "[proposal-activity] failed:",
      error
    );

    panel.innerHTML = `
      <div class="proposal-activity__head">
        <div>
          <h5>Case Activity</h5>
          <p>Timeline could not be loaded.</p>
        </div>

        <span class="proposal-activity__case">
          ${esc(proposalId)}
        </span>
      </div>

      <p class="proposal-activity__empty">
        ${esc(
          error?.message ||
          "Unable to load proposal activity."
        )}
      </p>
    `;
  } finally {
    panel.dataset.loading = "false";
  }
}

function decorateCard(card) {
  if (!card || card.dataset.activityDecorated === "true") {
    return;
  }

  const proposalId =
    String(
      card.dataset.proposalId || ""
    ).trim();

  const actions =
    card.querySelector(
      ".proposal-card-actions"
    );

  if (!proposalId || !actions) {
    return;
  }

  card.dataset.activityDecorated = "true";

  const localReview =
    actions.querySelector(
      '[data-proposal-action="issue-client-review"]'
    );

  if (localReview) {
    localReview.textContent =
      "Review — In Person";

    localReview.title =
      "Open the secure proposal for review and acceptance on this device.";
  }

  const remoteReview =
    actions.querySelector(
      "[data-send-client-review]"
    );

  if (remoteReview) {
    remoteReview.textContent =
      "Send for Review — Remote";

    remoteReview.title =
      "Email the secure proposal for remote review and acceptance.";
  }

  const deleteButton =
    actions.querySelector(
      "[data-delete-test-proposal]"
    );

  if (deleteButton) {
    deleteButton.hidden = true;
  }

  const activityButton =
    document.createElement("button");

  activityButton.type = "button";
  activityButton.className =
    "proposal-open-btn proposal-activity-toggle";
  activityButton.dataset.proposalActivityToggle =
    proposalId;
  activityButton.setAttribute(
    "aria-expanded",
    "false"
  );
  activityButton.textContent =
    "View Activity";

  const panel =
    document.createElement("section");

  panel.className =
    "proposal-activity";
  panel.dataset.proposalActivity =
    proposalId;
  panel.hidden = true;

  actions.insertBefore(
    activityButton,
    deleteButton || null
  );

  actions.insertAdjacentElement(
    "afterend",
    panel
  );

  activityButton.addEventListener(
    "click",
    async () => {
      const opening = panel.hidden;

      panel.hidden = !opening;
      activityButton.setAttribute(
        "aria-expanded",
        String(opening)
      );
      activityButton.textContent =
        opening
          ? "Hide Activity"
          : "View Activity";

      if (opening) {
        await loadActivity(
          card,
          panel,
          proposalId
        );
      }
    }
  );
}

function decorateCards() {
  document
    .querySelectorAll(
      ".proposal-card"
    )
    .forEach(decorateCard);

  document
    .querySelectorAll(
      "[data-send-client-review]"
    )
    .forEach((button) => {
      button.textContent =
        "Send for Review — Remote";

      button.title =
        "Email the secure proposal for remote review and acceptance.";
    });

  document
    .querySelectorAll(
      "[data-delete-test-proposal]"
    )
    .forEach((button) => {
      button.hidden = true;
    });
}

async function openInPersonReview(
  button
) {
  const proposalId =
    String(
      button.dataset.proposalId || ""
    ).trim();

  if (!proposalId) {
    return;
  }

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "Opening Review…";

  try {
    const issueReview =
      httpsCallable(
        functions,
        "issueProposalClientReview"
      );

    const response =
      await issueReview({
        proposalId
      });

    const reviewPath =
      String(
        response.data?.reviewPath || ""
      ).trim();

    if (!reviewPath) {
      throw new Error(
        "In-person review link was not returned."
      );
    }

    window.location.assign(
      reviewPath
    );
  } catch (error) {
    console.error(
      "[proposal-activity] in-person review failed:",
      error
    );

    button.disabled = false;
    button.textContent =
      originalText;

    window.alert(
      error?.message ||
      "Unable to open the in-person proposal review."
    );
  }
}

installStyles();
decorateCards();

const observer =
  new MutationObserver(
    decorateCards
  );

observer.observe(
  document.body,
  {
    childList: true,
    subtree: true
  }
);

/*
 * Review & Approve already owns the legacy local-review button.
 * Capture that click before its old prompt/copy handler and route
 * the same server-issued secure review directly to this device.
 */
document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        '[data-proposal-action="issue-client-review"]'
      );

    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    openInPersonReview(
      button
    );
  },
  true
);
