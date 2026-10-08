import {
  db,
  collection,
  getDocs,
  doc,
  getDoc,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";
import {
  LADDER_YOUTH,
  LADDER_F4,
  LADDER_Q2M
} from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

const LADDER_BY_JOURNEY = Object.freeze({
  Z2H: LADDER_YOUTH,
  P2L: LADDER_F4,
  Q2M: LADDER_Q2M
});

let athletes = [];
let filteredAthletes = [];
let checkedIn = new Map();
let sessionRef = null;
let sessionId = null;
let sessionLocked = false;
let activePractice = null;
let currentStep = 1;

function showStep(step) {
  const maxStep = isBuilderFlow() ? 4 : 3;
  currentStep = Math.min(maxStep, Math.max(1, Number(step) || 1));

  document
    .querySelectorAll("[data-step-screen]")
    .forEach((screen) => {
      const active =
        Number(screen.dataset.stepScreen) === currentStep;

      screen.hidden = !active;
      screen.classList.toggle("is-active", active);
    });

  document
    .querySelectorAll("[data-step-target]")
    .forEach((button) => {
      const target = Number(button.dataset.stepTarget);
      button.classList.toggle("is-active", target === currentStep);
      button.classList.toggle("is-complete", target < currentStep);

      if (target === 2) {
        button.disabled = !sessionRef || !sessionId;
      } else if (target === 3) {
        button.disabled = !checkedIn.size;
      } else if (target === 4) {
        button.disabled = !isBuilderFlow() || !checkedIn.size;
      } else {
        button.disabled = false;
      }
    });

  if (currentStep === 2) {
    requestAnimationFrame(() => {
      $("searchAthlete")?.focus();
    });
  }
}

function setStatus(msg, isError = false) {
  const el = $("sessionStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#ff8a8a" : "#9ca3af";
}

function athleteName(a = {}) {
  return a.name || a.publicName || a.fullName || a.uid || a.id || "Unknown athlete";
}

function athleteProgram(a = {}) {
  return String(
    a.journey ||
    a.programTrack ||
    a.program ||
    a.track ||
    a.trackCode ||
    a.trackKey ||
    a.ladderKey ||
    ""
  ).toLowerCase();
}

function athleteDisciplines(a = {}) {
  const raw = [
    a.discipline,
    a.primaryDiscipline,
    ...(Array.isArray(a.disciplines) ? a.disciplines : []),
    ...(Array.isArray(a.enrolledDisciplines) ? a.enrolledDisciplines : [])
  ].filter(Boolean);
  return raw.map((value) => String(value).trim().toLowerCase());
}

function athleteRouteDetail(a = {}) {
  return [
    a.journey || a.programTrack || a.program || "",
    a.discipline || a.primaryDiscipline || "",
    a.rank || a.tier || ""
  ].filter(Boolean).join(" · ");
}

function getPracticeType() {
  return `${activePractice?.journey || "session"}-${activePractice?.discipline || "practice"}`;
}

function programMatchesAthlete(athlete = {}) {
  const journey = String(activePractice?.journey || "").toLowerCase();
  const discipline = String(activePractice?.discipline || "").toLowerCase();
  const program = athleteProgram(athlete);
  const disciplines = athleteDisciplines(athlete);

  if (discipline && discipline !== "unassigned" && disciplines.length && !disciplines.includes(discipline)) {
    return false;
  }

  if (journey === "z2h" || journey === "zero2hero") {
    return program.includes("z2h") || program.includes("zero2hero") || program.includes("foundry8") || program.includes("f8");
  }

  if (journey === "p2l" || journey === "path2legend") {
    return program.includes("p2l") || program.includes("path2legend") || program.includes("foundry4") || program.includes("f4");
  }

  if (journey === "r2g" || journey === "road2greatness") {
    return program.includes("r2g") || program.includes("road2greatness") || program.includes("road");
  }

  if (journey === "q2m" || journey === "quest2mastery") {
    return program.includes("q2m") || program.includes("quest2mastery") || program.includes("quest") || program.includes("mma");
  }

  return true;
}

function isBuilderFlow() {
  const params = new URLSearchParams(window.location.search);
  return params.get("flow") === "builder";
}

function returnTarget() {
  return new URLSearchParams(window.location.search).get("return") || "";
}

function requestedPracticeId() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("practice") || params.get("practiceId") || "").trim();
}

function configureBuilderReturn() {
  const link = $("returnToBuilder");
  if (!link) return;
  const params = new URLSearchParams(window.location.search);
  if (!["builder", "clipboard"].includes(params.get("return"))) return;
  const practiceId = requestedPracticeId();
  if (!practiceId) return;
  link.href = `/coaches/execution/session-builder/?practiceId=${encodeURIComponent(practiceId)}`;
  link.hidden = false;
}

