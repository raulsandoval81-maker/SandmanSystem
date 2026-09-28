import { auth, functions } from "/assets/js/firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { requireManagement, managementLoginUrl } from "/management/shared/guards/management-guard.js";

const $ = (id) => document.getElementById(id);
const form = $("memberSearchForm");
const searchInput = $("memberSearch");
const searchButton = $("searchButton");
const searchStatus = $("searchStatus");
const results = $("searchResults");
const detail = $("memberDetail");
let managementContext = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '\"':"&quot;" })[char]);
}

function labelMode(mode) {
  return ({ parent_managed:"Parent Managed", hybrid:"Hybrid", self_managed:"Self Managed", unclassified:"Mode Not Recorded" })[mode] || "Parent Managed";
}

function setStatus(message, error = false) {
  searchStatus.textContent = message || "";
  searchStatus.classList.toggle("is-error", error);
}

function renderSummaryItem(label, value) {
  return `<div class="summary-item"><span>${esc(label)}</span><strong>${esc(value || "—")}</strong></div>`;
}

function recoveryState(member) {
  const active = member.directAccessActive === true;
  const email = String(member.athleteEmail || "").trim().toLowerCase();

  if (!active) {
    return {
      label: "Needs Access Setup",
      message: "No direct Athlete login is bound to this athlete record. Issue Athlete Access rather than sending a password reset."
    };
  }

  if (member.accessMode === "unclassified") {
    return {
      label: "Needs Access Review",
      message: "A login is bound, but the access mode is not recorded. Do not issue a duplicate invitation. Confirm the athlete email and recover the existing login first."
    };
  }

  if (!email) {
    return {
      label: "Needs Email Verification",
      message: "A login is bound, but no Athlete email is stored on this member record. Verify the athlete's known login email before sending recovery."
    };
  }

  return {
    label: "Recovery Ready",
    message: "A direct Athlete login is already bound. Use password recovery if the athlete cannot sign in; do not create another Athlete Access invitation."
  };
}

