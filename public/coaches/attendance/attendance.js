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
import { postAuthoritativeXp } from "/assets/js/authoritative-xp-client.js";

console.log("NEW ATTENDANCE JS ACTIVE");
window.__attendance_loaded = true;
document.body.dataset.attendanceBuild = "bulk-xp-only3";

const $ = (id) => document.getElementById(id);

let reviewAthletes = [];
let selectedIds = new Set();
let pendingSessionRef = null;
let pendingSessionId = null;
let pendingSession = null;
let practiceDurationMinutes = 60;
const creditedAthletes = new Set();
const creditedAmounts = new Map();
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
  const raw = String(a.program || a.journey || a.track || a.trackCode || a.ladderKey || "").trim();
  const key = raw.toLowerCase().replace(/[\s_-]/g, "");
  // Display name only. Preserve historical program fields and immutable IDs.
  if (["z2h", "zero2hero", "r2c", "road2champion"].includes(key)) return "Road2Champion";
  if (["p2l", "path2legend"].includes(key)) return "Path2Legend";
  return raw || "—";
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
  const roster = document.querySelector(".roster-card");
  (roster || panel).scrollIntoView({ behavior: "smooth", block: "start" });
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
  // Presentation only: the authoritative XP service still validates each award.
  // Both time and tier come from the server-provided practice and athlete roster.
  if (!Number.isFinite(practiceDurationMinutes) || practiceDurationMinutes <= 0) return [];
  const identity = [athlete.id, athlete.trackBase, athlete.track, athlete.trackCode,
    athlete.journey, athlete.program, athlete.ladderKey].join(" ").toLowerCase();
  const youth = /f8|z2h|r2c|road2champion|youth/.test(identity);
  if (youth) return [5, 10];
  const tier = String(athlete.tier || athlete.tierCode || athlete.rank || "").toUpperCase();
  const apprentice = tier === "T0" || tier === "APPRENTICE" || !tier;
  if (apprentice || practiceDurationMinutes < 90) return [5, 10];
  if (practiceDurationMinutes < 120) return [5, 10, 15];
  return [5, 10, 15, 20];
}

function showPracticeXp(practiceId) {
  const panel = $("practiceXpPanel");
  if (!panel || !practiceId) return;
  panel.hidden = false;
  // Render the very same cards in XP mode; never clone the athlete roster.
  renderAthletes();
  if ($("issuePracticeXp")) $("issuePracticeXp").hidden = false;
  const status = $("practiceXpStatus");
  const verifiedCount = reviewAthletes.filter(a => selectedIds.has(String(a.id || a.uid || ""))).length;
  if (status) status.textContent = practiceDurationMinutes > 0
    ? verifiedCount + " verified participants · " + practiceDurationMinutes + "-minute practice. Choose an eligible XP amount on each verified card before approval."
    : "Practice duration could not be verified. XP cannot be issued until the practice record is corrected.";
  const issue = $("issuePracticeXp");
  if (issue) issue.disabled = !(practiceDurationMinutes > 0);
  const legacy = $("continueDailyGrind");
  if (legacy) legacy.hidden = true;
}

