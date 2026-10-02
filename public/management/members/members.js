import { auth, functions } from "/assets/js/firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  requireManagement,
  managementLoginUrl
} from "/management/shared/guards/management-guard.js";

const $ = (id) => document.getElementById(id);

const form = $("memberSearchForm");
const searchInput = $("memberSearch");
const searchButton = $("searchButton");
const searchStatus = $("searchStatus");
const results = $("searchResults");
const detail = $("memberDetail");

let managementContext = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);
}

function setStatus(message, error = false) {
  searchStatus.textContent = message || "";
  searchStatus.classList.toggle("is-error", error);
}

function renderSummaryItem(label, value) {
  return `
    <div class="summary-item">
      <span>${esc(label)}</span>
      <strong>${esc(value || "—")}</strong>
    </div>
  `;
}

function statusLabel(value) {
  return ({
    active: "Active",
    sent: "Invitation Sent",
    invitation_created: "Invitation Created",
    not_started: "Not Activated",
    not_applicable: "Not Applicable"
  })[String(value || "").trim().toLowerCase()] || "Not Activated";
}

function isAdult(member) {
  return Number.isFinite(Number(member.age)) && Number(member.age) >= 18;
}

function athleteNeedsParentApproval(member) {
  const age = Number(member.age);
  return !Number.isFinite(age) || age < 14;
}

async function getAccessStatus(member) {
  const response = await httpsCallable(
    functions,
    "getAccessSetupStatus"
  )({
    athleteUids: [member.athleteId]
  });

  return response.data?.statuses?.[member.athleteId] || {
    parentStatus: "not_started",
    athleteStatus:
      member.directAccessActive === true
        ? "active"
        : "not_started"
  };
}

function accessLane({
  role,
  member,
  status
}) {
  const athleteLane = role === "athlete";
  const adult = isAdult(member);

  if (role === "parent" && adult) {
    return "";
  }

  const email = athleteLane
    ? String(member.athleteEmail || "").trim().toLowerCase()
    : String(member.parentEmail || "").trim().toLowerCase();

  const active =
    String(status || "").trim().toLowerCase() === "active";

  const needsApproval =
    athleteLane &&
    !active &&
    athleteNeedsParentApproval(member);

  const title =
    athleteLane
      ? "Athlete Access"
      : "Parent Access";

  const description =
    active
      ? athleteLane
        ? "This Athlete login is already active. Use recovery if the athlete cannot sign in."
        : "This Parent account is already connected. Use recovery if the Parent cannot sign in."
      : athleteLane
        ? needsApproval
          ? "Direct Athlete access may be issued after Parent / Guardian approval is recorded."
          : "Direct Athlete access may be issued without a Parent approval gate."
        : "Parent first-time access is tied to the approved Parent email on the athlete record.";

  const emailLabel =
    athleteLane
      ? "Athlete email"
      : "Approved Parent email";

  const actionBlock = active
    ? `
      <div class="action-row">
        <button
          class="button button-primary"
          type="button"
          data-recovery-role="${role}"
        >
          Send Password Reset
        </button>

        <a
          class="button"
          href="${athleteLane ? "/athletes/auth/" : "/parent/auth.html"}"
          target="_blank"
          rel="noopener"
        >
          Open ${athleteLane ? "Athlete" : "Parent"} Login
        </a>
      </div>
    `
    : `
      ${needsApproval
        ? `
          <label class="approval-row">
            <input type="checkbox" data-parent-approval>
            <span>
              Parent / Guardian approval for direct Athlete access is recorded.
            </span>
          </label>
        `
        : ""}

      <div class="action-row">
        <button
          class="button button-primary"
          type="button"
          data-send-access-role="${role}"
        >
          ${String(status || "") === "not_started"
            ? `Send ${athleteLane ? "Athlete" : "Parent"} First-Time Access`
            : `Resend ${athleteLane ? "Athlete" : "Parent"} Access`}
        </button>
      </div>
    `;

  return `
    <section class="access-lane" data-access-lane="${role}">
      <div class="access-title">
        <strong>${title}</strong>
        <span class="status-badge ${active ? "is-active" : ""}" data-role-status="${role}">
          ${esc(statusLabel(status))}
        </span>
      </div>

      <p class="muted-note">${esc(description)}</p>

      <div class="access-form">
        <label>
          ${emailLabel}
          <input
            type="email"
            data-role-email="${role}"
            value="${esc(email)}"
            ${role === "parent" ? "readonly" : ""}
            autocomplete="email"
            placeholder="${athleteLane ? "athlete@example.com" : "parent@example.com"}"
          >
        </label>

        ${actionBlock}

        <div
          class="invitation-result"
          data-role-result="${role}"
          hidden
        ></div>
      </div>
    </section>
  `;
}