function rememberedPracticeId() {
  try {
    return String(JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}")?.practiceId || "").trim();
  } catch {
    return "";
  }
}

async function loadCanonicalPractice() {
  const practiceId = requestedPracticeId() || rememberedPracticeId();
  if (!practiceId || practiceId.includes("/")) {
    throw new Error("Open this page from a launched Session Builder practice.");
  }
  const getPractice = httpsCallable(functions, "getPracticeSession");
  const response = await getPractice({ practiceId });
  const practice = { practiceId, ...(response.data?.practice || {}) };
  if (String(practice.status || "").toLowerCase() !== "active") {
    throw new Error("This practice is no longer active.");
  }
  const discipline = String(practice.discipline || "").trim().toLowerCase();
  if (!discipline) {
    throw new Error("The active practice has no discipline state.");
  }
  activePractice = practice;
  sessionId = practiceId;
  sessionRef = doc(db, "attendance_sessions", practiceId);
  if ($("practiceIdentity")) {
    $("practiceIdentity").value = [practice.discipline, practice.journey, practice.roomId]
      .filter(Boolean).join(" · ");
  }
}

async function checkTodaySessionLock() {
  sessionLocked = false;

  try {
    const snap = await getDoc(doc(db, "attendance_sessions", activePractice.practiceId));
    if (!snap.exists()) return;
    const data = snap.data() || {};
    const locked = data.status === "pending_review" || data.status === "finalized";

    if (locked) {
      sessionLocked = true;
      setStatus(`Today's ${getPracticeType()} session is already submitted.`);
    }
  } catch (err) {
    console.warn("[session] lock check skipped", err);
    sessionLocked = false;
  }
}

async function loadAthletes() {
  setStatus("Loading athletes…");

  try {
    await requireCoach();
    await loadCanonicalPractice();
    await checkTodaySessionLock();

    const snap = await getDocs(collection(db, "athletes"));
    const dateEl = $("sessionDateLabel");
if (dateEl) {
  dateEl.textContent = todayLabel();
}

    athletes = snap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {})
      }))
      .filter((athlete) => {
        if (!athlete.id) return false;
        const status = String(athlete.rosterStatus || "current").toLowerCase();
        return status === "current";
      })
      .sort((a, b) => athleteName(a).localeCompare(athleteName(b)));

    console.log("[session] athletes loaded:", athletes.length, athletes);

    applyFilters();

    if (!sessionLocked) {
      setStatus(`Ready. ${athletes.length} athlete(s) loaded.`);
    }
  } catch (err) {
    console.error("[session] loadAthletes failed", err);
    setStatus("Could not load athletes. Check console.", true);

    const list = $("athleteList");
    if (list) {
      list.innerHTML = `<p class="muted">Could not load athletes.</p>`;
    }
  }
}

function applyFilters() {
  const search = String($("searchAthlete")?.value || "").toLowerCase().trim();

  filteredAthletes = athletes.filter((athlete) => {
    if (!programMatchesAthlete(athlete)) return false;
    if (checkedIn.has(athlete.id)) return false;

    const name = athleteName(athlete).toLowerCase();
    const id = String(athlete.id || "").toLowerCase();

    return !search || name.includes(search) || id.includes(search);
  });

  console.log("[session] filtered:", filteredAthletes.length, filteredAthletes);

  renderAthletes();
}

function renderAthletes() {
  const list = $("athleteList");
  if (!list) return;

  if (sessionLocked) {
    list.innerHTML = `<p class="muted">Today's session has already been submitted for coach review.</p>`;
    renderCheckedIn();
    return;
  }

  if (!filteredAthletes.length) {
    list.innerHTML = `<p class="muted">No athletes found.</p>`;
    return;
  }

  list.innerHTML = filteredAthletes.map((athlete) => {
    return `
      <button
        type="button"
        class="athlete-checkin-card"
        data-athlete-id="${athlete.id}"
      >
        <span class="athlete-main">
          <strong>${athleteName(athlete)}</strong>
          <span>${athlete.id}</span>
          <span>${athleteRouteDetail(athlete) || athleteProgram(athlete) || "—"}</span>
        </span>
        <span class="checkin-action">Check In</span>
      </button>
    `;
  }).join("");

  document.querySelectorAll(".athlete-checkin-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      checkInAthlete(btn.dataset.athleteId);
    });
  });
}

