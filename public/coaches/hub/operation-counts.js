import {
  db,
  doc,
  onSnapshot
} from "/assets/js/firebase-init.js";

import {
  requireCoach
} from "/assets/js/coach-guard.js";

const WORK_KEYS = ["daily", "practice", "competition"];
const MESSAGE_KEYS = ["athlete", "team"];
// These are display contracts only. No source is assumed or synthesized.
const MESSAGE_FIELDS = { athlete: "athleteMessages", team: "teamMessages" };
const EMERGENCY_FIELD = "emergencyAlerts";

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

function renderIndicator(key, value, kind) {
  const el = document.querySelector(`[data-operation-count="${key}"]`);
  if (!el) return;
  // Missing, invalid and zero values do not advertise actionable work.
  const count = Number(value);
  if (value === null || value === "" || !Number.isInteger(count) || count <= 0) {
    el.hidden = true;
    return;
  }
  el.textContent = String(count);
  el.dataset.kind = kind;
  const noun = kind === "message" ? "messages requiring a reply"
    : kind === "urgent" ? "unresolved urgent safety alerts" : "open actions";
  el.setAttribute("aria-label", `${key} Operations: ${count} ${noun}`);
  el.hidden = false;
  if (key === "daily") {
    const status = document.querySelector('[data-operation-status="daily"]');
    if (status) status.hidden = true;
  }
}

function renderSummary(summary) {
  const counts = summary?.counts || {};
  WORK_KEYS.forEach((key) => renderIndicator(key, counts[key], "work"));
  // Message counts are scoped to the Coach, not the location.
  // Athlete messages have no authoritative publisher yet.
  renderIndicator("emergency", summary?.[EMERGENCY_FIELD], "urgent");
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
    // Independent Coach-scoped Para-Comms summary. No duplicate inbox queries.
    onSnapshot(doc(db, "system", "coach-messages-" + coach.uid), (snapshot) => {
      renderIndicator("team", snapshot.exists() ? snapshot.data()?.teamMessages : null, "message");
    }, (error) => {
      console.warn("[coach-home] Para-Comms unread count unavailable", error);
      renderIndicator("team", null, "message");
    });
    const path = "system/" + summaryDocId(locationId);
    setDailyStatus("Checking count…", path);
    onSnapshot(doc(db, "system", summaryDocId(locationId)), (snapshot) => {
      if (!snapshot.exists()) {
        setDailyStatus("Count not published · " + summaryDocId(locationId), "Expected Firestore path: " + path);
        return;
      }
      const counts = snapshot.data()?.counts || {};
      if (!Object.prototype.hasOwnProperty.call(counts, "daily")) {
        setDailyStatus("Count unavailable", "Summary is missing a Daily Operations total.");
        return;
      }
      renderSummary(snapshot.data());
      const daily = document.querySelector('[data-operation-count="daily"]');
      if (!daily || daily.hidden) {
        // Zero open actions are deliberately badge-free.
        if (Number(counts.daily) === 0) {
          const status = document.querySelector('[data-operation-status="daily"]');
          if (status) status.hidden = true;
        } else {
          setDailyStatus("Count unavailable", "Summary includes an invalid Daily Operations total.");
        }
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
