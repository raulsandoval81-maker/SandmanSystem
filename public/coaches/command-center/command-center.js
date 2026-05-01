// /public/coaches/command-center/command-center.js

import {
  db,
  ensureSignedIn,
  collection,
  onSnapshot,
} from "/assets/js/firebase-init.js";

await ensureSignedIn();

// -----------------------------
// Theme toggle
// Required HTML ID:
// themeToggle
// -----------------------------
const themeToggleBtn = document.getElementById("themeToggle");

function applySavedTheme() {
  const savedTheme = localStorage.getItem("command-center-theme");
  if (savedTheme === "day") {
    document.body.classList.add("day");
  } else {
    document.body.classList.remove("day");
  }
}

function wireThemeToggle() {
  applySavedTheme();

  themeToggleBtn?.addEventListener("click", () => {
    document.body.classList.toggle("day");
    const isDay = document.body.classList.contains("day");
    localStorage.setItem("command-center-theme", isDay ? "day" : "night");
  });
}

// -----------------------------
// Queue count elements
// Required HTML IDs:
// count-strength
// count-honor
// count-conditioning
// count-conditioning-requests
// count-iron
// list-strength
// list-honor
// list-conditioning
// -----------------------------
const countStrengthEl = document.getElementById("count-strength");
const countHonorEl = document.getElementById("count-honor");
const countConditioningEl = document.getElementById("count-conditioning");
const countConditioningRequestsEl = document.getElementById("count-conditioning-requests");
const countIronEl = document.getElementById("count-iron");

const listStrengthEl = document.getElementById("list-strength");
const listHonorEl = document.getElementById("list-honor");
const listConditioningEl = document.getElementById("list-conditioning");

// -----------------------------
// Parent inbox count elements
// Required HTML IDs:
// count-join-requests
// count-trial-requests
// count-parent-messages
// -----------------------------
const countJoinRequestsEl = document.getElementById("count-join-requests");
const countTrialRequestsEl = document.getElementById("count-trial-requests");
const countParentMessagesEl = document.getElementById("count-parent-messages");
const countFreePassEl = document.getElementById("count-free-pass");

// -----------------------------
// Intake launcher
// Optional HTML ID:
// open-intake-control
//
// If this button/link exists, it will route to /coach-intake/
// -----------------------------
const openIntakeControlBtn = document.getElementById("open-intake-control");

// -----------------------------
// Helpers
// -----------------------------
function setCount(el, n) {
  if (!el) return;
  el.textContent = String(n || 0);
}

function renderList(el, ids) {
  if (!el) return;

  if (!ids.length) {
    el.innerHTML = `<div style="opacity:.6;">None</div>`;
    return;
  }

  const uniqueIds = [...new Set(ids)];

  el.innerHTML = uniqueIds
    .slice(0, 5)
    .map((id) => `<div style="font-size:.9rem;">• ${id}</div>`)
    .join("");
}

function isPending(status) {
  return String(status || "").trim().toLowerCase() === "pending";
}

function hasBody(entry) {
  return !!String(entry?.body || "").trim();
}

function isStrengthEntry(key, entry) {
  const k = String(key || "").trim();

  const matchesLegacyKey = /^strength_segment1_session\d+$/i.test(k);
  const matchesCurrentKey = /^STR-\d+$/i.test(k);

  if (!matchesLegacyKey && !matchesCurrentKey) return false;

  return String(entry?.lane || "").trim().toLowerCase() === "strength";
}

function isHonorEntry(key, entry) {
  const k = String(key || "").trim();

  const matchesLegacyKey = /^honor_segment1_session\d+$/i.test(k);
  const matchesCurrentKey = /^HON-\d+$/i.test(k);

  if (!matchesLegacyKey && !matchesCurrentKey) return false;

  return String(entry?.lane || "").trim().toLowerCase() === "honor";
}

function isConditioningEntry(key, entry) {
  const k = String(key || "").trim();

  const matchesLegacyKeyF4 = /^conditioning_f4_segment1_session\d+$/i.test(k);
  const matchesLegacyKeyF8 = /^conditioning_f8_segment1_session\d+$/i.test(k);
  const matchesCurrentKey = /^CON-\d+$/i.test(k);

  if (!matchesLegacyKeyF4 && !matchesLegacyKeyF8 && !matchesCurrentKey) return false;

  return String(entry?.lane || "").trim().toLowerCase() === "conditioning";
}

