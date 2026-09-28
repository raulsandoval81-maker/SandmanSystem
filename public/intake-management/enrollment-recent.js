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

function renderCard(athlete = {}) {
  const uid = athlete.uid || athlete.id;
  const name = athlete.publicName || athlete.fullName || uid;
  const parentEmail = String(athlete.parentEmail || "").trim();
  const athleteEmail = String(
    athlete.athleteEmail || athlete.email || ""
  ).trim();
  const role = String(
    athlete.registrantRole || athlete.intakeAudience || ""
  ).trim();
  const accessMode = String(athlete.access?.mode || "")
    .trim()
    .toLowerCase();
  const authUid = String(athlete.authUid || "").trim();
  const adult = isAdultAthlete(athlete);
  const age = athleteAge(athlete);
  const disciplines = disciplinesFor(athlete);

  const normalizedMode = String(
    accessMode || (authUid ? "" : "parent_managed")
  ).trim().toLowerCase();

  const athleteAccessAction = authUid
    ? normalizedMode === "hybrid"
      ? `<button class="small outline-blue" data-recent-self-managed-uid="${esc(uid)}">Transition to Self-Managed</button>`
      : `<span class="pending-card-meta small">Direct Athlete access active${normalizedMode ? ` · ${esc(normalizedMode)}` : ""}</span>`
    : `<button class="small outline-blue" data-recent-athlete-access-uid="${esc(uid)}" data-athlete-email="${esc(athleteEmail)}" data-adult-athlete="${adult ? "true" : "false"}">Approve Direct Athlete Access</button>`;

  const parentAction = adult
    ? `<span class="recent-adult-note">Adult athlete${age !== null ? ` · age ${esc(age)}` : ""} · Parent access not applicable</span>`
    : `<button class="small outline-blue" data-recent-parent-uid="${esc(uid)}" data-parent-email="${esc(parentEmail)}">Create Parent Access</button>`;

  return `
    <div class="pending-card recent-activated-card" data-recent-athlete="${esc(uid)}">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(athlete.city, athlete.state))}</div>
          <div class="pending-card-id">${esc(uid)}</div>
          ${adult
            ? ""
            : parentEmail
              ? `<div class="pending-card-meta small">${esc(parentEmail)}</div>`
              : ""}
        </div>
      </div>

      <div class="pending-card-actions">
        ${athleteAccessAction}
        ${parentAction}
        <button class="small solid-blue" data-recent-assessment-uid="${esc(uid)}" data-assessment-disciplines="${esc(JSON.stringify(disciplines))}">Send Coach Assessment</button>
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

  return snapshots
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

async function handleAthleteAccess(button) {
  const uid = String(
    button.dataset.recentAthleteAccessUid || ""
  ).trim();
  if (!uid) return;

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Creating Access…";

  try {
    const approvedEmail = window.prompt(
      "Confirm the approved Athlete login email:",
      String(button.dataset.athleteEmail || "")
        .trim()
        .toLowerCase()
    );

    if (!approvedEmail) {
      throw new Error("Athlete login email is required.");
    }

    const adult =
      button.dataset.adultAthlete === "true";

    const defaultMode = adult
      ? "self_managed"
      : "hybrid";

    const accessMode = String(
      window.prompt(
        "Direct access mode: hybrid or self_managed",
        defaultMode
      ) || ""
    ).trim().toLowerCase();

    if (adult && accessMode !== "self_managed") {
      throw new Error(
        "Adult Athlete access must be self-managed."
      );
    }

    const parentApproved = accessMode === "hybrid"
      ? window.confirm(
          "Confirm that Parent approval for hybrid Athlete access is recorded."
        )
      : false;

    if (accessMode === "hybrid" && !parentApproved) {
      throw new Error(
        "Hybrid Athlete access requires recorded Parent approval."
      );
    }

    const issue = httpsCallable(
      functions,
      "issueAccessInvitation"
    );

    const response = await issue({
      role: "athlete",
      athleteUid: uid,
      email: approvedEmail,
      accessMode,
      parentApproved
    });

    const tokenId = String(
      response?.data?.tokenId || ""
    ).trim();

    if (!tokenId) {
      throw new Error("Athlete access token was not returned.");
    }

    const onboardingUrl =
      `${location.origin}/access/first-time/?role=athlete` +
      `&id=${encodeURIComponent(uid)}` +
      `&token=${encodeURIComponent(tokenId)}` +
      `&email=${encodeURIComponent(approvedEmail.trim().toLowerCase())}`;

    window.open(onboardingUrl, "_blank", "noopener");
  } catch (error) {
    console.error("Create Athlete Access failed:", error);
    window.alert(
      error?.message || "Unable to create Athlete Access."
    );
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
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

async function handleParentAccess(button) {
  const uid = String(
    button.dataset.recentParentUid || ""
  ).trim();
  const email = String(
    button.dataset.parentEmail || ""
  ).trim().toLowerCase();

  if (!uid || !email) {
    window.alert(
      "This athlete does not have an approved Parent email."
    );
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Creating Access…";

  try {
    const issue = httpsCallable(
      functions,
      "issueAccessInvitation"
    );

    const response = await issue({
      role: "parent",
      athleteUid: uid,
      email
    });

    const tokenId = String(
      response?.data?.tokenId || ""
    ).trim();

    if (!tokenId) {
      throw new Error("Parent invitation token was not returned.");
    }

    const url =
      `${location.origin}/access/first-time/?role=parent` +
      `&token=${encodeURIComponent(tokenId)}` +
      `&email=${encodeURIComponent(email)}`;

    window.open(url, "_blank", "noopener");
  } catch (error) {
    console.error("Create Parent Access failed:", error);
    window.alert(
      error?.message || "Unable to create Parent Access."
    );
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function wireActions() {
  const box = $("approved-list");
  if (!box || box.dataset.recentActionsWired === "true") return;

  box.dataset.recentActionsWired = "true";
  box.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.recentAssessmentUid) {
      handleAssessment(button);
      return;
    }

    if (button.dataset.recentAthleteAccessUid) {
      handleAthleteAccess(button);
      return;
    }

    if (button.dataset.recentSelfManagedUid) {
      handleSelfManaged(button);
      return;
    }

    if (button.dataset.recentParentUid) {
      handleParentAccess(button);
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