async function issueVerifiedPracticeXp() {
  if (issuingPracticeXp || !pendingSessionId || pendingSession?.finalized !== true) return;
  const button = $("issuePracticeXp");
  const status = $("practiceXpStatus");
  const choices = [...document.querySelectorAll(".practice-xp-amount")].filter(x => !creditedAthletes.has(x.dataset.athleteId));
  if (!choices.length && creditedAthletes.size !== selectedIds.size) {
    if (status) status.textContent = "No pending XP choices. Refresh to verify the practice record.";
    return;
  }
  if (choices.some(x => !x.value)) {
    if (status) status.textContent = "Select an XP amount on every verified athlete card before approval.";
    return;
  }
  const verified = reviewAthletes.filter(a => selectedIds.has(String(a.id || a.uid || "")));
  if (choices.length !== verified.length - creditedAthletes.size || choices.some(choice => {
    const athlete = verified.find(a => String(a.id || a.uid || "") === choice.dataset.athleteId);
    return !athlete || !athleteXpOptions(athlete).includes(Number(choice.value));
  })) {
    if (status) status.textContent = "One or more XP choices are unavailable for this Journey, Tier, or practice duration.";
    return;
  }
  issuingPracticeXp = true;
  if (button) button.disabled = true;
  try {
    await requireCoach();
    let succeeded = 0;
    const failures = [];
    for (const choice of choices) {
      const athleteId = choice.dataset.athleteId;
      try {
        const data = await postAuthoritativeXp({
            uid: athleteId, kind: "DAILY_GRIND", amount: Number(choice.value),
            lane: "combat", meta: { lane: "combat", source: "daily-grind",
              attendanceSessionId: pendingSessionId, sessionId: pendingSessionId,
              durationMinutes: practiceDurationMinutes }
        });
        creditedAthletes.add(athleteId);
        creditedAmounts.set(athleteId, Number(choice.value));
        const athleteCard = choice.closest(".athlete-row");
        if (athleteCard) {
          athleteCard.classList.add("is-credited");
          athleteCard.querySelectorAll(".xp-choice").forEach(control => { control.disabled = true; });
          const label = athleteCard.querySelector(".xp-selection-status");
          if (label) label.textContent = data.idempotent
            ? "Already credited · no additional XP"
            : "Credited · +" + Number(data.delta ?? choice.value) + " XP";
        }
        choice.disabled = true;
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
      if (status) status.textContent = "XP verified. Closing practice…";
      const close = httpsCallable(functions, "closePracticeSession");
      const response = await close({ practiceId: pendingSessionId, attendanceSessionId: pendingSessionId });
      if (response.data?.status !== "closed") throw new Error("Practice close was not confirmed.");
      if (status) status.textContent = "Session XP approved and practice closed. Attendance, XP and verified history are preserved.";
      if (button) button.hidden = true;
    } else if (status) {
      status.textContent = "XP recorded. Additional verified participants still require Daily Grind credit. Practice remains open.";
    }
  } catch (error) {
    console.error("[attendance-xp] issue or completion failed", error);
    if (status) status.textContent = "XP approval or practice close not confirmed: " + safeXpError(error) + ". Existing awards are preserved. Verify session status before retrying.";
  } finally {
    issuingPracticeXp = false;
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
  creditedAmounts.clear();
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
  const trustedDuration = pendingSession.durationMinutes ?? data.practice?.durationMinutes;
  practiceDurationMinutes = Number(trustedDuration);
  if (!Number.isFinite(practiceDurationMinutes) || practiceDurationMinutes <= 0) practiceDurationMinutes = 0;
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
  const attendanceFinish = $("attendanceFinish");
  if (attendanceFinish) attendanceFinish.hidden = finalized;
  const reviewActions = document.querySelector(".attendance-review .toolbar-card .action-row");
  if (reviewActions) reviewActions.hidden = finalized;
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

function selectCardXp(controls, amountInput, selectionStatus, amount) {
  amountInput.value = String(amount);
  controls.querySelectorAll(".xp-choice").forEach(button => {
    const active = button.dataset.amount === String(amount);
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  selectionStatus.textContent = "+" + amount + " XP selected · not issued";
}

function applyXpToAll(amount) {
  if (issuingPracticeXp || pendingSession?.finalized !== true || !pendingSessionId) return;
  let changed = 0;
  let skipped = 0;
  for (const athlete of reviewAthletes) {
    const id = String(athlete.id || athlete.uid || "");
    if (!selectedIds.has(id) || creditedAthletes.has(id)) continue;
    if (!athleteXpOptions(athlete).includes(amount)) {
      skipped++;
      continue;
    }
    const input = [...document.querySelectorAll(".practice-xp-amount")]
      .find(el => el.dataset.athleteId === id);
    const row = input?.closest(".athlete-row");
    const controls = row?.querySelector(".xp-choice-group");
    const label = row?.querySelector(".xp-selection-status");
    if (!input || !controls || !label || input.disabled) continue;
    selectCardXp(controls, input, label, amount);
    changed++;
  }
  const status = $("bulkXpStatus");
  if (status) status.textContent = changed + " verified athletes set to +" + amount + " XP. Adjust individual cards below." +
    (skipped ? " " + skipped + " ineligible athletes were skipped." : "");
}

function renderAthletes() {
  const list = $("athleteList");
  const meta = $("countMeta");
  if (!list) return;
  const finalized = pendingSession?.finalized === true
    || String(pendingSession?.status || "").toLowerCase() === "finalized";
  const bulk = $("bulkXpChoices");
  if (bulk) bulk.hidden = !finalized;
  if (meta) meta.textContent = finalized
    ? selectedIds.size + " verified · " + practiceDurationMinutes + "-minute practice"
    : reviewAthletes.length + " athlete(s) in review";

  list.replaceChildren();
  if (!pendingSessionRef || !reviewAthletes.length) {
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = !pendingSessionRef
      ? "No pending attendance session found."
      : "No checked-in athletes found for this session.";
    list.append(message);
    updatePresentCount();
    return;
  }
  for (const athlete of reviewAthletes) {
    const id = String(athlete.id || athlete.uid || "");
    const present = selectedIds.has(id);
    const row = document.createElement("div");
    row.className = "athlete-row single-roster-athlete";
    if (finalized) row.classList.add(present ? "is-present" : "is-absent");
    const info = document.createElement("span");
    info.className = "athlete-main";
    const name = document.createElement("strong");
    name.textContent = athleteName(athlete);
    const uid = document.createElement("span");
    uid.className = "muted";
    uid.textContent = id;
    const program = document.createElement("span");
    program.className = "muted";
    program.textContent = athleteProgram(athlete) || "—";
    info.append(name, uid, program);

    if (!finalized) {
      const attendanceLabel = document.createElement("label");
      attendanceLabel.className = "attendance-card-choice";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "present-check";
      checkbox.dataset.athleteId = id;
      checkbox.checked = present;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updatePresentCount();
      });
      attendanceLabel.append(checkbox, info);
      row.append(attendanceLabel);
    } else {
      const flag = document.createElement("span");
      flag.className = "xp-attendance-flag";
      flag.textContent = present ? "✓ Verified present" : "Not present · no XP";
      row.append(info, flag);
      if (present) {
        const options = athleteXpOptions(athlete);
        const controls = document.createElement("div");
        controls.className = "xp-choice-group";
        controls.setAttribute("role", "group");
        controls.setAttribute("aria-label", "Daily Grind XP for " + athleteName(athlete));
        const amountInput = document.createElement("input");
        amountInput.type = "hidden";
        amountInput.className = "practice-xp-amount";
        amountInput.dataset.athleteId = id;
        for (const amount of options) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "xp-choice xp-choice--" + amount;
          button.textContent = "+" + amount + " XP";
          button.dataset.amount = String(amount);
          button.setAttribute("aria-pressed", "false");
          button.addEventListener("click", () => {
            if (issuingPracticeXp || creditedAthletes.has(id)) return;
            selectCardXp(controls, amountInput, selectionStatus, amount);
          });
          controls.append(button);
        }
        const selectionStatus = document.createElement("span");
        selectionStatus.className = "xp-selection-status";
        selectionStatus.setAttribute("aria-live", "polite");
        selectionStatus.textContent = options.length ? "Choose earned XP" : "No eligible XP amount · verify practice details";
        if (creditedAthletes.has(id)) {
          amountInput.value = String(creditedAmounts.get(id) || "");
          amountInput.disabled = true;
          controls.querySelectorAll(".xp-choice").forEach(button => {
            button.disabled = true;
            button.classList.toggle("is-selected", button.dataset.amount === amountInput.value);
          });
          selectionStatus.textContent = "Credited · +" + (creditedAmounts.get(id) || "?") + " XP";
          row.classList.add("is-credited");
        }
        row.append(amountInput, controls, selectionStatus);
      }
    }
    list.append(row);
  }
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
    setStatus(`Attendance finalized for ${presentIds.length} athlete(s). Assign Daily Grind XP on the verified cards above.`);
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
  $("bulkXp10")?.addEventListener("click", () => applyXpToAll(10));
  $("bulkXp5")?.addEventListener("click", () => applyXpToAll(5));
  $("issuePracticeXp")?.addEventListener("click", issueVerifiedPracticeXp);
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