function renderMember(member) {
  const active = member.directAccessActive === true;
  const recovery = recoveryState(member);
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
      ${renderSummaryItem("Pathway", member.pathway)}
      ${renderSummaryItem("Primary Discipline", member.primaryDiscipline)}
      ${renderSummaryItem("Location", member.locationId)}
      ${renderSummaryItem("Access Mode", labelMode(member.accessMode))}
      ${renderSummaryItem("Parent Link", member.parentLinkStatus)}
    </div>

    <section class="access-panel">
      <div class="access-title">
        <strong>Member Access Recovery</strong>
        <span class="status-badge ${active ? "is-active" : ""}">${esc(recovery.label)}</span>
      </div>
      <p class="muted-note">${esc(recovery.message)}</p>
      ${active ? renderActiveAccess(member) : renderInvitationForm(member)}
    </section>`;
  wireMemberActions(member);
}

function renderActiveAccess(member) {
  const email = String(member.athleteEmail || "").trim().toLowerCase();

  const emailBlock = email
    ? `<p class="muted-note"><strong>Athlete login email:</strong> ${esc(email)}</p>`
    : `<div class="access-form">
        <label for="recoveryEmail">Verified Athlete login email</label>
        <input id="recoveryEmail" type="email" autocomplete="email" placeholder="athlete@example.com">
        <p class="muted-note">Use the email the athlete says they used for Sandman. This does not change the athlete record; it only sends account recovery.</p>
      </div>`;

  const recoveryActions = `
    <div class="action-row">
      <button id="sendResetButton" class="button button-primary" type="button">Send Password Reset</button>
      <a class="button" href="/athletes/auth/" target="_blank" rel="noopener">Open Athlete Login</a>
    </div>`;

  const transitionAction = member.accessMode === "hybrid"
    ? `<div class="action-row"><button id="transitionButton" class="button" type="button">Transition to Self Managed</button></div>`
    : "";

  const classificationNote = member.accessMode === "unclassified"
    ? `<p class="muted-note">The athlete has a bound login, but Management does not have a recorded lifecycle access mode. Password recovery can still be used when the Athlete login email is confirmed; access-mode classification remains a separate repair.</p>`
    : "";

  return `
    ${emailBlock}
    ${classificationNote}
    ${recoveryActions}
    ${transitionAction}
    <div id="recoveryResult" class="invitation-result" hidden></div>`;
}

function renderInvitationForm(member) {
  return `
    <div class="access-form">
      <label for="athleteAccessEmail">Approved Athlete email</label>
      <input id="athleteAccessEmail" type="email" autocomplete="email" value="${esc(member.athleteEmail)}" placeholder="athlete@example.com">

      <label for="athleteAccessMode">Direct access mode</label>
      <select id="athleteAccessMode">
        <option value="hybrid">Hybrid</option>
        <option value="self_managed">Self Managed</option>
      </select>

      <label id="parentApprovalRow" class="approval-row">
        <input id="parentApproval" type="checkbox">
        <span>Parent approval for hybrid direct access is recorded.</span>
      </label>

      <div class="action-row">
        <button id="issueAccessButton" class="button button-primary" type="button">Issue Athlete Access</button>
      </div>

      <div id="accessResult" class="invitation-result" hidden></div>
    </div>`;
}

function wireMemberActions(member) {
  const mode = $("athleteAccessMode");
  const approvalRow = $("parentApprovalRow");
  const syncApproval = () => {
    if (approvalRow) approvalRow.hidden = mode?.value !== "hybrid";
  };
  mode?.addEventListener("change", syncApproval);
  syncApproval();

  $("issueAccessButton")?.addEventListener("click", async () => {
    const email = String($("athleteAccessEmail")?.value || "").trim().toLowerCase();
    const accessMode = mode?.value || "";
    const parentApproved = accessMode === "hybrid" && $("parentApproval")?.checked === true;

    if (!email) return setStatus("Enter the approved Athlete email.", true);
    if (accessMode === "hybrid" && !parentApproved) {
      return setStatus("Record Parent approval before issuing hybrid access.", true);
    }

    const button = $("issueAccessButton");
    button.disabled = true;

    try {
      const response = await httpsCallable(functions, "issueAccessInvitation")({
        role: "athlete",
        athleteUid: member.athleteId,
        email,
        accessMode,
        parentApproved
      });

      const tokenId = String(response.data?.tokenId || "");
      const url = `${location.origin}/athletes/access/activate/?id=${encodeURIComponent(member.athleteId)}&token=${encodeURIComponent(tokenId)}&email=${encodeURIComponent(email)}`;
      const output = $("accessResult");
      output.hidden = false;
      output.innerHTML = `Invitation ready: <a href="${esc(url)}" target="_blank" rel="noopener">Open Athlete activation</a>`;
      setStatus("Athlete access invitation issued.");
    } catch (error) {
      setStatus(error?.message || "Unable to issue Athlete access.", true);
      button.disabled = false;
    }
  });

  $("sendResetButton")?.addEventListener("click", async () => {
    const storedEmail = String(member.athleteEmail || "").trim().toLowerCase();
    const verifiedEmail = String($("recoveryEmail")?.value || "").trim().toLowerCase();
    const email = storedEmail || verifiedEmail;

    if (!email) {
      return setStatus("Enter the verified Athlete login email before sending recovery.", true);
    }

    const button = $("sendResetButton");
    button.disabled = true;

    try {
      await sendPasswordResetEmail(auth, email);
      const output = $("recoveryResult");
      if (output) {
        output.hidden = false;
        output.textContent = `Recovery email requested for ${email}.`;
      }
      setStatus("Password recovery email requested for the Athlete account.");
    } catch (error) {
      console.error("[management-members] password reset failed", error);
      setStatus("Unable to request Athlete password recovery right now. Confirm the login email and try again.", true);
    } finally {
      button.disabled = false;
    }
  });

  $("transitionButton")?.addEventListener("click", async () => {
    if (!window.confirm("Transition this Athlete to self-managed access? Parent relationships will remain unchanged.")) return;
    const button = $("transitionButton");
    button.disabled = true;

    try {
      await httpsCallable(functions, "transitionAthleteAccessMode")({
        athleteUid: member.athleteId,
        targetMode: "self_managed"
      });
      member.accessMode = "self_managed";
      renderMember(member);
      setStatus("Athlete access is now Self Managed.");
    } catch (error) {
      setStatus(error?.message || "Unable to update Athlete access.", true);
      button.disabled = false;
    }
  });
}

async function searchMembers(search) {
  const response = await httpsCallable(functions, "searchManagementMembers")({ search });
  return Array.isArray(response.data?.members) ? response.data.members : [];
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  detail.hidden = true;
  results.innerHTML = "";
  searchButton.disabled = true;
  setStatus("Searching existing athletes…");

  try {
    const members = await searchMembers(searchInput.value);
    if (!members.length) return setStatus("No athlete found in your Management scope.");

    if (members.length === 1) {
      renderMember(members[0]);
      setStatus("Existing athlete found. Review Member Access Recovery below.");
      return;
    }

    setStatus(`${members.length} athletes found. Select one.`);
    results.innerHTML = members
      .map((member, index) => `<button class="result-button" type="button" data-result-index="${index}"><strong>${esc(member.name)}</strong><span>${esc(member.athleteId)}</span></button>`)
      .join("");

    results.querySelectorAll("[data-result-index]").forEach((button) => {
      button.addEventListener("click", () => {
        renderMember(members[Number(button.dataset.resultIndex)]);
        setStatus("Existing athlete selected. Review Member Access Recovery below.");
      });
    });
  } catch (error) {
    setStatus(error?.message || "Unable to search Members.", true);
  } finally {
    searchButton.disabled = false;
  }
});

(async () => {
  try {
    managementContext = await requireManagement();
    $("managerIdentity").textContent = managementContext.staff.fullName || managementContext.user.email || "Management access verified";
  } catch (error) {
    console.error("[management-members] access denied", error);
    window.location.replace(managementLoginUrl());
  }
})();
