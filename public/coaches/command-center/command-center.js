// /public/coaches/command-center/command-center.js

import {
  db,
  ensureSignedIn,
  collection,
  onSnapshot,
  query,
  where,
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
// Testing elements
// Required HTML ID:
// list-testing
// -----------------------------
const listTestingEl = document.getElementById("list-testing");

// -----------------------------
// Parent inbox count elements
// Required HTML IDs:
// count-join-requests
// count-trial-requests
// count-parent-messages
// Optional:
// count-free-pass
// -----------------------------
const countJoinRequestsEl = document.getElementById("count-join-requests");
const countTrialRequestsEl = document.getElementById("count-trial-requests");
const countParentMessagesEl = document.getElementById("count-parent-messages");
const countFreePassEl = document.getElementById("count-free-pass");

// -----------------------------
// Intake launcher
// Optional HTML ID:
// open-intake-control
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

      if (isStrengthEntry(k, entry) && hasBody(entry) && isPending(entry?.status)) {
        strength++;
        strengthIds.push(athleteId);
      }

      if (isHonorEntry(k, entry) && hasBody(entry) && isPending(entry?.status)) {
        honor++;
        honorIds.push(athleteId);
      }

      if (isConditioningEntry(k, entry) && hasBody(entry) && isPending(entry?.status)) {
        conditioning++;
        conditioningIds.push(athleteId);
      }
    });

    const conditioningRequest = data?.conditioning_request;
    if (conditioningRequest && isPending(conditioningRequest.status)) {
      conditioningRequests++;
    }

    const hiitEntry = data?.strength_remote_hiit;
    if (hiitEntry?.submittedAt && isPending(hiitEntry?.status)) {
      conditioning++;
      conditioningIds.push(athleteId);
    }

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
// Parent inbox counts
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
          if (d.entryType === "join" && isPending(d.status)) joinCount++;
          if (d.entryType === "trial") trialCount++;
          if (d.entryType === "free_pass") freePassCount++;
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
// TESTING — READY ATHLETES
// -----------------------------
function subscribeTestingReady() {
  if (!listTestingEl) return;

const q = query(
  collection(db, "athletes"),
  where("testing.state", "==", "READY")
);
  onSnapshot(
    q,
    (snap) => {
      listTestingEl.innerHTML = "";

      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const uid = docSnap.id;
        const sessionId = `test_${uid}_${Date.now()}`;

        const row = document.createElement("div");
        row.className = "queue-row";

const name = encodeURIComponent(data.publicName || data.fullName || "");
const tier = encodeURIComponent(data.tier || "");
const track = encodeURIComponent(data.track || "foundry4-combat");

const panelLink = `/coaches/testing/testing-command-center.html?uid=${uid}&athleteName=${name}&tier=${tier}&track=${track}`;

const testDate =
  data?.testing?.scheduledDate || "No Date";

row.innerHTML = `
  <div class="queue-left">
    <div class="queue-label">
      ${data.publicName || data.fullName || uid}
    </div>

    <div class="queue-sub">
      ${data.tier || "—"} · READY · Test: ${testDate}
    </div>
  </div>

  <div style="display:flex; gap:6px; flex-wrap:wrap;">
    <a class="btn" href="/coaches/command-center/coach-athlete-panel.html?id=${uid}&v=2">
      View
    </a>

    <a class="btn good"
       href="/coaches/testing/test1.html?athleteId=${uid}&sessionId=${sessionId}&panel=1">
      Test
    </a>

    <a class="btn"
       href="${panelLink}">
      Panel
    </a>
  </div>
`;

listTestingEl.appendChild(row);
      });

      if (!snap.size) {
        listTestingEl.innerHTML = `<div style="opacity:.6;">No athletes ready</div>`;
      }
    },
    (err) => {
      console.error("[command-center] ready athlete load error:", err);
      listTestingEl.innerHTML = `<div style="opacity:.6;">Testing queue unavailable</div>`;
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
subscribeTestingReady();