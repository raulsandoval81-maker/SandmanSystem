import {
  db,
  collection,
  getDocs,
  query,
  where,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";

console.log("NEW ATTENDANCE JS ACTIVE");
window.__attendance_loaded = true;
document.body.dataset.attendanceBuild = "handoff2";

const $ = (id) => document.getElementById(id);

let reviewAthletes = [];
let selectedIds = new Set();
let pendingSessionRef = null;
let pendingSessionId = null;
let pendingSession = null;

function setReviewControlsEnabled(enabled) {
  ["selectAll", "clearAll", "saveAttendance"].forEach((id) => {
    const control = $(id);
    if (control) control.disabled = !enabled;
  });
}

function athleteName(a = {}) {
  return a.name || a.publicName || a.fullName || a.uid || a.id || "Unknown athlete";
}

function athleteProgram(a = {}) {
  return String(a.program || a.journey || a.track || a.trackCode || a.ladderKey || "").toLowerCase();
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function setStatus(msg, isError = false) {
  const el = $("saveStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#ff8a8a" : "#9ca3af";
}

function showDailyGrindHandoff(sessionId) {
  const status = $("saveStatus");
  const id = String(sessionId || "").trim();

  if (!status || !id) return;

  let link = document.getElementById("continueDailyGrind");

  if (!link) {
    link = document.createElement("a");
    link.id = "continueDailyGrind";
    link.className = "pill";
    link.textContent = "Continue to Daily XP";
    status.insertAdjacentElement("afterend", link);
  }

  link.href = `/coaches/daily-xp/?session=${encodeURIComponent(id)}`;
}

function updatePresentCount() {
  const el = $("presentCount");
  if (el) el.textContent = `${selectedIds.size} selected`;
}

function timestampMillis(raw) {
  if (!raw) return 0;
  if (typeof raw.toMillis === "function") return raw.toMillis();
  if (typeof raw.toDate === "function") return raw.toDate().getTime();
  if (Number.isFinite(raw.seconds)) return raw.seconds * 1000;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pendingSortValue(docSnap) {
  const data = docSnap.data() || {};
  return timestampMillis(data.submittedAt) || timestampMillis(data.updatedAt) || timestampMillis(data.createdAt);
}

function clearPendingSession() {
  pendingSessionRef = null;
  pendingSessionId = null;
  pendingSession = null;
  reviewAthletes = [];
  selectedIds.clear();
  if ($("practiceType")) $("practiceType").value = "—";
  setReviewControlsEnabled(false);
}

function renderPendingChoices(pendingDocs) {
  const list = $("athleteList");
  const meta = $("countMeta");
  if (meta) meta.textContent = `${pendingDocs.length} sessions awaiting review`;
  if (!list) return;

  list.replaceChildren();
  const message = document.createElement("p");
  message.className = "muted";
  message.textContent = "Choose the attendance session you intend to finalize:";
  list.append(message);

  const choices = document.createElement("div");
  choices.className = "pending-session-list";
  pendingDocs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const link = document.createElement("a");
    link.className = "pending-session-link";
    link.href = `?session=${encodeURIComponent(docSnap.id)}`;
    const date = data.sessionDateLabel || data.sessionDateKey || "Undated session";
    const type = data.type || data.journey || "practice";
    const count = Number(data.checkedInCount || data.checkedIn?.length || 0);
    link.textContent = `${date} · ${type} · ${count} checked in`;
    choices.append(link);
  });
  list.append(choices);
}

async function loadPracticeReview(practiceId) {
  const getReview = httpsCallable(functions, "getPracticeAttendanceReview");
  const response = await getReview({ practiceId });
  const data = response.data || {};
  pendingSessionRef = { id: practiceId };
  pendingSessionId = practiceId;
  pendingSession = data.attendance || {
    practiceId,
    sessionDateKey: data.practice?.sessionDateKey || "",
    journey: data.practice?.journey || "",
    discipline: data.practice?.discipline || "",
    type: `${data.practice?.journey || "session"}-${data.practice?.discipline || "practice"}`,
    checkedIn: [],
    checkedInIds: []
  };

  reviewAthletes = Array.isArray(data.roster) ? data.roster : [];
  const initialPresent = Array.isArray(pendingSession.presentIds) && pendingSession.presentIds.length
    ? pendingSession.presentIds
    : (Array.isArray(pendingSession.checkedInIds) ? pendingSession.checkedInIds : []);
  selectedIds = new Set(initialPresent.map(String).filter(Boolean));

  const journey = String(pendingSession.journey || pendingSession.type || "")
    .split("-")[0]
    .toLowerCase();
  if ($("practiceType")) $("practiceType").value = journey || "—";

  renderAthletes();
  setReviewControlsEnabled(true);

  const dateLabel = pendingSession.sessionDateLabel || pendingSession.sessionDateKey || todayLabel();
  setStatus(`Review loaded: ${dateLabel} · ${selectedIds.size} selected. Add or remove athletes to match who actually trained.`);
}

function renderAthletes() {
  const list = $("athleteList");
  const meta = $("countMeta");
  if (!list) return;

  if (meta) meta.textContent = `${reviewAthletes.length} athlete(s) in review`;

  if (!pendingSessionRef) {
    list.innerHTML = `<p class="muted">No pending attendance session found.</p>`;
    updatePresentCount();
    return;
  }

  if (!reviewAthletes.length) {
    list.innerHTML = `<p class="muted">No checked-in athletes found for this session.</p>`;
    updatePresentCount();
    return;
  }

  list.innerHTML = reviewAthletes.map((athlete) => {
    const id = athlete.id || athlete.uid;
    const checked = selectedIds.has(id) ? "checked" : "";

    return `
      <label class="athlete-row">
        <input
          type="checkbox"
          class="present-check"
          data-athlete-id="${id}"
          ${checked}
        />

        <span class="athlete-main">
          <strong>${athleteName(athlete)}</strong>
          <span class="muted">${id}</span>
          <span class="muted">${athleteProgram(athlete) || "—"}</span>
        </span>
      </label>
    `;
  }).join("");

  document.querySelectorAll(".present-check").forEach((check) => {
    check.addEventListener("change", () => {
      const id = check.dataset.athleteId;
      if (check.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updatePresentCount();
    });
  });

  updatePresentCount();
}


async function loadPendingSession() {
  setReviewControlsEnabled(false);
  await requireCoach();

  setStatus("Loading pending attendance…");

  const params = new URLSearchParams(window.location.search);
  const requestedSessionId = String(params.get("session") || params.get("practice") || params.get("practiceId") || "").trim();
  if (requestedSessionId) {
    if (requestedSessionId.includes("/")) {
      clearPendingSession();
      renderAthletes();
      setStatus("The requested attendance session ID is invalid.", true);
      return;
    }

    await loadPracticeReview(requestedSessionId);
    return;
  }

  const snap = await getDocs(query(collection(db, "attendance_sessions"), where("status", "==", "pending_review")));
  const pendingDocs = [...snap.docs].sort((a, b) => pendingSortValue(b) - pendingSortValue(a) || a.id.localeCompare(b.id));

  if (!pendingDocs.length) {
    clearPendingSession();
    renderAthletes();
    setStatus("No pending session ready to finalize.");
    return;
  }

  if (pendingDocs.length > 1) {
    clearPendingSession();
    renderPendingChoices(pendingDocs);
    updatePresentCount();
    setStatus("Multiple attendance sessions are awaiting review. Choose the exact session before finalizing.", true);
    return;
  }

  await loadPracticeReview(pendingDocs[0].id);
}

async function saveAttendance() {
  const saveBtn = $("saveAttendance");

  if (!pendingSessionRef || !pendingSession) {
    setStatus("No pending session loaded to finalize.", true);
    return;
  }

  const presentIds = [...selectedIds];
  if (!presentIds.length) {
    setStatus("At least one athlete must remain selected before finalizing.", true);
    return;
  }

  const notes = $("practiceNotes")?.value?.trim() || pendingSession.notes || "";

  try {
    if (saveBtn) saveBtn.disabled = true;
    setStatus("Finalizing attendance…");

    const finalizeAttendance = httpsCallable(functions, "finalizePracticeAttendance");
    await finalizeAttendance({ practiceId: pendingSessionId, presentIds, notes });

    const finalizedSessionId = pendingSessionId;

    setStatus(`Attendance finalized for ${presentIds.length} athlete(s). Ready for Daily Grind.`);
    showDailyGrindHandoff(finalizedSessionId);

    clearPendingSession();

    renderAthletes();
  } catch (error) {
    console.error("[attendance] finalize failed", error);
    setStatus("Attendance finalize failed. Check console.", true);
  } finally {
    if (saveBtn) saveBtn.disabled = !pendingSessionRef;
  }
}

function bindEvents() {
  $("selectAll")?.addEventListener("click", () => {
    reviewAthletes.forEach((athlete) => {
      const id = athlete.id || athlete.uid;
      if (id) selectedIds.add(id);
    });
    renderAthletes();
  });

  $("clearAll")?.addEventListener("click", () => {
    selectedIds.clear();
    renderAthletes();
  });

  $("saveAttendance")?.addEventListener("click", saveAttendance);
}

bindEvents();

loadPendingSession().catch((err) => {
  clearPendingSession();
  renderAthletes();
  const authFailure = /authentication|required|staff|coach access|profile is not active/i.test(String(err?.message || ""));
  if (!authFailure) console.error("[attendance] init failed", err);
  setStatus(
    authFailure
      ? "Coach authentication is required to review or finalize attendance. Sign in through Coach access and try again."
      : "Attendance failed to load. No attendance changes were made.",
    true
  );
});
