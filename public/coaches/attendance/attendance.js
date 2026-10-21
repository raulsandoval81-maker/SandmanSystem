import {
  db,
  auth,
  collection,
  getDocs,
  query,
  where,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";
import { XP_URL } from "/assets/js/coach-endpoints.js";

console.log("NEW ATTENDANCE JS ACTIVE");
window.__attendance_loaded = true;
document.body.dataset.attendanceBuild = "integrated-xp2";

const $ = (id) => document.getElementById(id);

let reviewAthletes = [];
let selectedIds = new Set();
let pendingSessionRef = null;
let pendingSessionId = null;
let pendingSession = null;
let practiceDurationMinutes = 60;
const creditedAthletes = new Set();
let issuingPracticeXp = false;

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
  for (const id of ["saveStatus", "attendanceFinishStatus"]) {
    const el = $(id);
    if (!el) continue;
    el.textContent = msg;
    el.style.color = isError ? "#ff8a8a" : "";
  }
}

function revealPracticeXp() {
  const panel = $("practiceXpPanel");
  if (!panel || panel.hidden) return;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
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
  link.hidden = false;
}

function safeXpError(error) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  const message = String(error?.message || "Request failed.").replace(/^functions\/[\w-]+:\s*/, "");
  return (code ? code + " · " : "") + message;
}

function athleteXpOptions(athlete) {
  const base = String(athlete.trackBase || athlete.track || athlete.trackCode || athlete.journey || "").toLowerCase();
  const youth = /f8|z2h|road2champion/.test(base);
  if (youth || practiceDurationMinutes < 90) return [5, 10];
  return practiceDurationMinutes >= 120 ? [10, 20] : [5, 10, 15];
}

function showPracticeXp(practiceId) {
  const panel = $("practiceXpPanel");
  const rows = $("practiceXpRows");
  if (!panel || !rows || !practiceId) return;
  panel.hidden = false;
  rows.replaceChildren();
  const verified = reviewAthletes.filter(a => selectedIds.has(String(a.id || a.uid || "")));
  for (const athlete of verified) {
    const id = String(athlete.id || athlete.uid || "");
    const row = document.createElement("label");
    row.className = "athlete-row";
    const info = document.createElement("span");
    info.className = "athlete-main";
    const name = document.createElement("strong");
    name.textContent = athleteName(athlete);
    const uid = document.createElement("span");
    uid.className = "muted";
    uid.textContent = id;
    info.append(name, uid);
    const select = document.createElement("select");
    select.className = "practice-xp-amount";
    select.dataset.athleteId = id;
    select.setAttribute("aria-label", "Daily Grind XP for " + athleteName(athlete));
    for (const [value, label] of [["", "Choose XP"], ...athleteXpOptions(athlete).map(v => [String(v), "+" + v + " XP"])]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    if (creditedAthletes.has(id)) {
      select.disabled = true;
      select.replaceChildren(new Option("Credited", ""));
    }
    row.append(info, select);
    rows.append(row);
  }
  const close = $("practiceXpCloseout");
  if (close) close.hidden = true;
  if ($("finalClosePractice")) $("finalClosePractice").hidden = true;
  const status = $("practiceXpStatus");
  if (status) status.textContent = verified.length + " verified participants · " + practiceDurationMinutes + "-minute practice. Choose an amount for every athlete before issuing.";
  const legacy = $("continueDailyGrind");
  if (legacy) legacy.hidden = true;
}

async function issueVerifiedPracticeXp() {
  if (issuingPracticeXp || !pendingSessionId || pendingSession?.finalized !== true) return;
  const button = $("issuePracticeXp");
  const status = $("practiceXpStatus");
  const choices = [...document.querySelectorAll(".practice-xp-amount")].filter(x => !creditedAthletes.has(x.dataset.athleteId));
  if (!choices.length) {
    if (status) status.textContent = "No new awards selected. Refresh to verify the practice record.";
    return;
  }
  if (choices.some(x => !x.value)) {
    if (status) status.textContent = "Choose an eligible XP amount for every remaining verified participant first.";
    return;
  }
  issuingPracticeXp = true;
  if (button) button.disabled = true;
  try {
    const access = await requireCoach();
    const user = access?.user || auth.currentUser;
    if (!user || user.isAnonymous || auth.currentUser?.uid !== user.uid) throw new Error("Active Coach authentication required.");
    const token = await user.getIdToken();
    let succeeded = 0;
    const failures = [];
    for (const choice of choices) {
      const athleteId = choice.dataset.athleteId;
      try {
        const response = await fetch(XP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ data: {
            uid: athleteId, kind: "DAILY_GRIND", amount: Number(choice.value),
            lane: "combat", meta: { lane: "combat", source: "daily-grind",
              attendanceSessionId: pendingSessionId, sessionId: pendingSessionId,
              durationMinutes: practiceDurationMinutes }
          } })
        });
        const raw = await response.text();
        let result = {};
        try { result = JSON.parse(raw || "{}"); } catch { /* keep HTTP error */ }
        const data = result.result || result.data || result;
        if (!response.ok || !data.ok) throw new Error(data.message || data.error?.message || raw.slice(0, 160) || "XP request rejected.");
        creditedAthletes.add(athleteId);
        choice.disabled = true;
        choice.replaceChildren(new Option(data.idempotent ? "Already credited" : "Credited", ""));
        succeeded += 1;
      } catch (error) {
        failures.push(athleteId + ": " + safeXpError(error));
      }
    }
    if (failures.length) {
      if (status) status.textContent = succeeded + " recorded; " + failures.length + " need review. " + failures.slice(0, 3).join(" | ") + " Retry only the remaining athletes.";
      return;
    }
    const complete = httpsCallable(functions, "completePracticeDailyGrind");
    const result = await complete({ practiceId: pendingSessionId, athleteIds: [...creditedAthletes] });
    if (result.data?.readyForDailyGrind === false) {
      if (status) status.textContent = "Daily Grind complete for all verified participants. Final Close is now available.";
      const closeButton = $("finalClosePractice");
      if (closeButton) closeButton.hidden = false;
      if (button) button.hidden = true;
    } else if (status) {
      status.textContent = "XP recorded. Additional verified participants still require Daily Grind credit.";
    }
  } catch (error) {
    console.error("[attendance-xp] issue or completion failed", error);
    if (status) status.textContent = "XP completion not confirmed: " + safeXpError(error) + ". Check award history before retrying.";
  } finally {
    issuingPracticeXp = false;
    if (button) button.disabled = false;
  }
}