async function startSession() {
  if (sessionLocked) {
    setStatus("Today's session is already submitted. No more check-ins allowed.", true);
    return;
  }

  sessionRef = doc(db, "attendance_sessions", activePractice.practiceId);
  const existing = await getDoc(sessionRef);
  if (existing.exists()) {
    const data = existing.data() || {};
    checkedIn = new Map((Array.isArray(data.checkedIn) ? data.checkedIn : [])
      .map((athlete) => [athlete.id || athlete.uid, athlete]));
    setStatus(`Existing check-in loaded for ${todayLabel()}.`);
    renderAthletes();
    renderCheckedIn();
    showStep(2);
    return;
  }

  const updateCheckIn = httpsCallable(functions, "updatePracticeCheckIn");
  await updateCheckIn({
    practiceId: activePractice.practiceId,
    action: "start",
    notes: $("practiceNotes")?.value?.trim() || ""
  });

  sessionId = activePractice.practiceId;
  checkedIn = new Map();

  setStatus(`Session started for ${todayLabel()}.`);
  renderAthletes();
  renderCheckedIn();
  showStep(2);
}

async function checkInAthlete(id) {
  if (sessionLocked) {
    setStatus("Today's session is already submitted.", true);
    return;
  }

  if (!sessionRef || !sessionId) {
    setStatus("Start a session before checking in athletes.", true);
    return;
  }

  const athlete = athletes.find((a) => a.id === id);
  if (!athlete) return;

  const payload = {
    id: athlete.id,
    uid: athlete.uid || athlete.id,
    name: athleteName(athlete),
    publicName: athlete.publicName || "",
    fullName: athlete.fullName || "",
    program: athleteProgram(athlete),
    journey: athlete.journey || "",
    profileType: athlete.profileType || "",
    tier: athlete.tier || "",
    rank: athlete.rank || "",
    checkedInAt: new Date().toISOString()
  };

  const updateCheckIn = httpsCallable(functions, "updatePracticeCheckIn");
  const response = await updateCheckIn({ practiceId: activePractice.practiceId, action: "add", athleteId: id });
  const attendance = response.data?.attendance || {};
  checkedIn = new Map((Array.isArray(attendance.checkedIn) ? attendance.checkedIn : [])
    .map((item) => [item.id || item.uid, item]));

  setStatus(`${payload.name} checked in.`);
  renderAthletes();
  renderCheckedIn();
}

function renderCheckedIn() {
  const count = $("checkedCount");
  const list = $("checkedList");

  if (count) count.textContent = `${checkedIn.size} checked in`;
  if ($("checkedCountTop")) {
    $("checkedCountTop").textContent = `${checkedIn.size} in`;
  }
  if (!list) return;

  if (!checkedIn.size) {
    list.innerHTML = `<p class="muted">No athletes checked in yet.</p>`;
    return;
  }

  list.innerHTML = Array.from(checkedIn.values()).map((athlete) => `
    <div class="athlete-row checked-athlete-row">
      <span>
        <strong>${athlete.name}</strong>
        <span class="muted">${athlete.id}</span>
      </span>

      <button
        type="button"
        class="remove-checkin-btn"
        data-athlete-id="${athlete.id}"
        ${sessionLocked ? "disabled" : ""}
      >
        Remove
      </button>
    </div>
  `).join("");

  document.querySelectorAll(".remove-checkin-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (sessionLocked) return;

      const id = btn.dataset.athleteId;
      const updateCheckIn = httpsCallable(functions, "updatePracticeCheckIn");
      const response = await updateCheckIn({ practiceId: activePractice.practiceId, action: "remove", athleteId: id });
      const attendance = response.data?.attendance || {};
      checkedIn = new Map((Array.isArray(attendance.checkedIn) ? attendance.checkedIn : [])
        .map((item) => [item.id || item.uid, item]));

      renderAthletes();
      renderCheckedIn();
    });
  });
}
function ladderForPractice() {
  return LADDER_BY_JOURNEY[String(activePractice?.journey || "").toUpperCase()] || [];
}

function tierFromLadderKey(key = "") {
  return String(key || "").replace(/^R/i, "T");
}

function normalizeAthleteTier(athlete = {}, ladder = ladderForPractice()) {
  const direct = String(athlete.tier || "").trim();
  if (direct) return tierFromLadderKey(direct);

  const rank = String(athlete.rank || "").trim().toLowerCase();
  if (!rank) return "";

  const match = ladder.find((item) => String(item?.name || "").trim().toLowerCase() === rank);
  return match ? tierFromLadderKey(match.key) : "";
}

function dominantValue(values = []) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || "";
}

