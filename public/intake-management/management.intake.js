import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
  functions,
  httpsCallable,
} from "/assets/js/firebase-init.js";

import {
  requireManagement
} from "/management/shared/guards/management-guard.js";

import {
  renderManagementLifecycle
} from "/assets/js/management-lifecycle.js";

const $ = (id) => document.getElementById(id);

const requestedProposalId = String(
  new URLSearchParams(location.search).get("proposalId") || ""
).trim();

const INVITE_HOURS = 48;
const PENDING_LIMIT = 8;

// Keep the just-resolved handoff in memory so rapid repeat clicks cannot
// mint competing links while the proposal-history trigger is catching up.
const handoffCache = new Map();

let currentHandoffTokenId = "";
let currentHandoffAudience = "";

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function handoffKey(proposalId, intakeAudience) {
  return `${proposalId}:${intakeAudience}`;
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function tokenFromInviteLink() {
  const value =
    String($("invite-link")?.value || "").trim();

  if (!value) return "";

  try {
    const url =
      new URL(value, location.origin);

    return String(
      url.searchParams.get("invite") || ""
    ).trim();
  } catch {
    return "";
  }
}

function inviteUrlForToken(tokenId, intakeAudience = "parent_guardian") {
  const route = intakeAudience === "adult_athlete"
    ? "/intake-athlete/"
    : "/intake-parent/";

  return `${location.origin}${route}?invite=${encodeURIComponent(tokenId)}`;
}

function paintInviteHandoff(
  tokenId,
  intakeAudience,
  { recovered = false, handoff = null } = {}
) {
  const audience = intakeAudience === "adult_athlete"
    ? "adult_athlete"
    : "parent_guardian";

  const url = inviteUrlForToken(tokenId, audience);

  currentHandoffTokenId = tokenId;
  currentHandoffAudience = audience;

  if ($("invite-link")) $("invite-link").value = url;

  if ($("btn-send-intake-email")) {
    $("btn-send-intake-email").disabled = false;
    $("btn-send-intake-email").textContent =
      handoff?.deliveryStatus === "SENT" && handoff?.deliveryMethod === "email"
        ? "Resend Intake Email"
        : "Send Intake Email";
  }

  if ($("btn-mark-intake-sent")) {
    $("btn-mark-intake-sent").disabled = false;
  }

  if ($("invite-route-label")) {
    $("invite-route-label").textContent = audience === "adult_athlete"
      ? "Adult Athlete Intake → /intake-athlete/"
      : "Parent / Guardian Intake → /intake-parent/";
  }

  if ($("invite-status")) {
    const label = audience === "adult_athlete"
      ? "Adult athlete"
      : "Parent / guardian";

    const sent = handoff?.deliveryStatus === "SENT";
    const method = handoff?.deliveryMethod === "email" ? "email" : handoff?.deliveryMethod === "text" ? "text" : "manual handoff";
    const destination = handoff?.deliveredTo ? ` to ${handoff.deliveredTo}` : "";
    const sentAt = handoff?.deliveredAt
      ? new Date(Number(handoff.deliveredAt)).toLocaleString()
      : "";
    $("invite-status").textContent = sent
      ? `✓ Secure Intake token confirmed. Invitation recorded as sent by ${method}${destination}${sentAt ? ` on ${sentAt}` : ""}. No new token created.`
      : `✓ Secure ${label.toLowerCase()} Intake token ${recovered ? "already exists" : "created"} and is ready. Email NOT sent yet. Select Send Intake Email to deliver it.`;
  }
}

function paintSubmittedHandoff(intakeId, intakeAudience) {
  const audience = intakeAudience === "adult_athlete"
    ? "Adult athlete"
    : "Parent / guardian";

  currentHandoffTokenId = "";
  currentHandoffAudience = "";

  if ($("invite-link")) $("invite-link").value = "";

  if ($("btn-send-intake-email")) {
    $("btn-send-intake-email").textContent = "Send Intake Email";
  }

  if ($("btn-mark-intake-sent")) {
    $("btn-mark-intake-sent").disabled = true;
  }

  if ($("invite-route-label")) {
    $("invite-route-label").textContent =
      `${audience} intake submitted → Management Review`;
  }

  if ($("invite-status")) {
    $("invite-status").textContent =
      "✓ This family intake has already been submitted. Open it from Pending Intakes to finalize enrollment.";
  }

  if (intakeId) {
    const reviewButton = document.querySelector(
      `[data-intake="${CSS.escape(intakeId)}"]`
    );
    reviewButton?.focus({ preventScroll: true });
  }
}

async function resolveExistingEnrollmentHandoff(
  proposalId,
  intakeAudience
) {
  const audience = intakeAudience === "adult_athlete"
    ? "adult_athlete"
    : "parent_guardian";
  const key = handoffKey(proposalId, audience);

  const cached = handoffCache.get(key);
  if (cached) return cached;

  try {
    const getHandoffStatus =
      httpsCallable(
        functions,
        "getEnrollmentIntakeHandoffStatus"
      );

    const response =
      await getHandoffStatus({
        proposalId,
        intakeAudience: audience,
      });

    const data = response?.data || {};
    const state = String(data.state || "").trim().toLowerCase();

    if (state === "submitted") {
      const result = {
        state: "submitted",
        tokenId: String(data.tokenId || "").trim(),
        intakeId: String(data.intakeId || "").trim(),
        intakeAudience: audience,
      };
      handoffCache.set(key, result);
      return result;
    }

    if (state === "active") {
      const result = {
        state: "active",
        tokenId: String(data.tokenId || "").trim(),
        intakeAudience:
          String(data.intakeAudience || "").trim().toLowerCase() === "adult_athlete"
            ? "adult_athlete"
            : "parent_guardian",
        deliveryStatus: String(data.deliveryStatus || "").trim().toUpperCase(),
        deliveryMethod: String(data.deliveryMethod || "").trim().toLowerCase(),
        manualDelivery: data.manualDelivery === true,
        manualDeliveryNote: String(data.manualDeliveryNote || "").trim(),
        deliveredAt: data.deliveredAt || null,
        deliveredTo: String(data.deliveredTo || "").trim(),
        exp: Number(data.exp || 0),
      };
      handoffCache.set(key, result);
      return result;
    }

    if (state === "expired") {
      return {
        state: "expired",
        tokenId: String(data.tokenId || "").trim(),
        intakeAudience:
          String(data.intakeAudience || "").trim().toLowerCase() === "adult_athlete"
            ? "adult_athlete"
            : "parent_guardian",
        deliveryStatus: String(data.deliveryStatus || "").trim().toUpperCase(),
        deliveryMethod: String(data.deliveryMethod || "").trim().toLowerCase(),
        manualDelivery: data.manualDelivery === true,
        manualDeliveryNote: String(data.manualDeliveryNote || "").trim(),
        deliveredAt: data.deliveredAt || null,
        deliveredTo: String(data.deliveredTo || "").trim(),
        exp: Number(data.exp || 0),
      };
    }
  } catch (err) {
    console.warn(
      "[management-enrollment] authoritative handoff lookup failed; falling back to proposal history:",
      err
    );
  }

  // Fallback for older deployments or temporary callable failure.
  const historySnapshot = await getDocs(
    collection(db, "proposals", proposalId, "history")
  );

  const records = historySnapshot.docs
    .map((historyDoc) => ({
      id: historyDoc.id,
      ...historyDoc.data()
    }))
    .filter((record) =>
      [
        "INTAKE_INVITE_CREATED",
        "INTAKE_INVITE_SENT",
        "INTAKE_INVITE_MANUALLY_SENT"
      ].includes(
        String(record.event || "").trim().toUpperCase()
      ) &&
      String(record.intakeAudience || "").trim().toLowerCase() === audience &&
      String(record.intakeTokenId || "").trim()
    )
    .sort((a, b) =>
      millis(b.occurredAt || b.createdAt) -
      millis(a.occurredAt || a.createdAt)
    );

  for (const record of records) {
    const tokenId = String(record.intakeTokenId || "").trim();
    if (!tokenId) continue;

    const intakeSnap = await getDoc(doc(db, "intakes", tokenId));
    if (intakeSnap.exists()) {
      const intake = intakeSnap.data() || {};
      const status = String(intake.status || "").trim().toLowerCase();

      if (["submitted", "approved"].includes(status)) {
        const result = {
          state: "submitted",
          tokenId,
          intakeId: tokenId,
          intakeAudience: audience,
        };
        handoffCache.set(key, result);
        return result;
      }
    }

    const tokenSnap = await getDoc(doc(db, "intakeTokens", tokenId));
    if (!tokenSnap.exists()) continue;

    const token = tokenSnap.data() || {};
    const exp = Number(token.exp || 0);

    if (
      String(token.proposalId || "").trim() === proposalId &&
      String(token.intakeAudience || "").trim().toLowerCase() === audience &&
      String(token.source || "").trim().toLowerCase() === "management_enrollment" &&
      String(token.mode || "new_athlete").trim().toLowerCase() === "new_athlete" &&
      token.used !== true &&
      (!exp || exp > Date.now())
    ) {
      const result = {
        state: "active",
        tokenId,
        intakeAudience: audience,
        deliveryStatus: String(token.deliveryStatus || "").trim().toUpperCase(),
        deliveryMethod: String(token.deliveryMethod || record.deliveryMethod || "").trim().toLowerCase(),
        manualDelivery:
          token.manualDelivery === true ||
          String(record.event || "").trim().toUpperCase() === "INTAKE_INVITE_MANUALLY_SENT",
        manualDeliveryNote: String(token.manualDeliveryNote || record.note || "").trim(),
        deliveredAt: token.deliveredAt || record.occurredAt || record.createdAt || null,
        deliveredTo: String(token.deliveredTo || record.recipient || "").trim(),
        exp,
      };
      handoffCache.set(key, result);
      return result;
    }
  }

  return null;
}

function reviewUrlForIntake(intakeId) {
  return `/intake-management/review.html?token=${encodeURIComponent(intakeId)}`;
}

function formatNameFromIntake(d = {}) {
  return (
    `${d.athlete?.first ?? ""} ${d.athlete?.last ?? ""}`.trim() ||
    `${d.first ?? ""} ${d.last ?? ""}`.trim() ||
    d.fullName ||
    "(no name)"
  );
}

function formatCityState(city, state) {
  const c = String(city || "").trim();
  const s = String(state || "").trim();
  if (c && s) return `${c}, ${s}`;
  return c || s || "—";
}

function renderPendingCard({ intakeId, name, city, state }) {
  return `
    <div class="pending-card">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(name)}</div>
          <div class="pending-card-meta">${esc(formatCityState(city, state))}</div>
          <div class="pending-card-id">(${esc(intakeId.slice(-6))})</div>
        </div>
      </div>
      <div class="pending-card-actions">
        <button class="small solid-blue" data-intake="${esc(intakeId)}">Review →</button>
      </div>
    </div>
  `;
}

function paidProposalName(proposal = {}) {
  return (
    proposal.prospect?.familyName ||
    proposal.prospect?.primaryContactName ||
    proposal.athletes?.[0]?.name ||
    proposal.proposalId ||
    "Paid Enrollment"
  );
}

function ageFromProposalDob(value) {
  const raw = String(value || "").trim();
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  const dayDiff = today.getDate() - day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

function intakeAudienceForProposal(proposal = {}, athletes = []) {
  const athlete = athletes[0] || {};

  const explicit = String(
    proposal.intakeAudience ||
    proposal.registrantRole ||
    proposal.lockedSnapshot?.intakeAudience ||
    proposal.lockedSnapshot?.registrantRole ||
    proposal.lockedSnapshot?.prospect?.registrantRole ||
    proposal.prospect?.registrantRole ||
    athlete.intakeAudience ||
    athlete.registrantRole ||
    ""
  ).trim().toLowerCase();

  if (["adult_athlete", "adult-athlete"].includes(explicit)) {
    return "adult_athlete";
  }

  if (
    [
      "parent_guardian",
      "parent-guardian",
      "parent",
      "guardian"
    ].includes(explicit)
  ) {
    return "parent_guardian";
  }

  const enrollmentType = String(
    athlete.enrollmentType ||
    proposal.prospect?.enrollmentType ||
    proposal.enrollmentType ||
    ""
  ).trim().toLowerCase();

  if (["adult", "adult_athlete", "adult-athlete"].includes(enrollmentType)) {
    return "adult_athlete";
  }

  if (["youth", "minor", "child"].includes(enrollmentType)) {
    return "parent_guardian";
  }

  const age = ageFromProposalDob(
    athlete.dob ||
    athlete.dateOfBirth ||
    proposal.prospect?.dob ||
    proposal.prospect?.dateOfBirth
  );

  if (age === null) return null;
  return age >= 18 ? "adult_athlete" : "parent_guardian";
}

function formatDateTime(value) {
  const ms = millis(value);
  if (!ms) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function renderAwaitingIntakeCard({ proposal, handoff }) {
  const proposalId = proposal.proposalId || proposal.id;
  const locationId = String(proposal.locationId || "").trim();
  const athletes = Array.isArray(
    proposal.lockedSnapshot?.athletes
  )
    ? proposal.lockedSnapshot.athletes
    : Array.isArray(proposal.athletes)
      ? proposal.athletes
      : [];

  const athleteNames = athletes
    .map((athlete) =>
      String(
        athlete?.name ||
        athlete?.fullName ||
        athlete?.athleteName ||
        [athlete?.first, athlete?.last].filter(Boolean).join(" ") ||
        ""
      ).trim()
    )
    .filter(Boolean);

  const sentAt = formatDateTime(handoff?.deliveredAt);
  const expiresAt = handoff?.exp
    ? formatDateTime(Number(handoff.exp))
    : "—";
  const recipient = String(handoff?.deliveredTo || "").trim();
  const audienceLabel = handoff?.intakeAudience === "adult_athlete"
    ? "Adult Athlete"
    : "Parent / Guardian";

  const deliveryMethod = String(
    handoff?.deliveryMethod || "email"
  ).trim().toLowerCase();

  const deliveryLabel =
    deliveryMethod === "text"
      ? "Text"
      : deliveryMethod === "in_person"
        ? "In Person"
        : "Email";

  const manualNote = String(
    handoff?.manualDeliveryNote || ""
  ).trim();

  return `
    <div class="pending-card awaiting-intake-card" data-awaiting-proposal="${esc(proposalId)}">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(paidProposalName(proposal))}</div>
          <div class="pending-card-meta">Awaiting Intake · ${esc(locationId)}</div>
          ${athleteNames.length
            ? `<div class="pending-card-meta small">${esc(athleteNames.join(" · "))}</div>`
            : ""}
          <div class="pending-card-meta small">
            ${esc(audienceLabel)} · Sent by ${esc(deliveryLabel)} · ${esc(sentAt)}
          </div>
          ${recipient
            ? `<div class="pending-card-meta small">${esc(recipient)}</div>`
            : ""}
          ${manualNote
            ? `<div class="pending-card-meta small">Note: ${esc(manualNote)}</div>`
            : ""}
          <div class="pending-card-meta small">Link expires ${esc(expiresAt)}</div>
          <div class="pending-card-id">${esc(proposalId)}</div>
        </div>
      </div>
      <div class="pending-card-actions">
        <button
          class="small solid-blue"
          data-awaiting-resend="${esc(proposalId)}"
        >
          Remote — Resend Intake Email
        </button>
        <button
          class="small outline-blue"
          data-awaiting-open="${esc(proposalId)}"
        >
          In-Person — Open Intake
        </button>
      </div>
    </div>
  `;
}

function renderReadyIntakeCard(proposal) {
  const proposalId = proposal.proposalId || proposal.id;
  const locationId = String(proposal.locationId || "").trim();
  const athletes = Array.isArray(
    proposal.lockedSnapshot?.athletes
  )
    ? proposal.lockedSnapshot.athletes
    : Array.isArray(proposal.athletes)
      ? proposal.athletes
      : [];

  const athleteNames = athletes
    .map((athlete) =>
      String(
        athlete?.name ||
        athlete?.fullName ||
        athlete?.athleteName ||
        [athlete?.first, athlete?.last].filter(Boolean).join(" ") ||
        ""
      ).trim()
    )
    .filter(Boolean);

  const intakeAudience = intakeAudienceForProposal(proposal, athletes);

  const handoffAction = intakeAudience === "adult_athlete"
    ? `
        <button class="small solid-blue" data-ready-adult="${esc(proposalId)}">
          Adult Athlete
        </button>
        <button class="small outline-blue" data-ready-mark-text="${esc(proposalId)}" data-ready-audience="adult_athlete">
          Mark Text Sent
        </button>
      `
    : intakeAudience === "parent_guardian"
      ? `
          <button class="small solid-blue" data-ready-parent="${esc(proposalId)}">
            Parent / Guardian
          </button>
          <button class="small outline-blue" data-ready-mark-text="${esc(proposalId)}" data-ready-audience="parent_guardian">
            Mark Text Sent
          </button>
        `
      : `
          <span class="small muted">Parent / Guardian / Athlete — intake owner not confirmed</span>
          <button class="small solid-blue" data-ready-parent="${esc(proposalId)}">
            Parent / Guardian
          </button>
          <button class="small outline-blue" data-ready-adult="${esc(proposalId)}">
            Adult Athlete
          </button>
        `;

  return `
    <div class="pending-card" data-ready-proposal="${esc(proposalId)}">
      <div class="pending-card-head">
        <div>
          <div class="pending-card-name">${esc(paidProposalName(proposal))}</div>
          <div class="pending-card-meta">Paid · ${esc(locationId)}</div>
          ${athleteNames.length
            ? `<div class="pending-card-meta small">${esc(athleteNames.join(" · "))}</div>`
            : ""}
          <div class="pending-card-id">${esc(proposalId)}</div>
        </div>
      </div>
      <div class="pending-card-actions">
        ${handoffAction}
      </div>
    </div>
  `;
}

let readyProposalMap = new Map();
let awaitingProposalMap = new Map();

function orientRequestedProposal() {
  if (!requestedProposalId) return;

  const orientation = $("enrollmentCaseOrientation");
  const status = $("enrollmentCaseStatus");
  const proposal =
    readyProposalMap.get(requestedProposalId) ||
    awaitingProposalMap.get(requestedProposalId)?.proposal;

  if (!proposal) {
    if (orientation) orientation.hidden = true;
    if (status) {
      status.textContent =
        "The requested proposal is not available as an authorized paid enrollment. Showing the normal Enrollment queue.";
      status.classList.add("error");
    }
    return;
  }

  if (orientation) {
    orientation.hidden = false;
    orientation.innerHTML =
      '<div class="management-lifecycle__heading">' +
      '<div><span class="management-lifecycle__eyebrow">Current Case Stage</span>' +
      '<strong>Checkout &amp; Enrollment</strong></div>' +
      '<span class="management-lifecycle__case"></span></div>' +
      '<p class="management-lifecycle__guidance"><strong>Next:</strong> Choose who will complete Intake; opening this case does not create an invite.</p>';
    orientation.querySelector(".management-lifecycle__case").textContent = requestedProposalId;
  }

  if (status) {
    status.classList.remove("error");
    status.textContent =
      `${paidProposalName(proposal)} selected from paid proposal ${requestedProposalId}.`;
  }

  const card = document.querySelector(
    `[data-ready-proposal="${CSS.escape(requestedProposalId)}"], [data-awaiting-proposal="${CSS.escape(requestedProposalId)}"]`
  );

  if (card) {
    card.classList.add("is-selected-case");
    card.setAttribute("tabindex", "-1");
    card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function wireAwaitingIntakeButtons() {
  document.querySelectorAll("[data-awaiting-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = awaitingProposalMap.get(button.dataset.awaitingOpen);
      if (!item || button.disabled) return;

      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Opening Intake…";

      try {
        await generateIntakeInvite(
          item.handoff.intakeAudience,
          item.proposal
        );
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });

  document.querySelectorAll("[data-awaiting-resend]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = awaitingProposalMap.get(button.dataset.awaitingResend);
      if (!item || button.disabled) return;

      button.disabled = true;
      const original = button.textContent;
      button.textContent = "Sending Remote Email…";

      try {
        await generateIntakeInvite(
          item.handoff.intakeAudience,
          item.proposal
        );

        const sendButton = $("btn-send-intake-email");
        if (sendButton) {
          sendButton.click();
        }
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });
}

async function recordManualIntakeDelivery({
  method = "text",
  note = "",
} = {}) {
  const tokenId =
    currentHandoffTokenId ||
    tokenFromInviteLink();

  if (!tokenId) {
    throw new Error(
      "Select a paid enrollment first so Sandman can create or recover the secure intake link."
    );
  }

  const recordManualDelivery =
    httpsCallable(
      functions,
      "recordManualEnrollmentIntakeDelivery"
    );

  const response =
    await recordManualDelivery({
      tokenId,
      method,
      note,
    });

  const proposalId =
    String(response?.data?.proposalId || "").trim();

  const intakeAudience =
    String(
      response?.data?.intakeAudience ||
      currentHandoffAudience ||
      ""
    ).trim().toLowerCase() === "adult_athlete"
      ? "adult_athlete"
      : "parent_guardian";

  const deliveredTo =
    String(response?.data?.deliveredTo || "").trim();

  const exp =
    Number(response?.data?.exp || 0);

  const key =
    handoffKey(proposalId, intakeAudience);

  if (proposalId) {
    handoffCache.set(
      key,
      {
        state: "active",
        tokenId,
        intakeAudience,
        deliveryStatus: "SENT",
        deliveryMethod: method,
        manualDelivery: true,
        manualDeliveryNote: note,
        deliveredAt: Date.now(),
        deliveredTo,
        exp,
      }
    );
  }

  return response?.data || {};
}

function wireReadyIntakeButtons() {
  document.querySelectorAll("[data-ready-mark-text]").forEach((button) => {
    button.addEventListener("click", async () => {
      const proposalId =
        String(button.dataset.readyMarkText || "").trim();

      const proposal =
        readyProposalMap.get(proposalId);

      const audience =
        String(button.dataset.readyAudience || "").trim() === "adult_athlete"
          ? "adult_athlete"
          : "parent_guardian";

      if (!proposal || button.disabled) return;

      const original =
        button.textContent;

      button.disabled = true;
      button.textContent = "Recording…";

      try {
        currentHandoffTokenId = "";
        currentHandoffAudience = "";

        await generateIntakeInvite(
          audience,
          proposal
        );

        if (!currentHandoffTokenId) {
          throw new Error(
            "Sandman could not create or recover the intake handoff."
          );
        }

        await recordManualIntakeDelivery({
          method: "text",
          note: "",
        });

        if ($("invite-status")) {
          $("invite-status").textContent =
            "✓ Text delivery recorded. Enrollment is now Awaiting Intake.";
        }

        const managementContext =
          await requireManagement();

        await loadReadyForIntake(
          managementContext
        );
      } catch (err) {
        console.error(
          "[management-enrollment] manual text delivery failed:",
          err
        );

        if ($("invite-status")) {
          $("invite-status").textContent =
            `⚠ ${err?.message || "Unable to record text delivery."}`;
        }
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });

  document.querySelectorAll("[data-ready-parent]").forEach((button) => {
    button.addEventListener("click", async () => {
      const proposal = readyProposalMap.get(button.dataset.readyParent);
      if (!proposal || button.disabled) return;

      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Opening…";
      try {
        await generateIntakeInvite("parent_guardian", proposal);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });

  document.querySelectorAll("[data-ready-adult]").forEach((button) => {
    button.addEventListener("click", async () => {
      const proposal = readyProposalMap.get(button.dataset.readyAdult);
      if (!proposal || button.disabled) return;

      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Opening…";
      try {
        await generateIntakeInvite("adult_athlete", proposal);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });
}

async function loadReadyForIntake(managementContext) {
  const box = $("ready-intake-list");
  const count = $("ready-intake-count");
  if (!box) return;

  let proposalDocs = [];

  if (managementContext.isSystemAdmin) {
    const snapshot = await getDocs(
      query(collection(db, "proposals"), where("status", "==", "PAID"))
    );
    proposalDocs = snapshot.docs;
  } else {
    const locationIds = Array.isArray(managementContext.scope?.locationIds)
      ? managementContext.scope.locationIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];

    for (let index = 0; index < locationIds.length; index += 10) {
      const locationChunk = locationIds.slice(index, index + 10);
      const snapshot = await getDocs(
        query(
          collection(db, "proposals"),
          where("locationId", "in", locationChunk),
          where("status", "==", "PAID")
        )
      );
      proposalDocs.push(...snapshot.docs);
    }
  }

  const operationalProposals = proposalDocs
    .map((proposalDoc) => ({
      id: proposalDoc.id,
      ...proposalDoc.data()
    }))
    .filter(isOperationalPaidProposal);

  const readinessChecks =
    await Promise.all(
      operationalProposals.map(
        async (proposal) => {
          const proposalId = String(
            proposal.proposalId || proposal.id || ""
          ).trim();

          if (!proposalId) {
            return null;
          }

          const locationId = String(
            proposal.locationId || ""
          ).trim();

          const intakeQuery =
            managementContext.isSystemAdmin
              ? query(
                  collection(db, "intakes"),
                  where("proposalId", "==", proposalId),
                  limit(1)
                )
              : query(
                  collection(db, "intakes"),
                  where("proposalId", "==", proposalId),
                  where("locationId", "==", locationId),
                  limit(1)
                );

          const intakeSnapshot =
            await getDocs(intakeQuery);

          if (!intakeSnapshot.empty) {
            return null;
          }

          const athletes = Array.isArray(
            proposal.lockedSnapshot?.athletes
          )
            ? proposal.lockedSnapshot.athletes
            : Array.isArray(proposal.athletes)
              ? proposal.athletes
              : [];

          const intakeAudience =
            intakeAudienceForProposal(proposal, athletes);

          if (!intakeAudience) {
            return {
              state: "ready",
              proposal,
              handoff: null,
            };
          }

          const handoff =
            await resolveExistingEnrollmentHandoff(
              proposalId,
              intakeAudience
            );

          if (
            handoff?.state === "active" &&
            handoff.deliveryStatus === "SENT"
          ) {
            return {
              state: "awaiting",
              proposal,
              handoff,
            };
          }

          return {
            state: "ready",
            proposal,
            handoff,
          };
        }
      )
    );

  const queueItems =
    readinessChecks.filter(Boolean);

  const readyItems =
    queueItems.filter((item) => item.state === "ready");

  const awaitingItems =
    queueItems.filter((item) => item.state === "awaiting");

  const proposals =
    readyItems.map((item) => item.proposal);

  readyProposalMap =
    new Map(
      proposals.map((proposal) => [
        String(
          proposal.proposalId ||
          proposal.id
        ),
        proposal
      ])
    );

  awaitingProposalMap =
    new Map(
      awaitingItems.map((item) => [
        String(
          item.proposal.proposalId ||
          item.proposal.id
        ),
        item
      ])
    );

  if (count) count.textContent = `${proposals.length} Ready`;

  box.innerHTML = proposals.length
    ? `<div class="pending-list">${proposals.map(renderReadyIntakeCard).join("")}</div>`
    : `<div class="muted small">No paid enrollments are waiting for their first intake send.</div>`;

  const awaitingBox = $("awaiting-intake-list");
  const awaitingCount = $("awaiting-intake-count");

  if (awaitingCount) {
    awaitingCount.textContent = `${awaitingItems.length} Awaiting`;
  }

  if (awaitingBox) {
    awaitingBox.innerHTML = awaitingItems.length
      ? `<div class="pending-list">${awaitingItems.map(renderAwaitingIntakeCard).join("")}</div>`
      : `<div class="muted small">No sent intake invitations are awaiting submission.</div>`;
  }

  wireReadyIntakeButtons();
  wireAwaitingIntakeButtons();
  orientRequestedProposal();
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
}

async function generateIntakeInvite(
  intakeAudience = "parent_guardian",
  enrollment = null
) {
  try {
    const normalizedAudience = intakeAudience === "adult_athlete"
      ? "adult_athlete"
      : "parent_guardian";

    const proposalId = String(
      enrollment?.proposalId || enrollment?.id || ""
    ).trim();

    if (!proposalId) {
      throw new Error("Paid enrollment is missing its proposal ID.");
    }

    const existing = await resolveExistingEnrollmentHandoff(
      proposalId,
      normalizedAudience
    );

    if (existing?.state === "submitted") {
      paintSubmittedHandoff(existing.intakeId, normalizedAudience);
      return;
    }

    if (existing?.state === "active") {
      paintInviteHandoff(existing.tokenId, normalizedAudience, {
        recovered: true,
        handoff: existing
      });
      return;
    }

    const newTokenId = crypto.randomUUID()
      .replace(/-/g, "")
      .slice(0, 16);

    const exp = Date.now() + INVITE_HOURS * 60 * 60 * 1000;

    const proposalProspect =
      enrollment?.lockedSnapshot?.prospect || enrollment?.prospect || {};

    const proposalAthlete =
      enrollment?.lockedSnapshot?.athletes?.[0] ||
      enrollment?.athletes?.[0] ||
      {};

    const proposalContact =
      enrollment?.lockedSnapshot?.contact ||
      enrollment?.contact ||
      enrollment?.lockedSnapshot?.parent ||
      enrollment?.parent ||
      {};

    const appointmentId = firstValue(
      proposalProspect.appointmentId,
      enrollment?.lockedSnapshot?.prospect?.appointmentId,
      enrollment?.appointmentId
    );

    let connectLeadId = firstValue(
      proposalProspect.leadId,
      enrollment?.lockedSnapshot?.prospect?.leadId,
      enrollment?.leadId,
      enrollment?.connectLeadId
    );

    let intakeLead = {};

    if (!connectLeadId && appointmentId) {
      try {
        const appointmentSnap = await getDoc(
          doc(db, "admissions_appointments", appointmentId)
        );

        if (appointmentSnap.exists()) {
          const appointment = appointmentSnap.data() || {};
          connectLeadId = firstValue(
            appointment.leadId,
            appointment.appointmentId,
            appointmentId
          );
          intakeLead = appointment;
        }
      } catch (err) {
        console.warn(
          "[management-enrollment] unable to recover lead for intake prefill:",
          err
        );
      }
    }

    if (connectLeadId) {
      try {
        const leadSnap = await getDoc(doc(db, "interest_leads", connectLeadId));
        if (leadSnap.exists()) {
          intakeLead = { ...intakeLead, ...leadSnap.data() };
        }
      } catch (err) {
        console.warn(
          "[management-enrollment] unable to load lead for safe intake prefill:",
          err
        );
      }
    }

    const athleteName = firstValue(
      proposalAthlete.name,
      proposalAthlete.fullName,
      proposalAthlete.athleteName,
      [proposalAthlete.first, proposalAthlete.last].filter(Boolean).join(" "),
      proposalProspect.athleteName,
      enrollment?.athleteName,
      intakeLead.athleteName,
      intakeLead.participantName
    );

    const prefill = Object.fromEntries(
      Object.entries({
        athleteName,
        parentName: firstValue(
          proposalProspect.primaryContactName,
          proposalProspect.parentName,
          proposalContact.name,
          proposalContact.parentName,
          enrollment?.parentName,
          intakeLead.parentName,
          intakeLead.guardianName
        ),
        dob: firstValue(
          proposalAthlete.dob,
          proposalAthlete.dateOfBirth,
          proposalProspect.dob,
          proposalProspect.dateOfBirth,
          enrollment?.dob,
          enrollment?.dateOfBirth,
          intakeLead.dob,
          intakeLead.dateOfBirth
        ),
        city: firstValue(
          proposalProspect.city,
          proposalContact.city,
          enrollment?.city,
          intakeLead.city
        ),
        state: firstValue(
          proposalProspect.state,
          proposalContact.state,
          enrollment?.state,
          intakeLead.state
        ),
        email: normalizedAudience === "adult_athlete"
          ? firstValue(
              proposalAthlete.email,
              proposalAthlete.athleteEmail,
              enrollment?.athleteEmail,
              proposalProspect.email,
              proposalProspect.primaryContactEmail,
              proposalContact.email,
              enrollment?.email,
              intakeLead.email
            )
          : firstValue(
              proposalProspect.parentEmail,
              proposalProspect.primaryContactEmail,
              proposalProspect.email,
              proposalContact.parentEmail,
              proposalContact.email,
              enrollment?.parentEmail,
              enrollment?.email,
              intakeLead.parentEmail,
              intakeLead.email
            ),
        phone: firstValue(
          proposalProspect.phone,
          proposalProspect.parentPhone,
          proposalProspect.primaryContactPhone,
          proposalContact.phone,
          proposalContact.parentPhone,
          enrollment?.phone,
          enrollment?.parentPhone,
          intakeLead.phone,
          intakeLead.parentPhone
        ),
        languagePreference: firstValue(
          proposalProspect.languagePreference,
          proposalProspect.preferredLanguage,
          proposalContact.languagePreference,
          enrollment?.languagePreference
        ),
      }).filter(([, value]) => value)
    );

    await setDoc(doc(db, "intakeTokens", newTokenId), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      exp,
      used: false,
      status: "invited",
      mode: "new_athlete",
      intakeAudience: normalizedAudience,
      intakeRoute: normalizedAudience === "adult_athlete" ? "athlete" : "parent",
      existingAthleteUid: "",
      forTrack: null,
      forLane: null,
      requestedTrackCode: null,
      requestedDiscipline: null,
      existingAthleteName: null,
      proposalId,
      connectLeadId: connectLeadId || null,
      locationId: String(enrollment?.locationId || "").trim() || null,
      prefill,
      source: "management_enrollment",
      workflowVersion: "intake-v2",
    });

    const cached = {
      state: "active",
      tokenId: newTokenId,
      intakeAudience: normalizedAudience,
      deliveryStatus: "",
      deliveredAt: null,
      deliveredTo: "",
      exp,
    };
    handoffCache.set(handoffKey(proposalId, normalizedAudience), cached);

    paintInviteHandoff(newTokenId, normalizedAudience);
  } catch (err) {
    console.error(err);
    if ($("invite-status")) {
      $("invite-status").textContent =
        `⚠ ${err?.message || "Error creating intake invite."}`;
    }
  }
}

$("btn-mark-intake-sent")?.addEventListener("click", async () => {
  const button =
    $("btn-mark-intake-sent");

  if (!button) return;

  const method =
    String(
      $("manual-send-method")?.value || "text"
    ).trim().toLowerCase();

  const note =
    String(
      $("manual-send-note")?.value || ""
    ).trim();

  const original =
    button.textContent;

  button.disabled = true;
  button.textContent = "Recording…";

  try {
    await recordManualIntakeDelivery({
      method,
      note,
    });

    const label =
      method === "text"
        ? "Text"
        : "In Person";

    if ($("invite-status")) {
      $("invite-status").textContent =
        `✓ ${label} delivery recorded. Enrollment is now Awaiting Intake.`;
    }

    const managementContext =
      await requireManagement();

    await loadReadyForIntake(
      managementContext
    );
  } catch (err) {
    console.error(
      "[management-enrollment] manual intake delivery failed:",
      err
    );

    if ($("invite-status")) {
      $("invite-status").textContent =
        `⚠ ${err?.message || "Unable to record manual intake delivery."}`;
    }
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$("btn-send-intake-email")?.addEventListener("click", async () => {
  const button = $("btn-send-intake-email");
  const tokenId =
    currentHandoffTokenId ||
    tokenFromInviteLink();

  if (!button) {
    return;
  }

  if (!tokenId) {
    if ($("invite-status")) {
      $("invite-status").textContent =
        "Select a paid enrollment first so Sandman can create or recover the secure intake link.";
    }
    return;
  }

  currentHandoffTokenId = tokenId;

  const existingStatus = [...handoffCache.values()].find(
    entry => entry?.tokenId === tokenId
  );
  if (existingStatus?.deliveryStatus === "SENT" &&
      existingStatus?.deliveryMethod === "email" &&
      !window.confirm(
        "Sandman already recorded this Intake email as sent" +
        (existingStatus.deliveredTo ? " to " + existingStatus.deliveredTo : "") +
        ". Send it again?"
      )) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Sending…";

  if ($("invite-status")) {
    $("invite-status").textContent =
      "Sending the intake link to the attached enrollment email…";
  }

  try {
    const sendIntake =
      httpsCallable(
        functions,
        "sendEnrollmentIntakeEmail"
      );

    let response;
    try {
      response = await sendIntake({ tokenId });
    } catch (initialError) {
      if (!/No valid intake email is attached/i.test(String(initialError?.message || ""))) {
        throw initialError;
      }

      const enteredEmail = window.prompt(
        "No recipient email is attached. Enter the verified Parent / Guardian email address:"
      );
      if (!enteredEmail) throw initialError;
      const recipientEmail = enteredEmail.trim().toLowerCase();
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipientEmail)) {
        throw new Error("Enter a valid email address before sending Intake.");
      }
      if (!window.confirm(
        "Send the secure enrollment Intake to " + recipientEmail + "? This records the verified recipient in the audit trail."
      )) {
        throw new Error("Email handoff cancelled; no Intake email was sent.");
      }
      response = await sendIntake({
        tokenId,
        recipientEmail,
        confirmRecipient: true
      });
    }

    const recipient =
      String(
        response?.data?.recipient || ""
      ).trim();

    const exp =
      Number(response?.data?.exp || 0);

    if ($("invite-status")) {
      $("invite-status").textContent =
        recipient
          ? `✓ Intake email sent to ${recipient}. Enrollment is now Awaiting Intake.`
          : "✓ Intake email sent. Enrollment is now Awaiting Intake.";
    }

    const proposalId = String(
      response?.data?.proposalId || ""
    ).trim();

    const intakeAudience = String(
      response?.data?.intakeAudience ||
      currentHandoffAudience ||
      ""
    ).trim();

    if (proposalId && intakeAudience) {
      const key =
        handoffKey(proposalId, intakeAudience);

      handoffCache.set(
        key,
        {
          state: "active",
          tokenId,
          intakeAudience,
          deliveryStatus: "SENT",
          deliveryMethod: "email",
          manualDelivery: false,
          manualDeliveryNote: "",
          deliveredAt: Date.now(),
          deliveredTo: recipient,
          exp,
        }
      );
    }

    button.textContent =
      "Resend Intake Email";

    const managementContext =
      await requireManagement();

    await loadReadyForIntake(managementContext);
  } catch (err) {
    console.error(
      "[management-enrollment] intake email failed:",
      err
    );

    if ($("invite-status")) {
      $("invite-status").textContent =
        `⚠ ${err?.message || "Unable to send intake email."}`;
    }

    button.textContent =
      originalLabel;
  } finally {
    button.disabled = false;
  }
});

$("btn-copy-token")?.addEventListener("click", async () => {
  try {
    const url = $("invite-link")?.value;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    if ($("invite-status")) {
      $("invite-status").textContent = "✓ Copied to clipboard.";
    }
  } catch (err) {
    console.error(err);
    if ($("invite-status")) {
      $("invite-status").textContent = "⚠ Copy failed.";
    }
  }
});

$("btn-open-qr")?.addEventListener("click", () => {
  const url = $("invite-link")?.value;
  if (!url) return;
  window.open(url, "_blank", "noopener");
});

function wirePendingButtons() {
  document.querySelectorAll("[data-intake]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const intakeId = btn.dataset.intake;
      if (!intakeId) return;
      location.href = reviewUrlForIntake(intakeId);
    });
  });
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

async function loadPendingLive(managementContext) {
  const box = $("pending-list");
  if (!box) return;

  try {
    const snapshots = managementContext.isSystemAdmin
      ? [await getDocs(
          query(collection(db, "intakes"), where("approvedUid", "==", null))
        )]
      : await Promise.all(
          scopeLocationChunks(managementContext).map((locations) =>
            getDocs(
              query(
                collection(db, "intakes"),
                where("locationId", "in", locations),
                where("approvedUid", "==", null)
              )
            )
          )
        );

    const docs = snapshots
      .flatMap((snapshot) => snapshot.docs)
      .sort(
        (a, b) =>
          (b.data()?.createdAt?.toMillis?.() || 0) -
          (a.data()?.createdAt?.toMillis?.() || 0)
      )
      .slice(0, PENDING_LIMIT);

    let html = "";
    let count = 0;

    docs.forEach((snap) => {
      const d = snap.data() || {};
      count += 1;
      html += renderPendingCard({
        intakeId: snap.id,
        name: formatNameFromIntake(d),
        city: d.location?.city ?? "",
        state: d.location?.state ?? "",
      });
    });

    if ($("pending-count")) $("pending-count").textContent = `${count} pending`;

    box.innerHTML = html
      ? `<div class="pending-list">${html}</div>`
      : "<div class='muted small'>No pending intakes.</div>";

    wirePendingButtons();
  } catch (err) {
    console.error(err);
    box.innerHTML = "<div class='muted small'>Error loading pending intakes.</div>";
  }
}

$("btn-find-intakes")?.addEventListener("click", async () => {
  const managementContext = await requireManagement();

  await Promise.all([
    loadPendingLive(managementContext),
    loadReadyForIntake(managementContext)
  ]);
});

// Recently Activated is intentionally owned by enrollment-recent.js.
// This module stops at intake handoff, submitted intake review, and activation.
// Do not add Parent/Athlete access rendering here.

(async () => {
  try {
    const managementContext = await requireManagement();
    await loadReadyForIntake(managementContext);
    await loadPendingLive(managementContext);
  } catch (err) {
    console.error("[management-enrollment] boot failed:", err);

    if ($("ready-intake-list")) {
      $("ready-intake-list").textContent =
        err?.message || "Unable to load enrollment workspace.";
    }

    if (requestedProposalId && $("enrollmentCaseStatus")) {
      $("enrollmentCaseStatus").textContent =
        "The requested enrollment case could not be loaded. The workspace remains unchanged.";
      $("enrollmentCaseStatus").classList.add("error");
    }
  }
})();

function isOperationalPaidProposal(proposal = {}) {
  const status = String(proposal.status || "").trim().toUpperCase();
  const paymentStatus = String(proposal.paymentStatus || "").trim().toLowerCase();
  const paymentMethod = String(proposal.paymentMethod || "").trim().toLowerCase();
  const checkoutSessionId = String(
    proposal.stripeCheckoutSessionId || ""
  ).trim();

  const explicitLivemode = typeof proposal.stripeLivemode === "boolean"
    ? proposal.stripeLivemode
    : null;

  const legacyTestSession = checkoutSessionId.startsWith("cs_test_");
  const legacyLiveSession = checkoutSessionId.startsWith("cs_live_");
  const isLiveStripePayment = explicitLivemode === true ||
    (explicitLivemode === null && legacyLiveSession);

  const isRecordedCashPayment =
    paymentMethod === "cash_prepaid" &&
    Boolean(proposal.cashPrepayment) &&
    Number(proposal.cashPrepayment?.amountCents || 0) > 0;

  return (
    status === "PAID" &&
    paymentStatus === "paid" &&
    Boolean(proposal.paidAt) &&
    (
      isRecordedCashPayment ||
      (
        Boolean(checkoutSessionId) &&
        !legacyTestSession &&
        isLiveStripePayment
      )
    )
  );
}