async function finalCloseVerifiedPractice() {
  if (!pendingSessionId || pendingSession?.finalized !== true || issuingPracticeXp) return;
  const button = $("finalClosePractice");
  const status = $("practiceXpStatus");
  if (button) button.disabled = true;
  try {
    await requireCoach();
    const close = httpsCallable(functions, "closePracticeSession");
    const response = await close({ practiceId: pendingSessionId, attendanceSessionId: pendingSessionId });
    if (response.data?.status !== "closed") throw new Error("Practice close was not confirmed.");
    if (status) status.textContent = "Practice closed successfully. Attendance, XP and verified history are preserved.";
    if (button) button.hidden = true;
    const next = $("practiceXpCloseout");
    if (next) next.hidden = false;
  } catch (error) {
    console.error("[attendance-xp] final close failed", error);
    if (status) status.textContent = "Final Close blocked: " + safeXpError(error) + ". Existing awards are preserved.";
  } finally {
    if (button) button.disabled = false;
  }
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
  practiceDurationMinutes = 60;
  creditedAthletes.clear();
  if ($("practiceXpPanel")) $("practiceXpPanel").hidden = true;
  if ($("practiceType")) $("practiceType").value = "—";
  setReviewControlsEnabled(false);
  const handoff = $("continueDailyGrind");
  if (handoff) handoff.hidden = true;
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
  practiceDurationMinutes = Number(pendingSession.durationMinutes || data.practice?.durationMinutes || 60);
  const initialPresent = Array.isArray(pendingSession.presentIds) && pendingSession.presentIds.length
    ? pendingSession.presentIds
    : (Array.isArray(pendingSession.checkedInIds) ? pendingSession.checkedInIds : []);
  selectedIds = new Set(initialPresent.map(String).filter(Boolean));

  const journey = String(pendingSession.journey || pendingSession.type || "")
    .split("-")[0]
    .toLowerCase();
  if ($("practiceType")) $("practiceType").value = journey || "—";

  const finalized = pendingSession.finalized === true ||
    String(pendingSession.status || "").toLowerCase() === "finalized";
  renderAthletes();
  setReviewControlsEnabled(!finalized);
  const finalizeButton = $("saveAttendance");
  if (finalizeButton) finalizeButton.hidden = finalized;
  if (finalized) {
    showPracticeXp(practiceId);
    requestAnimationFrame(revealPracticeXp);
    document.querySelectorAll(".present-check").forEach((check) => { check.disabled = true; });
  } else {
    const handoff = $("continueDailyGrind");
    if (handoff) handoff.hidden = true;
    if ($("practiceXpPanel")) $("practiceXpPanel").hidden = true;
  }

  const dateLabel = pendingSession.sessionDateLabel || pendingSession.sessionDateKey || todayLabel();
  setStatus(finalized
    ? `Attendance finalized: ${dateLabel} · ${selectedIds.size} verified present. This roster is read-only. Continue to Daily Grind.`
    : `Review loaded: ${dateLabel} · ${selectedIds.size} selected. Add or remove athletes to match who actually trained.`);
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

  if (pendingSession?.finalized === true || String(pendingSession?.status || "").toLowerCase() === "finalized") {
    setStatus("Attendance was already finalized. Continue to Daily Grind; do not submit it again.", true);
    return;
  }

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

    await loadPracticeReview(finalizedSessionId);
    setStatus(`Attendance finalized for ${presentIds.length} athlete(s). Choose Daily Grind XP below.`);
    revealPracticeXp();
  } catch (error) {
    console.error("[attendance] finalize failed", error);
    setStatus("Attendance finalize failed: " + safeXpError(error) + ". No XP was issued.", true);
  } finally {
    if (saveBtn) saveBtn.disabled = !pendingSessionRef || pendingSession?.finalized === true;
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
  $("issuePracticeXp")?.addEventListener("click", issueVerifiedPracticeXp);
  $("finalClosePractice")?.addEventListener("click", finalCloseVerifiedPractice);
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