function previousRouteContext() {
  try {
    const value = JSON.parse(localStorage.getItem("sandman_previous_route_context_v1") || "{}");
    const sameRoute = String(value?.journey || "") === String(activePractice?.journey || "")
      && String(value?.discipline || "") === String(activePractice?.discipline || "");
    return sameRoute ? value : {};
  } catch {
    return {};
  }
}

function contextSuggestions() {
  const ladder = ladderForPractice();
  const present = Array.from(checkedIn.values()).map((checked) => {
    const id = String(checked?.id || checked?.uid || "");
    return athletes.find((athlete) => String(athlete.id || athlete.uid || "") === id) || checked;
  });
  const rosterTier = dominantValue(present.map((athlete) => normalizeAthleteTier(athlete, ladder)));

  const athleteWeek = dominantValue(present.map((athlete) => {
    const raw = athlete.trainingWeek ?? athlete.curriculumWeek ?? athlete.week ?? "";
    const num = Number(raw);
    return Number.isFinite(num) && num >= 1 && num <= 36 ? String(num) : "";
  }));

  const prior = previousRouteContext();
  const priorTier = String(prior?.tier || "").trim();
  const priorWeek = String(prior?.week || "").trim();

  return {
    tier: rosterTier || priorTier || "",
    week: athleteWeek || priorWeek || "1",
    tierSource: rosterTier
      ? "checked-in roster"
      : priorTier
        ? "last matching practice"
        : "no established tier yet",
    weekSource: athleteWeek
      ? "checked-in athlete context"
      : priorWeek
        ? "last matching practice"
        : "new route default"
  };
}

function populatePracticeContext() {
  const tierSelect = $("contextTierSelect");
  const weekSelect = $("contextWeekSelect");
  if (!tierSelect || !weekSelect) return;

  const ladder = ladderForPractice();
  const suggestions = contextSuggestions();

  tierSelect.innerHTML = '<option value="">Sandman Suggests</option>';
  ladder.forEach((rank) => {
    const option = document.createElement("option");
    option.value = tierFromLadderKey(rank.key);
    option.textContent = `${option.value} — ${rank.name}`;
    tierSelect.appendChild(option);
  });

  weekSelect.innerHTML = '<option value="">Sandman Suggests</option>';
  for (let week = 1; week <= 36; week += 1) {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    weekSelect.appendChild(option);
  }

  const mode = String(activePractice?.executionMode || "hybrid").toLowerCase();
  if (mode === "auto") {
    tierSelect.disabled = true;
    weekSelect.disabled = true;
  } else {
    tierSelect.disabled = false;
    weekSelect.disabled = false;
  }

  tierSelect.dataset.suggestion = suggestions.tier;
  weekSelect.dataset.suggestion = suggestions.week;

  $("contextTierSuggestion").textContent = suggestions.tier
    ? `Sandman suggests ${suggestions.tier} from the ${suggestions.tierSource}.`
    : "Sandman found mixed or missing tier data; Coach can choose a tier.";

  $("contextWeekSuggestion").textContent =
    `Sandman suggests Week ${suggestions.week} from the ${suggestions.weekSource}.`;

  updateContextSummary();
}

function selectedContextTier() {
  const select = $("contextTierSelect");
  return String(select?.value || select?.dataset?.suggestion || "").trim();
}

function selectedContextWeek() {
  const select = $("contextWeekSelect");
  return String(select?.value || select?.dataset?.suggestion || "").trim();
}

function updateContextSummary() {
  const tier = selectedContextTier();
  const week = selectedContextWeek();
  const tierLabel = tier || "No tier focus";
  const weekLabel = week ? `Week ${week}` : "No week selected";
  if ($("contextSummary")) $("contextSummary").textContent = `${tierLabel} · ${weekLabel}`;
}

function preparePracticeContext() {
  populatePracticeContext();
  showStep(4);
}

