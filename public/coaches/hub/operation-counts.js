import {
  db,
  doc,
  onSnapshot
} from "/assets/js/firebase-init.js";

import {
  requireCoach
} from "/assets/js/coach-guard.js";

const COUNT_KEYS = [
  "daily", "practice", "competition", "athlete",
  "team", "emergency", "system"
];

function safeLocationId(coachContext) {
  const locations = Array.isArray(coachContext?.scope?.locationIds)
    ? coachContext.scope.locationIds : [];
  return String(locations[0] || coachContext?.locationId ||
    (coachContext?.uid ? "coach-user-" + coachContext.uid : "")).trim();
}

function summaryDocId(locationId) {
  return "coach-dashboard-summary-" +
    String(locationId || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function setDailyStatus(message, details = "") {
  const el = document.querySelector("[data-operation-status=\"daily\"]");
  if (!el) return;
  el.textContent = message;
  el.title = details;
  el.hidden = false;
}

function renderCount(key, value) {
  const el = document.querySelector(`[data-operation-count="${key}"]`);
  if (!el) return;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0 || value === null || value === "") {
    el.hidden = true;
    return;
  }
  const rounded = Math.max(0, Math.trunc(count));
  el.textContent = String(rounded);
  el.dataset.zero = String(rounded === 0);
  el.hidden = false;
  if (key === "daily") {
    const status = document.querySelector("[data-operation-status=\"daily\"]");
    if (status) status.hidden = true;
  }
}

async function loadOperationCounts() {
  setDailyStatus("Checking count…");
  try {
    const coach = await requireCoach();
    const locationId = safeLocationId(coach);
    if (!locationId) {
      setDailyStatus("Count unavailable", "No Coach location or user scope.");
      return;
    }
    onSnapshot(doc(db, "system", summaryDocId(locationId)), (snapshot) => {
      if (!snapshot.exists()) {
        setDailyStatus("Count not published", "Open Daily Operations to publish its current total.");
        return;
      }
      const counts = snapshot.data()?.counts || {};
      if (!Object.prototype.hasOwnProperty.call(counts, "daily")) {
        setDailyStatus("Count unavailable", "Summary is missing a Daily Operations total.");
        return;
      }
      COUNT_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(counts, key)) {
          renderCount(key, counts[key]);
        }
      });
      const daily = document.querySelector('[data-operation-count="daily"]');
      if (!daily || daily.hidden) {
        setDailyStatus("Count unavailable", "Summary includes an invalid Daily Operations total.");
      }
    }, (error) => {
      console.warn("[coach-home] dashboard summary listener failed", error);
      setDailyStatus("Count unavailable", error?.code || "Firestore read failed");
    });
  } catch (error) {
    console.warn("[coach-home] operation counts unavailable", error);
    setDailyStatus("Count unavailable", error?.code || "Coach authorization failed");
  }
}

void loadOperationCounts();