async function renderMember(member) {
  detail.hidden = false;

  detail.innerHTML = `
    <div class="member-card__head">
      <div>
        <p class="eyebrow">Existing Athlete</p>
        <h2>${esc(member.name)}</h2>
        <div class="member-id">${esc(member.athleteId)}</div>
      </div>
    </div>

    <div class="summary-grid">
      ${renderSummaryItem("Roster / Member", member.memberStatus)}
      ${renderSummaryItem("Age", Number.isFinite(Number(member.age)) ? String(member.age) : "Not confirmed")}
      ${renderSummaryItem("Pathway", member.pathway)}
      ${renderSummaryItem("Primary Discipline", member.primaryDiscipline)}
      ${renderSummaryItem("Location", member.locationId)}
      ${renderSummaryItem("Parent Link", isAdult(member) ? "Not Applicable" : member.parentLinkStatus)}
    </div>

    <section class="access-panel">
      <div class="access-title">
        <strong>Member Access</strong>
      </div>

      <p class="muted-note">
        Manage Parent and Athlete login access for this existing member. This does not recreate enrollment or change the athlete record.
      </p>

      <div id="memberAccessLanes" class="member-access-lanes">
        <p class="muted-note">Loading access status…</p>
      </div>
    </section>
  `;

  try {
    const status = await getAccessStatus(member);
    const lanes = $("memberAccessLanes");

    lanes.innerHTML =
      accessLane({
        role: "parent",
        member,
        status: isAdult(member)
          ? "not_applicable"
          : status.parentStatus
      }) +
      accessLane({
        role: "athlete",
        member,
        status: status.athleteStatus
      });

    wireMemberActions(member);
  } catch (error) {
    console.error("[management-members] access status failed", error);

    $("memberAccessLanes").innerHTML =
      `<p class="muted-note">Unable to load access status. ${esc(error?.message || "")}</p>`;
  }
}

function laneFor(element) {
  return element.closest("[data-access-lane]");
}

