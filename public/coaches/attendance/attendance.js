import {
  db,
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  updateDoc,
  serverTimestamp,
  arrayUnion
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

function updatePresentCount() {
  const el = $("presentCount");
  if (el) el.textContent = `${selectedIds.size} selected`;
}

function selectedProgram() {
  return String($("practiceType")?.value || "").toLowerCase();
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

function loadSessionDocument(pickedDoc) {
  pendingSessionRef = pickedDoc.ref;
  pendingSessionId = pickedDoc.id;
  pendingSession = pickedDoc.data() || {};

  reviewAthletes = Array.isArray(pendingSession.checkedIn) ? pendingSession.checkedIn : [];
  selectedIds = new Set(reviewAthletes.map((a) => a.id || a.uid).filter(Boolean));

  const journey = String(pendingSession.journey || pendingSession.type || "")
    .split("-")[0]
    .toLowerCase();
  if ($("practiceType")) $("practiceType").value = journey || "—";

  renderAthletes();
  setReviewControlsEnabled(true);

  const dateLabel = pendingSession.sessionDateLabel || pendingSession.sessionDateKey || todayLabel();
  setStatus(`Review loaded: ${dateLabel} · ${selectedIds.size} checked-in athlete(s). Uncheck anyone who was not present.`);
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

  const requestedSessionId = new URLSearchParams(window.location.search).get("session")?.trim() || "";
  if (requestedSessionId) {
    if (requestedSessionId.includes("/")) {
      clearPendingSession();
      renderAthletes();
      setStatus("The requested attendance session ID is invalid.", true);
      return;
    }

    const requestedSnap = await getDoc(doc(db, "attendance_sessions", requestedSessionId));
    if (!requestedSnap.exists()) {
      clearPendingSession();
      renderAthletes();
      setStatus("The requested attendance session was not found.", true);
      return;
    }
    if (requestedSnap.data()?.status !== "pending_review") {
      clearPendingSession();
      renderAthletes();
      setStatus("The requested attendance session is not awaiting Coach review.", true);
      return;
    }

    loadSessionDocument(requestedSnap);
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

  loadSessionDocument(pendingDocs[0]);
}

function selectedAthletesPayload() {
  return reviewAthletes
    .filter((athlete) => selectedIds.has(athlete.id || athlete.uid))
    .map((athlete) => ({
      id: athlete.id || athlete.uid,
      uid: athlete.uid || athlete.id,
      name: athleteName(athlete),
      publicName: athlete.publicName || "",
      fullName: athlete.fullName || "",
      program: athlete.program || "",
      journey: athlete.journey || "",
      profileType: athlete.profileType || "",
      ladderKey: athlete.ladderKey || "",
      tier: athlete.tier || "",
      rank: athlete.rank || ""
    }));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function countsAsDecayRecoveryDay(type = "") {
  const t = String(type || "").toLowerCase();
  return (
    t.includes("attendance") ||
    t.includes("combat") ||
    t.includes("practice") ||
    t.includes("open_mat") ||
    t.includes("daily_grind") ||
    t.includes("tournament") ||
    t.includes("p2l") ||
    t.includes("z2h") ||
    t.includes("r2g") ||
    t.includes("q2m")
  );
}

async function updateAthleteAttendance(athlete, finalType, coach) {
  const athleteId = athlete.id || athlete.uid;
  if (!athleteId) return;

  const ref = doc(db, "athletes", athleteId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() || {} : {};

  const decay = current.decay || {};
  const recoveryLog = Array.isArray(decay.recoveryLog)
    ? decay.recoveryLog
    : [];

  const recoveryDateKey = todayKey();
  const alreadyCountedToday = recoveryLog.includes(recoveryDateKey);

  const updatePayload = {
    lastAttendanceAt: serverTimestamp(),
    lastAttendanceType: finalType,
    lastAttendanceCoach: coach,
    lastAttendanceSessionId: pendingSessionId,
    updatedAt: serverTimestamp()
  };

  if (
    countsAsDecayRecoveryDay(finalType) &&
    decay.state === "DECAY_ACTIVE" &&
    !alreadyCountedToday
  ) {
    const completed = Number(decay.recoveryDaysCompleted || 0) + 1;

    updatePayload["decay.recoveryDaysCompleted"] = completed;
    updatePayload["decay.recoveryLog"] = arrayUnion(recoveryDateKey);
    updatePayload["decay.lastRecoveryAt"] = serverTimestamp();

    if (completed >= 3) {
      updatePayload["decay.state"] = "CLEAR";
      updatePayload["decay.points"] = 0;
      updatePayload["decay.hits"] = 0;
      updatePayload["decay.nextHitAt"] = null;
      updatePayload["decay.recoveryLog"] = [];
      updatePayload["decay.recoveryDaysCompleted"] = 0;
      updatePayload["decay.clearedAt"] = serverTimestamp();
      updatePayload["decay.reason"] =
        "Recovered after 3 separate verified combat attendance days";
    }
  }

  await updateDoc(ref, updatePayload);
}

async function saveAttendance() {
  const saveBtn = $("saveAttendance");

  if (!pendingSessionRef || !pendingSession) {
    setStatus("No pending session loaded to finalize.", true);
    return;
  }

  const present = selectedAthletesPayload();

  if (!present.length) {
    setStatus("At least one athlete must remain selected before finalizing.", true);
    return;
  }

  const coach = $("coachName")?.value?.trim() || pendingSession.coach || "Coach";
  const notes = $("practiceNotes")?.value?.trim() || pendingSession.notes || "";

  const finalJourney = pendingSession.journey || selectedProgram();
  const finalDiscipline = pendingSession.discipline || "";
  const finalType =
    pendingSession.type ||
    `${finalJourney || "session"}-${finalDiscipline || "practice"}`;

  try {
    if (saveBtn) saveBtn.disabled = true;
    setStatus("Finalizing attendance…");

    const originalIds = Array.isArray(pendingSession.checkedInIds)
      ? pendingSession.checkedInIds
      : reviewAthletes.map((a) => a.id || a.uid).filter(Boolean);

    await updateDoc(pendingSessionRef, {
      type: finalType,
      journey: finalJourney,
      discipline: finalDiscipline,
      coach,
      notes,

      status: "finalized",
      readyForDailyGrind: true,
      finalized: true,
      finalizedAt: serverTimestamp(),
      finalizedBy: coach,

      present,
      presentIds: present.map((a) => a.id),
      presentCount: present.length,

      removedFromReviewIds: originalIds.filter((id) => !selectedIds.has(id)),

      updatedAt: serverTimestamp(),
      source: "coach-attendance"
    });

    await Promise.all(
      present.map((athlete) =>
        updateAthleteAttendance(athlete, finalType, coach)
      )
    );

    setStatus(`Attendance finalized for ${present.length} athlete(s). Ready for Daily Grind.`);

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