// -----------------------------
// Lane queue counts
// Rules locked:
// - Remote HIIT folds into Conditioning
// - Iron stays under Strength review
// - Conditioning requests count separately
// -----------------------------
function computeCounts(docs) {
  let strength = 0;
  let honor = 0;
  let conditioning = 0;
  let conditioningRequests = 0;
  let iron = 0;

  const strengthIds = [];
  const honorIds = [];
  const conditioningIds = [];

  docs.forEach((docSnap) => {
    const athleteId = docSnap.id;
    const data = docSnap.data() || {};

    Object.keys(data).forEach((k) => {
      const entry = data[k];

      if (isStrengthEntry(k, entry)) {
        if (hasBody(entry) && isPending(entry?.status)) {
          strength++;
          strengthIds.push(athleteId);
        }
      }

      if (isHonorEntry(k, entry)) {
        if (hasBody(entry) && isPending(entry?.status)) {
          honor++;
          honorIds.push(athleteId);
        }
      }

      if (isConditioningEntry(k, entry)) {
        if (hasBody(entry) && isPending(entry?.status)) {
          conditioning++;
          conditioningIds.push(athleteId);
        }
      }
    });

    // Conditioning Requests (new)
    const conditioningRequest = data?.conditioning_request;
    if (conditioningRequest && isPending(conditioningRequest.status)) {
      conditioningRequests++;
    }

    // Remote HIIT now counts as Conditioning
    const hiitEntry = data?.strength_remote_hiit;
    if (hiitEntry?.submittedAt && isPending(hiitEntry?.status)) {
      conditioning++;
      conditioningIds.push(athleteId);
    }

    // Iron stays separate under Strength review
    const ironEntry = data?.strength_iron_latest;
    if (ironEntry?.submittedAt && isPending(ironEntry?.status)) {
      iron++;
    }
  });

  return {
    strength,
    honor,
    conditioning,
    conditioningRequests,
    iron,
    strengthIds,
    honorIds,
    conditioningIds,
  };
}

function subscribeLaneCounts() {
  const colRef = collection(db, "laneSubmissions");

  onSnapshot(
    colRef,
    (snap) => {
      const result = computeCounts(snap.docs);

      setCount(countStrengthEl, result.strength);
      setCount(countHonorEl, result.honor);
      setCount(countConditioningEl, result.conditioning);
      setCount(countConditioningRequestsEl, result.conditioningRequests);
      setCount(countIronEl, result.iron);

      renderList(listStrengthEl, result.strengthIds);
      renderList(listHonorEl, result.honorIds);
      renderList(listConditioningEl, result.conditioningIds);
    },
    (err) => {
      console.error("[command-center] lane count load error:", err);
    }
  );
}

// -----------------------------
// Parent inbox counts (LIVE)
// Reads from: paraParentInbox
// Splits:
// - join requests
// - trial requests
// - parent messages
//
// NOTE:
// This page no longer performs approve / hold / reply.
// Actions belong inside the inbox cards, not here.
// -----------------------------
function subscribeParentInboxCounts() {
  const ref = collection(db, "paraParentInbox");

  onSnapshot(
    ref,
    (snap) => {
      let joinCount = 0;
      let trialCount = 0;
      let messageCount = 0;
      let freePassCount = 0;

      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};

if (d.category === "join") {

  if (d.entryType === "join" && isPending(d.status)) {
    joinCount++;
  }

  if (d.entryType === "trial") {
  trialCount++;
}

if (d.entryType === "free_pass") {
  freePassCount++;
}

}

        if (d.category === "message" && isPending(d.status)) {
          messageCount++;
        }
      });

      setCount(countJoinRequestsEl, joinCount);
setCount(countTrialRequestsEl, trialCount);
setCount(countFreePassEl, freePassCount);
setCount(countParentMessagesEl, messageCount);

    },
    (err) => {
      console.error("[command-center] parent inbox count error:", err);
    }
  );
}

// -----------------------------
// Intake control launcher
// -----------------------------
function wireIntakeControl() {
  openIntakeControlBtn?.addEventListener("click", () => {
    window.location.href = "/coach-intake/";
  });
}

// -----------------------------
// Boot
// -----------------------------
wireThemeToggle();
wireIntakeControl();
subscribeLaneCounts();
subscribeParentInboxCounts();