async function issueAndSendAccess(member, role, button) {
  const lane = laneFor(button);
  const email = String(
    lane?.querySelector(`[data-role-email="${role}"]`)?.value || ""
  ).trim().toLowerCase();

  const result =
    lane?.querySelector(`[data-role-result="${role}"]`);

  const statusBadge =
    lane?.querySelector(`[data-role-status="${role}"]`);

  if (!email || !email.includes("@")) {
    return setStatus(
      `Enter a valid ${role === "parent" ? "Parent" : "Athlete"} email.`,
      true
    );
  }

  let parentApproved = false;

  if (
    role === "athlete" &&
    athleteNeedsParentApproval(member)
  ) {
    const approval =
      lane?.querySelector("[data-parent-approval]");

    if (!approval?.checked) {
      return setStatus(
        "Record Parent / Guardian approval before issuing direct Athlete access for an athlete under 14.",
        true
      );
    }

    parentApproved = true;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Sending…";

  if (result) {
    result.hidden = false;
    result.textContent =
      "Creating and sending the one-time access shortcut…";
  }

  try {
    const issueResponse = await httpsCallable(
      functions,
      "issueAccessInvitation"
    )({
      role,
      athleteUid: member.athleteId,
      email,
      ...(role === "athlete"
        ? { parentApproved }
        : {})
    });

    const tokenId =
      String(issueResponse.data?.tokenId || "").trim();

    if (!tokenId) {
      throw new Error(
        "Access invitation token was not returned."
      );
    }

    await httpsCallable(
      functions,
      "sendAccessInvitationEmail"
    )({
      role,
      athleteUid: member.athleteId,
      email,
      tokenId
    });

    if (statusBadge) {
      statusBadge.textContent = "Invitation Sent";
    }

    if (result) {
      result.textContent =
        `First-time ${role === "parent" ? "Parent" : "Athlete"} access sent to ${email}.`;
    }

    button.textContent =
      `Resend ${role === "parent" ? "Parent" : "Athlete"} Access`;

    setStatus(
      `${role === "parent" ? "Parent" : "Athlete"} first-time access sent.`
    );
  } catch (error) {
    console.error("[management-members] access send failed", error);

    if (result) {
      result.textContent =
        error?.message ||
        "Unable to send first-time access.";
    }

    setStatus(
      error?.message ||
      "Unable to send first-time access.",
      true
    );

    button.textContent = originalLabel;
  } finally {
    button.disabled = false;
  }
}

async function sendRecovery(member, role, button) {
  const lane = laneFor(button);
  const email = String(
    lane?.querySelector(`[data-role-email="${role}"]`)?.value || ""
  ).trim().toLowerCase();

  const result =
    lane?.querySelector(`[data-role-result="${role}"]`);

  if (!email || !email.includes("@")) {
    return setStatus(
      `Confirm the ${role === "parent" ? "Parent" : "Athlete"} login email before sending recovery.`,
      true
    );
  }

  button.disabled = true;

  try {
    await sendPasswordResetEmail(auth, email);

    if (result) {
      result.hidden = false;
      result.textContent =
        `Password recovery requested for ${email}.`;
    }

    setStatus(
      `${role === "parent" ? "Parent" : "Athlete"} password recovery requested.`
    );
  } catch (error) {
    console.error("[management-members] password reset failed", error);

    if (result) {
      result.hidden = false;
      result.textContent =
        "Unable to request password recovery right now.";
    }

    setStatus(
      "Unable to request password recovery right now. Confirm the login email and try again.",
      true
    );
  } finally {
    button.disabled = false;
  }
}

function wireMemberActions(member) {
  detail
    .querySelectorAll("[data-send-access-role]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        issueAndSendAccess(
          member,
          button.dataset.sendAccessRole,
          button
        );
      });
    });

  detail
    .querySelectorAll("[data-recovery-role]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        sendRecovery(
          member,
          button.dataset.recoveryRole,
          button
        );
      });
    });
}

async function searchMembers(search) {
  const response = await httpsCallable(
    functions,
    "searchManagementMembers"
  )({ search });

  return Array.isArray(response.data?.members)
    ? response.data.members
    : [];
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  detail.hidden = true;
  results.innerHTML = "";
  searchButton.disabled = true;
  setStatus("Searching existing athletes…");

  try {
    const members =
      await searchMembers(searchInput.value);

    if (!members.length) {
      return setStatus(
        "No athlete found in your Management scope."
      );
    }

    if (members.length === 1) {
      await renderMember(members[0]);
      setStatus(
        "Existing athlete found. Review Member Access below."
      );
      return;
    }

    setStatus(
      `${members.length} athletes found. Select one.`
    );

    results.innerHTML = members
      .map(
        (member, index) =>
          `<button class="result-button" type="button" data-result-index="${index}">
            <strong>${esc(member.name)}</strong>
            <span>${esc(member.athleteId)}</span>
          </button>`
      )
      .join("");

    results
      .querySelectorAll("[data-result-index]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          await renderMember(
            members[Number(button.dataset.resultIndex)]
          );

          setStatus(
            "Existing athlete selected. Review Member Access below."
          );
        });
      });
  } catch (error) {
    setStatus(
      error?.message ||
      "Unable to search Members.",
      true
    );
  } finally {
    searchButton.disabled = false;
  }
});

(async () => {
  try {
    managementContext =
      await requireManagement();

    $("managerIdentity").textContent =
      managementContext.staff.fullName ||
      managementContext.user.email ||
      "Management access verified";
  } catch (error) {
    console.error(
      "[management-members] access denied",
      error
    );

    window.location.replace(
      managementLoginUrl()
    );
  }
})();
