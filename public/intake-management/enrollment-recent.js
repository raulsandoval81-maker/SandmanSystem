import {
  db,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";

const RECENT_LIMIT = 5;
const $ = (id) => document.getElementById(id);

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCityState(city, state) {
  const c = String(city || "").trim();
  const s = String(state || "").trim();
  if (c && s) return `${c}, ${s}`;
  return c || s || "—";
}

function scopeLocationChunks(managementContext) {
  const ids = Array.isArray(managementContext?.scope?.locationIds)
    ? [...new Set(
        managementContext.scope.locationIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )]
    : [];

  const chunks = [];
  for (let index = 0; index < ids.length; index += 10) {
    chunks.push(ids.slice(index, index + 10));
  }
  return chunks;
}

function dateFromValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function ageFromDob(value) {
  const dob = dateFromValue(value);
  if (!dob) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();

  if (
    month < 0 ||
    (month === 0 && now.getDate() < dob.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

function athleteAge(athlete = {}) {
  const directAge = Number(
    athlete.age ??
    athlete.athleteAge ??
    athlete.profile?.age
  );

  if (Number.isFinite(directAge) && directAge >= 0) {
    return directAge;
  }

  return ageFromDob(
    athlete.dob ||
    athlete.dateOfBirth ||
    athlete.birthDate ||
    athlete.athlete?.dob ||
    athlete.athlete?.dateOfBirth ||
    athlete.profile?.dob ||
    athlete.profile?.dateOfBirth
  );
}

function isAdultAthlete(athlete = {}) {
  const role = String(
    athlete.registrantRole ||
    athlete.intakeAudience ||
    athlete.registrationRole ||
    ""
  ).trim().toLowerCase();

  if (role === "adult_athlete" || role === "adult-athlete") {
    return true;
  }

  const age = athleteAge(athlete);
  return age !== null && age >= 18;
}

function disciplinesFor(athlete = {}) {
  return [...new Set([
    ...(Array.isArray(athlete.disciplineIds)
      ? athlete.disciplineIds
      : []),
    ...(athlete.disciplines &&
      typeof athlete.disciplines === "object" &&
      !Array.isArray(athlete.disciplines)
        ? Object.keys(athlete.disciplines)
        : []),
    athlete.primaryDiscipline,
    athlete.activeDiscipline,
    athlete.discipline
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean))];
}

function accessStatusLabel(status = "not_started") {
  const labels = {
    active: "Active",
    sent: "Invitation Sent",
    invitation_created: "Invitation Created",
    not_started: "Not Activated",
    not_applicable: "Not Applicable"
  };

  return labels[status] || "Not Activated";
}

function renderAccessSection({
  role,
  uid,
  email,
  status,
  age,
  adult
}) {
  if (role === "parent" && adult) {
    return "";
  }

  const isAthlete =
    role === "athlete";

  const needsApproval =
    isAthlete &&
    (age === null || age < 14);

  const title =
    isAthlete
      ? "Athlete Access"
      : "Parent Access";

  const sendLabel =
    status === "not_started"
      ? `Send ${isAthlete ? "Athlete" : "Parent"} First-Time Access`
      : `Resend ${isAthlete ? "Athlete" : "Parent"} Access`;

  return `
    <section class="access-setup-section">
      <div class="access-setup-head">
        <div>
          <strong>${title}</strong>
          <span class="access-status" data-access-status="${esc(role)}">
            ${esc(accessStatusLabel(status))}
          </span>
        </div>
      </div>

      <label class="access-email-label">
        ${isAthlete ? "Athlete email" : "Approved Parent email"}
        <input
          type="email"
          value="${esc(email || "")}"
          data-access-email="${esc(role)}"
          ${role === "parent" ? "readonly" : ""}
          autocomplete="off"
        >
      </label>

      ${needsApproval
        ? `
          <label class="access-approval">
            <input
              type="checkbox"
              data-parent-approval="${esc(uid)}"
            >
            <span>
              Parent / Guardian approval for direct Athlete access is recorded.
            </span>
          </label>
        `
        : ""}

      <button
        type="button"
        class="small outline-blue"
        data-send-access-role="${esc(role)}"
        data-send-access-uid="${esc(uid)}"
        data-access-age="${age === null ? "" : esc(age)}"
      >
        ${esc(sendLabel)}
      </button>

      <div class="small muted access-action-status" data-access-message="${esc(role)}"></div>
    </section>
  `;
}

function renderCard(athlete = {}) {
  const uid = athlete.uid || athlete.id;
  const name = athlete.publicName || athlete.fullName || uid;
  const parentEmail = String(athlete.parentEmail || "").trim();
  const athleteEmail = String(
    athlete.athleteEmail || athlete.email || ""
  ).trim();
  const authUid = String(athlete.authUid || "").trim();
  const adult = isAdultAthlete(athlete);
  const age = athleteAge(athlete);
  const disciplines = disciplinesFor(athlete);

  const parentStatus =
    adult
      ? "not_applicable"
      : athlete._parentAccessStatus || "not_started";

  const athleteStatus =
    authUid
      ? "active"
      : athlete._athleteAccessStatus || "not_started";

  return `
    <div class="pending-card recent-activated-card" data-recent-athlete="${esc(uid)}">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(athlete.city, athlete.state))}</div>
          <div class="pending-card-id">${esc(uid)}</div>
          ${adult
            ? `<div class="pending-card-meta small">Adult athlete${age !== null ? ` · age ${esc(age)}` : ""}</div>`
            : parentEmail
              ? `<div class="pending-card-meta small">${esc(parentEmail)}</div>`
              : ""}
        </div>
      </div>

      <div class="pending-card-actions">
        <button
          type="button"
          class="small outline-blue"
          data-access-toggle-uid="${esc(uid)}"
          aria-expanded="false"
        >
          Access Setup
        </button>

        <button
          class="small solid-blue"
          data-recent-assessment-uid="${esc(uid)}"
          data-assessment-disciplines="${esc(JSON.stringify(disciplines))}"
        >
          Send Coach Assessment
        </button>
      </div>

      <div class="access-setup-panel" data-access-panel-uid="${esc(uid)}" hidden>
        ${renderAccessSection({
          role: "parent",
          uid,
          email: parentEmail,
          status: parentStatus,
          age,
          adult
        })}

        ${renderAccessSection({
          role: "athlete",
          uid,
          email: athleteEmail,
          status: athleteStatus,
          age,
          adult
        })}
      </div>
    </div>
  `;
}

function installStyles() {
  if (document.getElementById("recentActivatedStyles")) return;

  const style = document.createElement("style");
  style.id = "recentActivatedStyles";
  style.textContent = `
    body.management-enrollment-page .recent-activated-primary{
      display:grid;
      gap:10px;
    }

    body.management-enrollment-page .recent-activated-more{
      margin-top:10px;
      border:1px solid var(--management-border,#e3dac5);
      border-radius:12px;
      background:var(--management-surface-soft,#faf6ec);
      overflow:hidden;
    }

    body.management-enrollment-page .recent-activated-more summary{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:11px 13px;
      color:var(--management-text,#172033);
      font-weight:800;
      cursor:pointer;
      list-style:none;
      user-select:none;
    }

    body.management-enrollment-page .recent-activated-more summary::-webkit-details-marker{
      display:none;
    }

    body.management-enrollment-page .recent-activated-more summary::after{
      content:"⌄";
      color:var(--management-muted,#667085);
      font-size:1rem;
      transition:transform .15s ease;
    }

    body.management-enrollment-page .recent-activated-more[open] summary::after{
      transform:rotate(180deg);
    }

    body.management-enrollment-page .recent-activated-more .pending-list{
      display:grid;
      gap:10px;
      padding:0 10px 10px;
    }

    body.management-enrollment-page .access-setup-panel{
      margin-top:12px;
      display:grid;
      gap:12px;
      padding:14px;
      border:1px solid var(--management-border,#e3dac5);
      border-radius:12px;
      background:var(--management-surface-soft,#faf6ec);
    }

    body.management-enrollment-page .access-setup-panel[hidden]{
      display:none;
    }

    body.management-enrollment-page .access-setup-section{
      display:grid;
      gap:10px;
      padding:13px;
      border:1px solid rgba(23,32,51,.12);
      border-radius:10px;
      background:#fff;
    }

    body.management-enrollment-page .access-setup-head{
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:flex-start;
    }

    body.management-enrollment-page .access-setup-head > div{
      display:flex;
      align-items:center;
      gap:8px;
      flex-wrap:wrap;
    }

    body.management-enrollment-page .access-status{
      display:inline-flex;
      align-items:center;
      min-height:25px;
      padding:3px 8px;
      border-radius:999px;
      background:#eef1f4;
      color:#475467;
      font-size:.7rem;
      font-weight:850;
    }

    body.management-enrollment-page .access-email-label{
      display:grid;
      gap:5px;
      color:var(--management-muted,#667085);
      font-size:.74rem;
      font-weight:800;
    }

    body.management-enrollment-page .access-email-label input{
      width:100%;
      min-height:38px;
      padding:8px 10px;
      border:1px solid var(--management-border,#d7dce4);
      border-radius:8px;
      background:#fff;
      color:var(--management-text,#172033);
      font:inherit;
    }

    body.management-enrollment-page .access-approval{
      display:flex;
      gap:8px;
      align-items:flex-start;
      color:var(--management-text,#172033);
      font-size:.77rem;
      line-height:1.4;
    }

    body.management-enrollment-page .access-approval input{
      margin-top:2px;
    }

    body.management-enrollment-page .access-action-status{
      min-height:18px;
    }

    body.management-enrollment-page .recent-adult-note{
      display:inline-flex;
      align-items:center;
      min-height:32px;
      padding:6px 9px;
      border-radius:999px;
      background:var(--management-neutral-soft,#eef1f4);
      color:var(--management-muted,#667085);
      font-size:.74rem;
      font-weight:750;
    }

    @media(max-width:760px){
      body.management-enrollment-page .recent-activated-more summary{
        align-items:flex-start;
      }

      body.management-enrollment-page .recent-adult-note{
        width:100%;
        border-radius:10px;
      }
    }
  `;

  document.head.appendChild(style);
}

async function loadRecentAthletes(managementContext) {
  const snapshots = managementContext.isSystemAdmin
    ? [await getDocs(
        query(
          collection(db, "athletes"),
          orderBy("createdAt", "desc"),
          limit(RECENT_LIMIT)
        )
      )]
    : await Promise.all(
        scopeLocationChunks(managementContext).map((locations) =>
          getDocs(
            query(
              collection(db, "athletes"),
              where("locationId", "in", locations)
            )
          )
        )
      );

  const athletes = snapshots
    .flatMap((snapshot) => snapshot.docs)
    .map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data()
    }))
    .sort(
      (a, b) =>
        (b.createdAt?.toMillis?.() || 0) -
        (a.createdAt?.toMillis?.() || 0)
    )
    .slice(0, RECENT_LIMIT);

  const uids = athletes
    .map((athlete) => String(athlete.uid || athlete.id || "").trim())
    .filter(Boolean);

  if (!uids.length) {
    return athletes;
  }

  const statusCall =
    httpsCallable(
      functions,
      "getAccessSetupStatus"
    );

  const statusResponse =
    await statusCall({
      athleteUids: uids
    });

  const statuses =
    statusResponse?.data?.statuses || {};

  return athletes.map((athlete) => {
    const uid =
      String(
        athlete.uid ||
        athlete.id ||
        ""
      ).trim();

    const status =
      statuses[uid] || {};

    return {
      ...athlete,
      _parentAccessStatus:
        status.parentStatus ||
        "not_started",
      _athleteAccessStatus:
        status.athleteStatus ||
        (
          String(
            athlete.authUid || ""
          ).trim()
            ? "active"
            : "not_started"
        )
    };
  });
}

function renderRecentList(athletes) {
  const box = $("approved-list");
  if (!box) return;

  const section = box.closest(".enrollment-recent-card");
  const description = section?.querySelector("p.small.muted");
  if (description) {
    description.textContent =
      "Newest activation shown. Expand to review up to five recently activated athletes.";
  }

  if (!athletes.length) {
    box.innerHTML =
      "<div class='muted small'>No recent approvals.</div>";
    return;
  }

  const [first, ...rest] = athletes;

  box.innerHTML = `
    <div class="recent-activated-primary">
      ${renderCard(first)}
    </div>
    ${rest.length
      ? `
        <details class="recent-activated-more">
          <summary>Show ${rest.length} more recently activated</summary>
          <div class="pending-list">
            ${rest.map(renderCard).join("")}
          </div>
        </details>
      `
      : ""}
  `;
}

async function handleAssessment(button) {
  const athleteUid = String(
    button.dataset.recentAssessmentUid || ""
  ).trim();
  if (!athleteUid) return;

  const originalLabel = button.textContent;
  let disciplines = [];

  try {
    disciplines = JSON.parse(
      button.dataset.assessmentDisciplines || "[]"
    );
  } catch {
    disciplines = [];
  }

  const uniqueDisciplines = [...new Set(
    disciplines
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  )];

  let discipline = uniqueDisciplines[0] || "";
  if (uniqueDisciplines.length > 1) {
    discipline = String(
      window.prompt(
        `Assessment discipline (${uniqueDisciplines.join(", ")}):`,
        uniqueDisciplines[0]
      ) || ""
    ).trim().toLowerCase();
    if (!discipline) return;
  }

  button.disabled = true;
  button.textContent = "Sending…";

  try {
    const createPin = httpsCallable(
      functions,
      "createAthleteAssessmentPin"
    );

    const response = await createPin({
      athleteUid,
      ...(discipline ? { discipline } : {})
    });

    button.textContent = response?.data?.duplicate
      ? "Assessment Already Sent"
      : "Assessment Sent";
    button.disabled = true;
  } catch (error) {
    console.error("Coach assessment handoff failed:", error);
    window.alert(
      error?.message || "Unable to send Coach Assessment."
    );
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function accessPanelFor(button) {
  return button.closest(".recent-activated-card")
    ?.querySelector(".access-setup-panel");
}

async function sendAccess(button) {
  const role =
    String(button.dataset.sendAccessRole || "")
      .trim()
      .toLowerCase();

  const uid =
    String(button.dataset.sendAccessUid || "")
      .trim();

  if (!uid || !["parent", "athlete"].includes(role)) {
    return;
  }

  const panel = accessPanelFor(button);

  const emailInput =
    panel?.querySelector(
      `[data-access-email="${role}"]`
    );

  const email =
    String(emailInput?.value || "")
      .trim()
      .toLowerCase();

  const message =
    panel?.querySelector(
      `[data-access-message="${role}"]`
    );

  const status =
    panel?.querySelector(
      `[data-access-status="${role}"]`
    );

  if (!email || !email.includes("@")) {
    window.alert(
      `Enter a valid ${role === "parent" ? "Parent" : "Athlete"} email.`
    );
    return;
  }

  const ageRaw =
    String(button.dataset.accessAge || "").trim();

  const age =
    ageRaw === ""
      ? null
      : Number(ageRaw);

  let parentApproved =
    false;

  if (
    role === "athlete" &&
    (age === null || age < 14)
  ) {
    const approval =
      panel?.querySelector(
        `[data-parent-approval="${uid}"]`
      );

    if (!approval?.checked) {
      window.alert(
        "Record Parent / Guardian approval before issuing direct Athlete access for an athlete under 14."
      );
      return;
    }

    parentApproved = true;
  }

  const originalLabel =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "Sending…";

  if (message) {
    message.textContent =
      "Creating the one-time access shortcut…";
  }

  try {
    const issue =
      httpsCallable(
        functions,
        "issueAccessInvitation"
      );

    const issueResponse =
      await issue({
        role,
        athleteUid: uid,
        email,
        ...(role === "athlete"
          ? { parentApproved }
          : {})
      });

    const tokenId =
      String(
        issueResponse?.data?.tokenId || ""
      ).trim();

    if (!tokenId) {
      throw new Error(
        "Access invitation token was not returned."
      );
    }

    if (message) {
      message.textContent =
        `Sending the one-time shortcut to ${email}…`;
    }

    const deliver =
      httpsCallable(
        functions,
        "sendAccessInvitationEmail"
      );

    await deliver({
      role,
      athleteUid: uid,
      email,
      tokenId
    });

    if (status) {
      status.textContent =
        "Invitation Sent";
    }

    if (message) {
      message.textContent =
        `✓ First-time ${role === "parent" ? "Parent" : "Athlete"} access sent to ${email}.`;
    }

    button.textContent =
      `Resend ${role === "parent" ? "Parent" : "Athlete"} Access`;
  } catch (error) {
    console.error(
      "[access-setup] failed:",
      error
    );

    if (message) {
      message.textContent =
        error?.message ||
        "Unable to send first-time access.";
    }

    window.alert(
      error?.message ||
      "Unable to send first-time access."
    );

    button.textContent =
      originalLabel;
  } finally {
    button.disabled = false;
  }
}

async function handleSelfManaged(button) {
  const uid = String(
    button.dataset.recentSelfManagedUid || ""
  ).trim();

  if (
    !uid ||
    !window.confirm(
      "Transition this Athlete from hybrid to self-managed access? Parent relationships will remain unchanged."
    )
  ) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Updating Access…";

  try {
    const transition = httpsCallable(
      functions,
      "transitionAthleteAccessMode"
    );

    await transition({
      athleteUid: uid,
      targetMode: "self_managed"
    });

    button.replaceWith(
      Object.assign(document.createElement("span"), {
        className: "pending-card-meta small",
        textContent: "Direct Athlete access active · self_managed"
      })
    );
  } catch (error) {
    console.error("Athlete access transition failed:", error);
    window.alert(
      error?.message || "Unable to transition Athlete access."
    );
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function wireActions() {
  const box = $("approved-list");
  if (!box || box.dataset.recentActionsWired === "true") return;

  box.dataset.recentActionsWired = "true";

  box.addEventListener("click", (event) => {
    const button =
      event.target.closest("button");

    if (!button) return;

    if (button.dataset.accessToggleUid) {
      const card =
        button.closest(".recent-activated-card");

      const panel =
        card?.querySelector(
          `[data-access-panel-uid="${button.dataset.accessToggleUid}"]`
        );

      if (!panel) return;

      const opening =
        panel.hidden;

      panel.hidden =
        !opening;

      button.setAttribute(
        "aria-expanded",
        opening ? "true" : "false"
      );

      return;
    }

    if (button.dataset.sendAccessRole) {
      sendAccess(button);
      return;
    }

    if (button.dataset.recentAssessmentUid) {
      handleAssessment(button);
      return;
    }

    if (button.dataset.recentSelfManagedUid) {
      handleSelfManaged(button);
    }
  });
}

async function waitForInitialEnrollmentRender() {
  const box = $("approved-list");
  if (!box) return;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (
      box.querySelector(".pending-card") ||
      /No recent approvals|Error loading approvals/i.test(
        box.textContent || ""
      )
    ) {
      return;
    }

    await new Promise((resolve) =>
      window.setTimeout(resolve, 250)
    );
  }
}

async function boot() {
  installStyles();

  try {
    await waitForInitialEnrollmentRender();
    const managementContext = await requireManagement();
    const athletes = await loadRecentAthletes(managementContext);
    renderRecentList(athletes);
    wireActions();
  } catch (error) {
    console.error("[enrollment-recent] failed:", error);
  }
}

boot();
