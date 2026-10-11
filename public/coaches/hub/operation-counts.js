import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  requireCoach
} from "/assets/js/coach-guard.js";

const COUNT_KEYS = [
  "daily",
  "practice",
  "competition",
  "athlete",
  "team",
  "emergency",
  "system"
];

function safeLocationId(coachContext) {
  const locations = Array.isArray(coachContext?.scope?.locationIds)
    ? coachContext.scope.locationIds
    : [];
  return String(locations[0] || coachContext?.locationId ||
    (coachContext?.uid ? "coach-user-" + coachContext.uid : "")).trim();
}

function summaryDocId(locationId) {
  return "coach-dashboard-summary-" +
    String(locationId || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function renderCount(key, value) {
  const el = document.querySelector(`[data-operation-count="${key}"]`);
  if (!el) return;

  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    el.hidden = true;
    return;
  }

  const rounded = Math.max(0, Math.trunc(count));
  el.textContent = String(rounded);
  el.dataset.zero = String(rounded === 0);
  el.hidden = false;
}

async function loadOperationCounts() {
  try {
    const coach = await requireCoach();
    const locationId = safeLocationId(coach);
    if (!locationId) return;

    const snapshot = await getDoc(
      doc(db, "system", summaryDocId(locationId))
    );

    if (!snapshot.exists()) return;

    const counts = snapshot.data()?.counts || {};
    COUNT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        renderCount(key, counts[key]);
      }
    });
  } catch (error) {
    console.warn("[coach-home] operation counts unavailable", error);
  }
}

void loadOperationCounts();