async function savePracticeContextToBuilderSession() {
  let session = {};
  try {
    session = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
  } catch {}

  const tier = selectedContextTier();
  const week = selectedContextWeek();
  const ladder = ladderForPractice();
  const rankLabel = ladder.find((item) => tierFromLadderKey(item.key) === tier)?.name || "";

  const updated = {
    ...session,
    tier,
    rank: tier,
    rankLabel,
    week,
    practiceId: activePractice?.practiceId || session.practiceId || ""
  };

  localStorage.setItem("sandman_session_builder_v1", JSON.stringify(updated));
  localStorage.setItem("sandman_tier", tier);
  localStorage.setItem("sandman_rank", tier);
  localStorage.setItem("sandman_rank_label", rankLabel);
  localStorage.setItem("sandman_week", week);

  if (tier && activePractice?.practiceId) {
    try {
      const openPractice = httpsCallable(functions, "openPracticeSession");
      await openPractice({
        practiceId: activePractice.practiceId,
        liveSessionId: activePractice.liveSessionId || activePractice.sessionId || "",
        locationId: activePractice.locationId || activePractice.academyId || "",
        academyId: activePractice.academyId || activePractice.locationId || "",
        roomId: activePractice.roomId || "",
        discipline: activePractice.discipline || "",
        journey: activePractice.journey || "",
        program: activePractice.program || "",
        track: activePractice.track || "",
        tier,
        schema: activePractice.schema || session.schema || "academy-60",
        executionMode: activePractice.executionMode || session.executionMode || "hybrid",
        durationMinutes: Number(activePractice.durationMinutes || session.durationMinutes || 60)
      });
      activePractice = { ...activePractice, tier };
    } catch (error) {
      console.warn("[session] practice tier sync skipped", error);
    }
  }
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
async function submitForReview() {
  if (!sessionRef || !sessionId) {
    setStatus("Start a session first.", true);
    return;
  }

  if (!checkedIn.size) {
    setStatus("No athletes checked in.", true);
    return;
  }

  const updateCheckIn = httpsCallable(functions, "updatePracticeCheckIn");
  await updateCheckIn({ practiceId: activePractice.practiceId, action: "submit" });

  sessionLocked = true;

  setStatus(
  `Submitted ${checkedIn.size} athlete(s) for coach review • ${todayLabel()}`
);

  renderAthletes();
  renderCheckedIn();

  if (isBuilderFlow() && returnTarget() === "clipboard") {
    await savePracticeContextToBuilderSession();
    let sessionId = "";
    try {
      sessionId = String(JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}")?.sessionId || "");
    } catch {}
    window.location.href = `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(sessionId)}&practiceId=${encodeURIComponent(activePractice.practiceId)}`;
  } else if (isBuilderFlow()) {
    window.location.href = `/coaches/execution/session-builder/?practiceId=${encodeURIComponent(activePractice.practiceId)}`;
  }
}

function bindEvents() {
  $("startSession")?.addEventListener("click", startSession);
  $("finalizeSession")?.addEventListener("click", () => {
    if (isBuilderFlow()) {
      preparePracticeContext();
    } else {
      submitForReview();
    }
  });
  $("finishContextBtn")?.addEventListener("click", submitForReview);
  $("backToReviewBtn")?.addEventListener("click", () => showStep(3));
  $("contextTierSelect")?.addEventListener("change", updateContextSummary);
  $("contextWeekSelect")?.addEventListener("change", updateContextSummary);

  $("searchAthlete")?.addEventListener("input", applyFilters);

  $("reviewAttendanceBtn")?.addEventListener("click", () => {
    if (!checkedIn.size) {
      setStatus("Check in at least one athlete before review.", true);
      return;
    }
    renderCheckedIn();
    showStep(3);
  });

  $("backToAthletesBtn")?.addEventListener("click", () => {
    showStep(2);
  });

  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      showStep(Number(button.dataset.stepTarget));
    });
  });

  document.querySelectorAll("[data-quick-search]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!$("searchAthlete")) return;
      $("searchAthlete").value = button.dataset.quickSearch || "";
      applyFilters();
      $("searchAthlete").focus();
    });
  });
}

bindEvents();
configureBuilderReturn();

if (isBuilderFlow()) {
  const label = $("attendanceFlowLabel");
  const title = $("attendanceTitle");
  const lead = $("attendanceLead");
  if (label) label.textContent = "Attendance";
  if (title) title.textContent = "Athlete Check-In";
  if (lead) lead.textContent = "Find your name, check in, review attendance, then confirm Sandman’s Tier and Training Week suggestion.";

  document.querySelector('[data-step-screen="1"] .eyebrow')?.replaceChildren("Step 1 of 4");
  document.querySelector('[data-step-screen="2"] .eyebrow')?.replaceChildren("Step 2 of 4");
  document.querySelector('[data-step-screen="3"] .eyebrow')?.replaceChildren("Step 3 of 4");
  document.querySelector('[data-step-screen="4"] .eyebrow')?.replaceChildren("Step 4 of 4");

  document.body.classList.add("builder-attendance-flow");
  if ($("contextStepNav")) $("contextStepNav").hidden = false;
  if ($("finalizeSession")) $("finalizeSession").textContent = "Continue to Practice Context";

  loadAthletes()
    .then(() => startSession())
    .catch((error) => {
      console.error("[session] builder attendance start failed", error);
      setStatus(error?.message || "Could not start attendance.", true);
    });
} else {
  showStep(1);
  loadAthletes();
}
