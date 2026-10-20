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
import {
  MAX_TRAINING_GROUPS,
  NORMAL_TRAINING_GROUP_CAPACITY,
  athleteCanJoinTrainingGroup,
  moveAthleteBetweenGroups,
  normalizeTrainingGroup,
  restoreCoachGroupOverrides,
  suggestTierAwareTrainingGroups,
  validateTrainingGroupRoster
} from "/coaches/attendance/practice-group-policy.js";
import { renderAttendanceHybridPlanning } from "/coaches/attendance/hybrid-group-planning.js";

const $ = (id) => document.getElementById(id);
let fourGroupExceptionAcknowledged = false;
const hybridStageState = { planningSources: {}, groupPlanning: {}, planningSourcesExplicitlySelected: false };

function isHybridPractice() {
  let mode = String(activePractice?.executionMode || "").toLowerCase();
  if (!mode) {
    try {
      const remembered = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
      if (String(remembered.practiceId || "") === String(activePractice?.practiceId || "")) {
        mode = String(remembered.executionMode || "").toLowerCase();
      }
    } catch {}
  }
  return mode === "hybrid";
}

function showHybridStage() {
  const host = $("postAttendanceHybridPlanning");
  if (!host) return;
  host.hidden = !isBuilderFlow() || !isHybridPractice();
  if (host.hidden) return;
  renderAttendanceHybridPlanning(host, captureTrainingGroups(), hybridStageState, refresh => {
    if (refresh) { hybridStageState.planningSourcesExplicitlySelected = true; showHybridStage(); }
  });
}

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
  if (currentStep === 4) {
    setPracticeContextStatus(msg, isError);
    return;
  }
  const el = $("sessionStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#ff8a8a" : "#9ca3af";
}

function setPracticeContextStatus(msg, isError = false) {
  const el = $("practiceContextStatus");
  if (!el) return;
  el.textContent = String(msg || "");
  el.hidden = !el.textContent;
  el.classList.toggle("is-error", isError);
  el.setAttribute("aria-live", isError ? "assertive" : "polite");
}

function clearPracticeContextValidation() {
  document.querySelectorAll(".training-group-card.has-validation-error").forEach((card) => {
    card.classList.remove("has-validation-error");
    card.querySelector(".training-tier")?.removeAttribute("aria-invalid");
  });
  setPracticeContextStatus("");
}

function revealUnconfirmedFocusGroups(groupIds = []) {
  const targets = new Set(groupIds.map(String));
  const labels = [];
  let firstFocus = null;
  document.querySelectorAll(".training-group-card").forEach((card, index) => {
    const groupId = `group-${index + 1}`;
    if (!targets.has(groupId)) return;
    const label = `Group ${String.fromCharCode(65 + index)}`;
    labels.push(label);
    card.classList.add("has-validation-error");
    const editor = card.querySelector(".training-group-editor");
    if (editor) editor.open = true;
    const focus = card.querySelector(".training-tier");
    focus?.setAttribute("aria-invalid", "true");
    firstFocus ||= focus;
  });
  if (firstFocus) requestAnimationFrame(() => {
    firstFocus.scrollIntoView({ behavior: "smooth", block: "center" });
    firstFocus.focus({ preventScroll: true });
  });
  return labels;
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

function disciplineForAthlete(a = {}) {
  return String(
    a.discipline ||
    a.primaryDiscipline ||
    (Array.isArray(a.disciplines) ? a.disciplines[0] : "") ||
    (Array.isArray(a.enrolledDisciplines) ? a.enrolledDisciplines[0] : "") ||
    ""
  ).trim().toLowerCase();
}

function journeyDisplay(value = "") {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (["z2h", "zero2hero", "road2champion"].includes(key)) return "Road2Champion";
  if (["p2l", "path2legend"].includes(key)) return "Path2Legend";
  if (["q2m", "quest2mastery"].includes(key)) return "Quest2Mastery";
  return raw;
}

function disciplineDisplay(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return ({
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
    muaythai: "Muay Thai",
    mma: "MMA",
    "submission-grappling": "Submission Grappling",
    striking: "Striking"
  })[raw] || String(value || "").trim();
}

function escapeAttendance(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function attendanceIdentityMarkup(a = {}) {
  const id = String(a.id || a.uid || "").trim();
  const item = athletes.find(row => row.id === id) || a;
  const journey = journeyDisplay(item.journey || item.programTrack || item.program || "");
  const discipline = disciplineDisplay(item.discipline || item.primaryDiscipline || activePractice?.discipline || "");
  const tier = String(item.tier || a.tier || "").trim();
  const rank = String(item.rank || a.rank || "").trim();
  const route = [journey, discipline, [tier, rank].filter(Boolean).join(" · ")].filter(Boolean).join(" · ");
  // Display only: resolve the belt rim from the Journey, tier, and discipline.
  // Never infer a belt color from rank-name keywords.
  const tierCode = /^T[0-4]$/i.test(tier) ? tier.toUpperCase() : "";
  const striking = /^(boxing|muay thai|muay-thai|muaythai|kickboxing|striking)$/i.test(discipline);
  const palette = journey === "Road2Champion"
    ? ["white", "yellow", "orange", "green", "black"]
    : journey === "Path2Legend" || journey === "Quest2Mastery"
      ? ["white", "blue", "purple", "brown", "black"]
      : [];
  const index = tierCode ? Number(tierCode.slice(1)) : -1;
  const color = index === 0 && striking && palette.length ? "gray" : (palette[index] || "neutral");
  return '<span class="attendance-identity"><strong>' + escapeAttendance(athleteName(item)) +
    '</strong><small>' + escapeAttendance(id) + '</small><span class="attendance-route attendance-rank-' +
    color + '">' + escapeAttendance(route || "Training details not assigned") + '</span></span>';
}
function athleteRouteDetail(a = {}) {
  return [
    journeyDisplay(a.journey || a.programTrack || a.program || ""),
    disciplineDisplay(a.discipline || a.primaryDiscipline || ""),
    a.rank || a.tier || ""
  ].filter(Boolean).join(" · ");
}

function getPracticeType() {
  return [journeyDisplay(activePractice?.journey), disciplineDisplay(activePractice?.discipline)]
    .filter(Boolean)
    .join(" · ") || "practice";
}

function matLabel() {
  return "Mat 1";
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

function rosterJourneyForAthlete(athlete = {}) {
  const direct = normalizeJourneyCode(
    athlete.journey ||
    athlete.programTrack ||
    athlete.track ||
    athlete.program ||
    ""
  );
  if (direct) return direct;

  const id = String(athlete.id || athlete.uid || "").toUpperCase();
  if (id.startsWith("F8_")) return "Z2H";
  if (id.startsWith("F4_")) return "P2L";
  return "";
}

function builderJourneyFilter() {
  try {
    const session = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
    return String(session?.attendanceJourneyFilter || "").trim();
  } catch {
    return "";
  }
}

function populateJourneyRosterFilter() {
  const select = $("journeyRosterFilter");
  if (!select) return;

  const preferred = normalizeJourneyCode(select.value || builderJourneyFilter());
  const journeys = [...new Set(athletes.map(rosterJourneyForAthlete).filter(Boolean))];
  const ordered = ["Z2H", "P2L", "Q2M"].filter(code => journeys.includes(code));
  const extras = journeys.filter(code => !ordered.includes(code)).sort();
  const options = [...ordered, ...extras];

  select.innerHTML = '<option value="">Mixed Room · All Journeys</option>';
  options.forEach(code => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = journeyDisplay(code);
    select.appendChild(option);
  });
  select.value = options.includes(preferred) ? preferred : "";
}

function isBuilderFlow() {
  const params = new URLSearchParams(window.location.search);
  return params.get("flow") === "builder";
}

function returnTarget() {
  return new URLSearchParams(window.location.search).get("return") || "";
}

function requestedSessionId() {
  return String(new URLSearchParams(window.location.search).get("session") || "").trim();
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
  const sessionId = requestedSessionId();
  const sessionPart = sessionId ? `&session=${encodeURIComponent(sessionId)}` : "";
  link.href = `/coaches/execution/session-builder/?practiceId=${encodeURIComponent(practiceId)}${sessionPart}`;
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
  let discipline = String(practice.discipline || "").trim().toLowerCase();
  let journey = String(practice.journey || "").trim();

  if ((!discipline || !journey) && practiceId === rememberedPracticeId()) {
    try {
      const builder = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
      discipline = discipline || String(builder.discipline || "").trim().toLowerCase();
      journey = journey || String(builder.journey || "").trim();
    } catch {}
  }

  if (!discipline) {
    throw new Error("The active practice has no discipline state.");
  }

  activePractice = {
    ...practice,
    discipline,
    journey
  };
  sessionId = practiceId;
  sessionRef = doc(db, "attendance_sessions", practiceId);
  if ($("practiceIdentity")) {
    $("practiceIdentity").value = [
      matLabel(),
      journeyDisplay(activePractice.journey),
      disciplineDisplay(activePractice.discipline)
    ].filter(Boolean).join(" · ");
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
        const practiceLocationId = String(activePractice?.locationId || activePractice?.academyId || "").trim();
        const athleteLocationId = String(athlete.locationId || "").trim();
        return status === "current" && Boolean(practiceLocationId) && athleteLocationId === practiceLocationId;
      })
      .sort((a, b) => athleteName(a).localeCompare(athleteName(b)));

    console.log("[session] athletes loaded:", athletes.length, athletes);

    populateJourneyRosterFilter();
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
  const journeyFilter = normalizeJourneyCode($("journeyRosterFilter")?.value || "");

  filteredAthletes = athletes.filter((athlete) => {
    if (!programMatchesAthlete(athlete)) return false;
    if (checkedIn.has(athlete.id)) return false;
    if (journeyFilter && rosterJourneyForAthlete(athlete) !== journeyFilter) return false;

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
    list.innerHTML = checkedIn.size
      ? `<p class="muted">All matching athletes are checked in.</p>`
      : `<p class="muted">No athletes found.</p>`;
    return;
  }

  list.innerHTML = filteredAthletes.map((athlete) => {
    return `
      <button
        type="button"
        class="athlete-checkin-card"
        data-athlete-id="${athlete.id}"
      >
        <span class="athlete-main">${attendanceIdentityMarkup(athlete)}</span>
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
    setStatus("Attendance is already submitted. Review the existing check-ins.", true);
    const existing = await getDoc(doc(db, "attendance_sessions", activePractice.practiceId));
    if (existing.exists()) {
      checkedIn = new Map((Array.isArray(existing.data()?.checkedIn) ? existing.data().checkedIn : [])
        .map(athlete => [athlete.id || athlete.uid, athlete]));
      renderAthletes();
      renderCheckedIn();
    }
    showStep(2);
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
  try {
    const response = await updateCheckIn({ practiceId: activePractice.practiceId, action: "add", athleteId: id });
    const attendance = response.data?.attendance || {};
    checkedIn = new Map((Array.isArray(attendance.checkedIn) ? attendance.checkedIn : [])
      .map((item) => [item.id || item.uid, item]));

    setStatus(`${payload.name} checked in.`);
    applyFilters();
    renderCheckedIn();
  } catch (error) {
    console.error("[session] athlete check-in failed", error);
    const message = String(error?.message || "Athlete check-in failed.");
    setStatus(message.includes("outside the practice location")
      ? "That athlete is not assigned to this practice location."
      : message, true);
  }
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
      <span class="attendance-present-card">${attendanceIdentityMarkup(athlete)}<span class="attendance-present-label">Present</span></span>

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

      applyFilters();
      renderCheckedIn();
    });
  });
}
function ladderForJourney(journey = activePractice?.journey) {
  return LADDER_BY_JOURNEY[String(journey || "").toUpperCase()] || [];
}

function ladderForPractice() {
  return ladderForJourney(activePractice?.journey);
}

function tierFromLadderKey(key = "") {
  return String(key || "").replace(/^R/i, "T");
}

function normalizeAthleteTier(athlete = {}, ladder = ladderForPractice()) {
  const direct = String(
    athlete.progressionTier ||
    athlete.tier ||
    athlete.tierCode ||
    ""
  ).trim().toUpperCase();

  if (/^T[0-4]$/.test(direct)) return direct;
  if (/^R[0-4]$/.test(direct)) return tierFromLadderKey(direct);

  const rank = String(athlete.rankName || athlete.rank || "").trim().toLowerCase();
  if (!rank) return "";

  const match = ladder.find((item) => String(item?.name || "").trim().toLowerCase() === rank);
  return match ? tierFromLadderKey(match.key) : "";
}

function athleteAgeGroup(athlete = {}) {
  const age = Number(athlete.age);
  if (Number.isFinite(age)) {
    if (age >= 14) return "Teen";
    if (age >= 11) return "Youth 11–13";
    return "Youth 7–10";
  }

  const explicit = String(
    athlete.ageGroup ||
    athlete.ageBand ||
    athlete.divisionAge ||
    ""
  ).trim();
  if (explicit) return explicit;

  const profileType = String(athlete.profileType || "").trim().toLowerCase();
  if (profileType === "mini") return "Youth 7–10";
  if (profileType === "youth" || profileType === "kid") return "Youth";
  if (profileType === "teen") return "Teen";
  if (profileType === "adult") return "Adult";

  const id = String(athlete.id || athlete.uid || "").toUpperCase();
  if (id.startsWith("F4_")) return "Teen";
  if (id.startsWith("F8_")) return "Youth";
  return "Athletes";
}

function displayTrainingAgeGroup(value = "") {
  const label = String(value || "").trim();
  if (/^Youth(?:\s+\d+\s*[–-]\s*\d+)?$/i.test(label)) return "Youth";
  if (/^Teen(?:\s*14\s*\+)?$/i.test(label)) return "Teen";
  return label;
}

function normalizeJourneyCode(value = "") {
  const key = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["z2h", "zero2hero", "road2champion"].includes(key)) return "Z2H";
  if (["p2l", "path2legend"].includes(key)) return "P2L";
  if (["q2m", "quest2mastery"].includes(key)) return "Q2M";
  return "";
}

function journeyForAthlete(athlete = {}) {
  const direct = normalizeJourneyCode(
    athlete.journey ||
    athlete.programTrack ||
    athlete.track ||
    athlete.program ||
    ""
  );
  if (direct) return direct;

  const id = String(athlete.id || athlete.uid || "").toUpperCase();
  if (id.startsWith("F4_")) return "P2L";
  if (id.startsWith("F8_")) return "Z2H";

  const ageGroup = athleteAgeGroup(athlete);
  if (/teen/i.test(ageGroup)) return "P2L";
  return normalizeJourneyCode(activePractice?.journey) || "Z2H";
}

function journeyOptions(selected = "") {
  const normalized = normalizeJourneyCode(selected) || "Z2H";
  return [
    ["Z2H", "Road2Champion"],
    ["P2L", "Path2Legend"],
    ["Q2M", "Quest2Mastery"]
  ].map(([value, label]) =>
    `<option value="${value}"${value === normalized ? " selected" : ""}>${label}</option>`
  ).join("");
}

function checkedInAthletes() {
  return Array.from(checkedIn.values()).map((checked) => {
    const id = String(checked?.id || checked?.uid || "");
    return athletes.find((athlete) => String(athlete.id || athlete.uid || "") === id) || checked;
  });
}

function rankForTier(tier = "", journey = activePractice?.journey) {
  const ladder = ladderForJourney(normalizeJourneyCode(journey) || journey);
  return ladder.find((item) => tierFromLadderKey(item.key) === tier)?.name || "";
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

function currentPlanningMode() {
  const direct = String(activePractice?.executionMode || "").trim().toLowerCase();
  if (direct) return direct;
  try {
    const remembered = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
    if (String(remembered.practiceId || "") === String(activePractice?.practiceId || "")) {
      return String(remembered.executionMode || "").trim().toLowerCase();
    }
  } catch {}
  return "manual";
}

function suggestedTrainingGroups() {
  const present = checkedInAthletes();
  const buckets = new Map();
  const roster = present.map((athlete) => {
    const ageGroup = athleteAgeGroup(athlete);
    const journey = journeyForAthlete(athlete);
    const discipline = disciplineForAthlete(athlete) || String(activePractice?.discipline || "").toLowerCase();
    const athleteLadder = ladderForJourney(journey);
    const tier = normalizeAthleteTier(athlete, athleteLadder);
    return {
      athleteId: String(athlete.id || athlete.uid || ""),
      athleteName: athleteName(athlete),
      tier,
      tierProvenance: athlete.syntheticPlacement === true ? "synthetic-display-placement" : "athlete-tier-display",
      syntheticPlacement: athlete.syntheticPlacement === true,
      syntheticPlacementCertified: athlete.syntheticPlacementCertified === true,
      syntheticPlacementSource: String(athlete.syntheticPlacementSource || ""),
      journey,
      discipline,
      ageGroup,
      locationId: String(activePractice?.locationId || activePractice?.academyId || ""),
      practiceId: String(activePractice?.practiceId || "")
    };
  });

  if (currentPlanningMode() === "hybrid") {
    const suggested = suggestTierAwareTrainingGroups(roster, { maxGroups: MAX_TRAINING_GROUPS });
    const prior = previousRouteContext();
    return restoreCoachGroupOverrides(suggested, prior.trainingGroups).map((group, index) => ({
      ...group,
      id: `group-${index + 1}`,
      label: `Mat 1 · Group ${String.fromCharCode(65 + index)}`,
      tier: group.instructionalTier || "",
      rank: rankForTier(group.instructionalTier || "", group.journey),
      trainingSession: String(group.trainingSession || prior.week || activePractice?.week || "1"),
      carryForwardNote: String(group.carryForwardNote || "")
    }));
  }

  roster.forEach((athlete) => {
    const { ageGroup, journey, discipline, tier } = athlete;
    const key = `${discipline}|${journey}|${ageGroup}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        ageGroup,
        journey,
        discipline,
        tier,
        rank: tier ? rankForTier(tier, journey) : "",
        athleteIds: [],
        athleteNames: []
      });
    }

    const group = buckets.get(key);
    group.athleteIds.push(athlete.athleteId);
    group.athleteNames.push(athlete.athleteName);
  });

  let groups = [...buckets.values()]
    .sort((a, b) => {
      const aTeen = a.journey === "P2L" || /teen|adult/i.test(a.ageGroup) ? 1 : 0;
      const bTeen = b.journey === "P2L" || /teen|adult/i.test(b.ageGroup) ? 1 : 0;
      if (aTeen !== bTeen) return aTeen - bTeen;
      if (a.discipline !== b.discipline) return String(a.discipline).localeCompare(String(b.discipline));
      if (a.journey !== b.journey) return String(a.journey).localeCompare(String(b.journey));
      return String(a.tier).localeCompare(String(b.tier));
    });


  if (!groups.length) {
    groups = [{
      ageGroup: "Athletes",
      journey: normalizeJourneyCode(activePractice?.journey) || "Z2H",
      discipline: String(activePractice?.discipline || "unassigned").toLowerCase(),
      tier: "",
      rank: "",
      athleteIds: [],
      athleteNames: []
    }];
  }

  const prior = previousRouteContext();
  return groups.map((group, index) => ({
    ...group,
    id: `group-${index + 1}`,
    label: `Mat 1 · Group ${String.fromCharCode(65 + index)}`,
    trainingSession: String(
      group.trainingSession ||
      prior.trainingGroups?.[index]?.trainingSession ||
      prior.week ||
      activePractice?.week ||
      "1"
    ),
    carryForwardNote: String(prior.trainingGroups?.[index]?.carryForwardNote || "")
  }));
}

function tierOptions(selected = "", journey = activePractice?.journey) {
  const blank = '<option value=""' + (!selected ? ' selected' : '') + '>Select Coach instructional focus</option>';
  const options = ladderForJourney(normalizeJourneyCode(journey) || journey).map((rank) => {
    const tier = tierFromLadderKey(rank.key);
    return `<option value="${tier}"${tier === selected ? " selected" : ""}>${tier} — ${rank.name}</option>`;
  }).join("");
  return blank + options;
}

function renderTrainingGroups(groups = suggestedTrainingGroups()) {
  const container = $("trainingGroups");
  if (!container) return;
  const hybridPlanning = currentPlanningMode() === "hybrid";
  groups = groups.map((group, index) => normalizeTrainingGroup({
    ...group,
    instructionalTier: group.instructionalTier || group.tier || "",
    instructionalFocusConfirmed: hybridPlanning
      ? group.instructionalFocusConfirmed === true
      : Boolean(group.instructionalTier || group.tier),
    id: `group-${index + 1}`,
    label: `Mat 1 · Group ${String.fromCharCode(65 + index)}`
  }));
  if (groups.length <= NORMAL_TRAINING_GROUP_CAPACITY) fourGroupExceptionAcknowledged = false;

  container.innerHTML = groups.map((group, index) => `
    <section
      class="training-group-card"
      data-training-group="${index}"
      data-athlete-ids="${encodeURIComponent(JSON.stringify(group.athleteIds || []))}"
      data-athlete-names="${encodeURIComponent(JSON.stringify(group.athleteNames || []))}"
      data-roster="${encodeURIComponent(JSON.stringify(group.roster || []))}"
      data-discipline="${group.discipline || ""}"
      data-location-id="${group.locationId || ""}"
      data-practice-id="${group.practiceId || ""}"
      data-focus-confirmed="${group.instructionalFocusConfirmed === true}"
    >
      <div class="training-group-head">
        <div>
          <span class="training-group-kicker">Mat 1 · Group ${String.fromCharCode(65 + index)}</span>
          ${group.athleteNames.length ? `<ul class="training-group-name-list">${group.athleteNames.map(name => `<li>${escapeAttendance(name)}</li>`).join("")}</ul>` : `<p class="training-group-empty-roster">Coach assigned</p>`}
          ${group.instructionalRecommendation ? `<small>${group.instructionalRecommendation}</small>` : ""}
        </div>
        ${index > 0 ? '<button type="button" class="remove-training-group" aria-label="Remove training group">Remove</button>' : ""}
      </div>

      <details class="training-group-editor">
        <summary>Edit Group ${String.fromCharCode(65 + index)} assignments and instruction</summary>
        <div class="training-group-editor-body">

      <div class="training-group-roster">
        ${(group.roster || []).map((athlete) => `
          <div class="training-group-athlete">
            <span><strong>${athlete.athleteName}</strong><small>${athlete.tier || "Tier display unavailable"}${athlete.syntheticPlacement ? " · Synthetic placement" : ""}</small></span>
            <label>Assign to
              <select class="training-athlete-group" data-athlete-id="${athlete.athleteId}">
                ${groups.map((candidate, candidateIndex) => `<option value="${candidate.id}"${candidate.id === group.id ? " selected" : ""}${athleteCanJoinTrainingGroup(athlete, candidate) ? "" : " disabled"}>Group ${String.fromCharCode(65 + candidateIndex)}</option>`).join("")}
              </select>
            </label>
          </div>`).join("") || '<p class="muted">Empty group. Move a compatible athlete here or remove it.</p>'}
      </div>

      <div class="training-group-grid">
        <label>
          Age Group
          <input class="training-age-group" type="text" value="${displayTrainingAgeGroup(group.ageGroup)}" placeholder="Youth">
        </label>

        <label>
          Journey
          <select class="training-journey">
            ${journeyOptions(group.journey)}
          </select>
        </label>

        <label>
          Instructional Focus
          <select class="training-tier">
            ${tierOptions(group.tier, group.journey)}
          </select>
        </label>

        <label>
          Rank
          <input class="training-rank" type="text" value="${group.rank || rankForTier(group.tier, group.journey)}" readonly>
        </label>

        <label>
          Training Session
          <select class="training-session">
            ${Array.from({length:36},(_,i)=>`<option value="${i+1}"${String(i+1)===String(group.trainingSession)?" selected":""}>Session ${i+1}</option>`).join("")}
          </select>
        </label>
      </div>

      <label class="training-carry-forward">
        Carry Forward Note
        <textarea class="training-note" placeholder="What needs another touch next time?">${group.carryForwardNote || ""}</textarea>
      </label>
        </div>
      </details>
    </section>
  `).join("");

  container.querySelectorAll(".training-athlete-group").forEach((select) => {
    select.addEventListener("change", () => {
      const moved = moveAthleteBetweenGroups(captureTrainingGroups(), select.dataset.athleteId, select.value);
      renderTrainingGroups(moved);
    });
  });

  container.querySelectorAll(".training-journey").forEach((select) => {
    select.addEventListener("change", () => {
      const card = select.closest(".training-group-card");
      const tier = card?.querySelector(".training-tier");
      const rank = card?.querySelector(".training-rank");
      if (!tier) return;
      const previousTier = tier.value || "T0";
      tier.innerHTML = tierOptions(previousTier, select.value);
      tier.value = "";
      if (card) card.dataset.focusConfirmed = "false";
      if (rank) rank.value = rankForTier(tier.value, select.value);
      updateContextSummary();
      showHybridStage();
    });
  });

  container.querySelectorAll(".training-tier").forEach((select) => {
    select.addEventListener("change", () => {
      const card = select.closest(".training-group-card");
      card?.classList.remove("has-validation-error");
      select.removeAttribute("aria-invalid");
      setPracticeContextStatus("");
      const journey = card?.querySelector(".training-journey")?.value || activePractice?.journey;
      const rank = card?.querySelector(".training-rank");
      if (rank) rank.value = rankForTier(select.value, journey);
      if (card) card.dataset.focusConfirmed = String(Boolean(select.value));
      updateContextSummary();
      showHybridStage();
    });
  });

  container.querySelectorAll(".training-age-group, .training-session, .training-note").forEach((input) => {
    input.addEventListener("input", updateContextSummary);
    input.addEventListener("change", updateContextSummary);
  });

  container.querySelectorAll(".remove-training-group").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".training-group-card");
      const ids = card?.dataset.athleteIds || "%5B%5D";
      let assigned = [];
      try { assigned = JSON.parse(decodeURIComponent(ids)); } catch {}
      if (assigned.length) {
        setStatus("This group contains checked-in athletes. Keep it or reassign its athletes before removing it.", true);
        return;
      }
      card?.remove();
      renumberTrainingGroups();
      updateGroupControls();
      updateContextSummary();
    });
  });

  updateGroupControls();
  updateContextSummary();
  showHybridStage();
}

function renumberTrainingGroups() {
  document.querySelectorAll(".training-group-card").forEach((card, index) => {
    card.dataset.trainingGroup = String(index);
    const kicker = card.querySelector(".training-group-kicker");
    if (kicker) kicker.textContent = `Mat 1 · Group ${String.fromCharCode(65 + index)}`;
  });
}

function updateGroupControls() {
  const count = document.querySelectorAll(".training-group-card").length;
  if ($("addTrainingGroupBtn")) $("addTrainingGroupBtn").disabled = count >= MAX_TRAINING_GROUPS;
  if ($("trainingGroupHint")) {
    $("trainingGroupHint").textContent =
      count < NORMAL_TRAINING_GROUP_CAPACITY
        ? `${count} groups in use · Group ${String.fromCharCode(65 + count)} can be added (normal limit ${NORMAL_TRAINING_GROUP_CAPACITY}; Group D by exception).`
        : count === NORMAL_TRAINING_GROUP_CAPACITY
          ? "Three normal groups in use. Add Group D only when compatibility or instructional separation requires it."
          : "Exceptional four-group plan. Two separate classes are recommended for optimal instruction.";
  }
  const warning = $("fourGroupWarning");
  const acknowledgement = $("fourGroupAcknowledgement");
  if (warning) warning.hidden = count <= NORMAL_TRAINING_GROUP_CAPACITY;
  if (acknowledgement) {
    if (count > NORMAL_TRAINING_GROUP_CAPACITY) {
      // Preserve a Coach's currently checked decision across UI refreshes.
      fourGroupExceptionAcknowledged ||= acknowledgement.checked === true;
      acknowledgement.checked = fourGroupExceptionAcknowledged;
    } else {
      fourGroupExceptionAcknowledged = false;
      acknowledgement.checked = false;
    }
  }
}

function addTrainingGroup() {
  const current = captureTrainingGroups();
  if (current.length >= MAX_TRAINING_GROUPS) return;
  const previous = current[current.length - 1] || {};
  const journey = previous.journey || (/teen/i.test(previous.ageGroup || "") ? "P2L" : "Z2H");
  current.push({
    ageGroup: previous.ageGroup || "Teen",
    journey,
    discipline: previous.discipline || String(activePractice?.discipline || "unassigned").toLowerCase(),
    locationId: previous.locationId || String(activePractice?.locationId || activePractice?.academyId || ""),
    practiceId: previous.practiceId || String(activePractice?.practiceId || ""),
    tier: previous.tier || "",
    rank: previous.tier ? rankForTier(previous.tier, journey) : "",
    trainingSession: previous.trainingSession || "1",
    carryForwardNote: "",
    athleteIds: [],
    athleteNames: [],
    roster: []
  });
  renderTrainingGroups(current);
}

function captureTrainingGroups() {
  return [...document.querySelectorAll(".training-group-card")].map((card, index) => {
    const journey = String(card.querySelector(".training-journey")?.value || normalizeJourneyCode(activePractice?.journey) || "Z2H").trim();
    const tier = String(card.querySelector(".training-tier")?.value || "").trim();
    let roster = [];
    try { roster = JSON.parse(decodeURIComponent(card.dataset.roster || "%5B%5D")); } catch {}
    return {
      id: `group-${index + 1}`,
      label: `Group ${String.fromCharCode(65 + index)}`,
      ageGroup: String(card.querySelector(".training-age-group")?.value || "").trim(),
      journey,
      discipline: String(card.dataset.discipline || "").trim().toLowerCase(),
      locationId: String(card.dataset.locationId || "").trim(),
      practiceId: String(card.dataset.practiceId || "").trim(),
      tier,
      instructionalTier: tier,
      instructionalFocusConfirmed: card.dataset.focusConfirmed === "true" && Boolean(tier),
      rank: rankForTier(tier, journey),
      trainingSession: String(card.querySelector(".training-session")?.value || "1").trim(),
      carryForwardNote: String(card.querySelector(".training-note")?.value || "").trim(),
      athleteIds: (() => {
        try { return JSON.parse(decodeURIComponent(card.dataset.athleteIds || "%5B%5D")); }
        catch { return []; }
      })(),
      athleteNames: (() => {
        try { return JSON.parse(decodeURIComponent(card.dataset.athleteNames || "%5B%5D")); }
        catch { return []; }
      })(),
      roster
    };
  });
}

function updateCompositionBanners(groups = captureTrainingGroups()) {
  const attendance = $("attendanceCompositionBanner");
  const progress = $("progressCompositionBanner");
  const presentCount = checkedIn.size;
  const activeGroups = groups.filter((group) => (group.athleteIds || []).length);

  if (attendance) {
    attendance.textContent = presentCount
      ? `${presentCount} athlete${presentCount === 1 ? "" : "s"} present · ${activeGroups.length || groups.length} training group${(activeGroups.length || groups.length) === 1 ? "" : "s"}`
      : "Waiting for attendance.";
  }

  if (progress) {
    progress.replaceChildren();
    if (!groups.length) {
      progress.textContent = "Groups will be generated from the athletes who are here.";
    } else {
      const list = document.createElement("div");
      list.className = "attendance-group-overview";
      for (const group of groups) {
        const item = document.createElement("div");
        item.className = "attendance-group-overview-item";
        const name = document.createElement("strong");
        name.textContent = group.label.replace("Mat 1 · ", "");
        const details = document.createElement("span");
        const count = (group.athleteIds || []).length;
        const focus = group.tier ? `Focus ${group.tier}` : "Focus not confirmed";
        details.textContent = `${journeyDisplay(group.journey)} · ${disciplineDisplay(group.discipline)} · ${count} athlete${count === 1 ? "" : "s"} · ${focus}`;
        item.append(name, details);
        list.append(item);
      }
      progress.append(list);
    }
  }
}

function updateContextSummary() {
  const groups = captureTrainingGroups();
  const host = $("contextSummary");
  if (host) {
    host.replaceChildren();
    if (!groups.length) {
      host.textContent = "Waiting for attendance.";
    } else {
      const list = document.createElement("div");
      list.className = "attendance-context-overview";
      for (const group of groups) {
        const item = document.createElement("div");
        item.className = "attendance-context-overview-item";
        const label = document.createElement("strong");
        label.textContent = group.label.replace("Mat 1 · ", "");
        const detail = document.createElement("span");
        detail.textContent = `${journeyDisplay(group.journey)} · ${displayTrainingAgeGroup(group.ageGroup) || "Athletes"} · ${group.tier ? `Focus ${group.tier}` : "Focus not confirmed"} · Session ${group.trainingSession}`;
        item.append(label, detail);
        list.append(item);
      }
      host.append(list);
    }
  }
  updateCompositionBanners(groups);
}

function preparePracticeContext() {
  if (!activePractice?.practiceId || !checkedIn.size) {
    setStatus("Load the practice and check in an athlete before Practice Groups.", true);
    showStep(2);
    return;
  }

  let groups;
  try {
    groups = suggestedTrainingGroups();
  } catch (error) {
    console.error("[attendance] Practice Groups suggestion failed", error);
    showStep(4);
    setPracticeContextStatus(error?.message || "Could not prepare Practice Groups. Please retry.");
    return;
  }
  const prior = previousRouteContext();
  fourGroupExceptionAcknowledged = groups.length > NORMAL_TRAINING_GROUP_CAPACITY
    && prior.fourGroupExceptionAcknowledged === true;
  hybridStageState.planningSources = { tierWaves: false, systemSuggestions: false, coachInput: false };
  hybridStageState.planningSourcesExplicitlySelected = false;
  hybridStageState.groupPlanning = {};
  // Group Journeys and instructional focus are planning attributes. They must
  // never rewrite the server-authoritative route of the canonical practice.
  try {
    const remembered = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
    if (String(remembered.practiceId || "") === String(activePractice.practiceId || "")) {
      hybridStageState.planningSources = remembered.planningSourcesExplicitlySelected === true ? (remembered.planningSources || {}) : {
        tierWaves: false,
        systemSuggestions: false,
        coachInput: false
      };
      hybridStageState.planningSourcesExplicitlySelected = remembered.planningSourcesExplicitlySelected === true;
      hybridStageState.groupPlanning = remembered.groupPlanning || {};
    }
  } catch {}

  // Establish the next screen before rendering optional group planning. If a
  // HYBRID suggestion renderer fails, Coach must not be trapped on Step 2.
  showStep(4);
  try {
    renderTrainingGroups(groups);
  } catch (error) {
    console.error("[attendance] Practice Groups rendering failed", error);
    setPracticeContextStatus(error?.message || "Could not display Practice Groups. Please retry.");
  }
}

async function savePracticeContextToBuilderSession() {
  let session = {};
  try {
    session = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
  } catch {}

  const trainingGroups = captureTrainingGroups();
  if (isHybridPractice() && !Object.keys(hybridStageState.planningSources).length) {
    const remembered = session.practiceId === activePractice?.practiceId ? session : {};
    hybridStageState.planningSources = remembered.planningSourcesExplicitlySelected === true ? (remembered.planningSources || {}) : {
      tierWaves: false,
      systemSuggestions: false,
      coachInput: false
    };
    hybridStageState.planningSourcesExplicitlySelected = remembered.planningSourcesExplicitlySelected === true;
    hybridStageState.groupPlanning = remembered.groupPlanning || {};
  }
  const rosterIds = new Set(checkedInAthletes().map(a => String(a.id || a.uid || "")).filter(Boolean));
  const assignedIds = trainingGroups.flatMap(g => g.athleteIds || []).map(String);
  if (assignedIds.length !== new Set(assignedIds).size ||
      assignedIds.some(id => !rosterIds.has(id)) ||
      rosterIds.size !== new Set(assignedIds).size) {
    throw new Error("Training group assignments do not match checked-in athletes. Review the grouping before continuing.");
  }
  const groupCheck = validateTrainingGroupRoster(trainingGroups, [...rosterIds], {
    requireFocus: false,
    fourGroupAcknowledged: fourGroupExceptionAcknowledged
  });
  if (!groupCheck.ok) {
    if (groupCheck.fourGroupAcknowledgementRequired && !fourGroupExceptionAcknowledged) {
      throw new Error("Acknowledge the two-class recommendation before continuing with four groups.");
    }
    if (currentPlanningMode() === "hybrid") {
      if (groupCheck.incompatibleAssignments.length) {
        throw new Error("Athletes may move only between groups with the same Journey, discipline, age group, location, and practice.");
      }
      if (groupCheck.unresolvedFocusGroupIds.length) {
        throw new Error("Confirm an instructional focus for every HYBRID training group before continuing.");
      }
      throw new Error("Review the HYBRID training groups before continuing.");
    }
    throw new Error("Review the training groups before continuing.");
  }
  const primary = trainingGroups[0] || {
    journey: normalizeJourneyCode(activePractice?.journey) || "Z2H",
    tier: "T0",
    rank: rankForTier("T0", normalizeJourneyCode(activePractice?.journey) || "Z2H"),
    trainingSession: "1",
    carryForwardNote: ""
  };

  const tier = primary.tier;
  const week = primary.trainingSession;
  const rankLabel = primary.rank;

  const updated = {
    ...session,
    journey: activePractice?.journey || primary.journey || session.journey || "",
    discipline: activePractice?.discipline && activePractice.discipline !== "unassigned"
      ? activePractice.discipline
      : (primary.discipline || session.discipline || "unassigned"),
    tier,
    rank: tier,
    rankLabel,
    week,
    trainingSession: week,
    trainingGroups,
    fourGroupExceptionAcknowledged,
    ...(isHybridPractice() ? {
      planningSources: hybridStageState.planningSources,
      planningSourcesExplicitlySelected: hybridStageState.planningSourcesExplicitlySelected === true,
      groupPlanning: Object.fromEntries(trainingGroups.map(group => {
        const priorPlanning = hybridStageState.groupPlanning[group.id] || {};
        return [group.id, {
          ...priorPlanning,
          selectedWave: String(priorPlanning.instructionalTier || "").toLowerCase() === String(group.tier || "").toLowerCase()
            ? String(priorPlanning.selectedWave || "")
            : "",
          instructionalTier: String(group.tier || "").toLowerCase()
        }];
      }))
    } : {}),
    carryForwardNote: primary.carryForwardNote,
    practiceId: activePractice?.practiceId || session.practiceId || ""
  };

  localStorage.setItem("sandman_session_builder_v1", JSON.stringify(updated));
  localStorage.setItem("sandman_tier", tier);
  localStorage.setItem("sandman_rank", tier);
  localStorage.setItem("sandman_rank_label", rankLabel);
  localStorage.setItem("sandman_week", week);
  localStorage.setItem("sandman_training_groups_v1", JSON.stringify(trainingGroups));
  localStorage.setItem("sandman_previous_route_context_v1", JSON.stringify({
    journey: activePractice?.journey || "",
    discipline: activePractice?.discipline || "",
    tier,
    week,
    trainingGroups,
    fourGroupExceptionAcknowledged
  }));

  // Check-In continues the existing canonical practice. It must not call
  // openPracticeSession or rewrite Journey, discipline, XP, rank, or progress.
}

function todayLabel() {
  const dateKey = String(activePractice?.sessionDateKey || "").trim();
  const date = dateKey ? new Date(`${dateKey}T12:00:00`) : new Date();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
let attendanceSubmissionPending = false;

async function authoritativeAttendanceStatus() {
  const snap = await getDoc(doc(db, "attendance_sessions", activePractice.practiceId));
  return snap.exists() ? String(snap.data()?.status || "") : "";
}

async function submitForReview() {
  // Treat the checked Coach acknowledgment as authoritative at submission.
  // Rerendering group controls must not invalidate an explicit selection.
  if (isBuilderFlow() && document.querySelectorAll(".training-group-card").length > NORMAL_TRAINING_GROUP_CAPACITY) {
    fourGroupExceptionAcknowledged = $("fourGroupAcknowledgement")?.checked === true;
  }
  if (attendanceSubmissionPending) {
    setStatus("Attendance submission is already in progress.");
    return;
  }
  if (!sessionRef || !sessionId) {
    setStatus("Start a session first.", true);
    return;
  }

  if (!checkedIn.size) {
    setStatus("No athletes checked in.", true);
    return;
  }

  if (isBuilderFlow()) {
    clearPracticeContextValidation();
    const rosterIds = new Set(checkedInAthletes().map(a => String(a.id || a.uid || "")).filter(Boolean));
    const rosterCheck = validateTrainingGroupRoster(captureTrainingGroups(), [...rosterIds], {
      requireFocus: false,
      fourGroupAcknowledged: fourGroupExceptionAcknowledged
    });
    if (!rosterCheck.ok) {
      let message = "Training groups must account for every checked-in athlete exactly once.";
      if (rosterCheck.fourGroupAcknowledgementRequired && !fourGroupExceptionAcknowledged) {
        message = "Acknowledge the two-class recommendation before continuing with Group D.";
      } else if (rosterCheck.incompatibleAssignments.length) {
        message = "Athletes may only move between groups with matching Journey, discipline, age group, practice location, and practice.";
      } else if (rosterCheck.unresolvedFocusGroupIds.length) {
        const labels = revealUnconfirmedFocusGroups(rosterCheck.unresolvedFocusGroupIds);
        message = `${labels.join(" and ") || "A mixed or unverified group"}: confirm an instructional focus before continuing.`;
      }
      setStatus(message, true);
      return;
    }
  }
  if (isBuilderFlow()) {
    try {
      await savePracticeContextToBuilderSession();
    } catch (error) {
      setStatus(error?.message || "Could not preserve training groups.", true);
      return;
    }
  }
  attendanceSubmissionPending = true;
  try {
    const status = await authoritativeAttendanceStatus();
    if (status === "finalized") {
      sessionLocked = true;
      setStatus("Attendance is finalized. Return to Practice Operations; it cannot be submitted again.", true);
      return;
    }
    if (status !== "pending_review") {
      const updateCheckIn = httpsCallable(functions, "updatePracticeCheckIn");
      try {
        await updateCheckIn({ practiceId: activePractice.practiceId, action: "submit" });
      } catch (error) {
        const latestStatus = await authoritativeAttendanceStatus();
        if (latestStatus !== "pending_review") throw error;
      }
    }
  } catch (error) {
    setStatus(error?.message || "Could not verify attendance submission. Try again.", true);
    return;
  } finally {
    attendanceSubmissionPending = false;
  }

  sessionLocked = true;

  setStatus(
  `Submitted ${checkedIn.size} athlete(s) for coach review • ${todayLabel()}`
);

  renderAthletes();
  renderCheckedIn();

  if (isBuilderFlow() && returnTarget() === "historical") {
    window.location.href = `/coaches/logs/practice-log.html?practiceId=${encodeURIComponent(activePractice.practiceId)}&historical=1`;
  } else if (isBuilderFlow() && returnTarget() === "clipboard") {
    let sessionId = requestedSessionId();
    if (!sessionId) {
      try {
        sessionId = String(JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}")?.sessionId || "");
      } catch {}
    }
    let executionMode = String(activePractice?.executionMode || "").toLowerCase();
    try {
      if (!executionMode) executionMode = String(JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}")?.executionMode || "manual").toLowerCase();
    } catch {}
    window.location.href = executionMode === "hybrid"
      ? `/coaches/execution/session-builder/?practiceId=${encodeURIComponent(activePractice.practiceId)}&planning=1`
      : `/coaches/execution/clipboard-2.0/?session=${encodeURIComponent(sessionId)}&practiceId=${encodeURIComponent(activePractice.practiceId)}`;
  } else if (isBuilderFlow() && returnTarget() === "clock") {
    let sessionId = requestedSessionId();
    if (!sessionId) {
      try {
        sessionId = String(JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}")?.sessionId || "");
      } catch {}
    }
    window.location.href = `/coaches/execution/big-clock-2.0/?practiceId=${encodeURIComponent(activePractice.practiceId)}&session=${encodeURIComponent(sessionId)}&fast=1`;
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
  $("addTrainingGroupBtn")?.addEventListener("click", addTrainingGroup);
  $("fourGroupAcknowledgement")?.addEventListener("change", (event) => {
    fourGroupExceptionAcknowledged = event.target.checked === true;
    updateGroupControls();
  });

  $("searchAthlete")?.addEventListener("input", applyFilters);
  $("journeyRosterFilter")?.addEventListener("change", applyFilters);

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
}

bindEvents();
configureBuilderReturn();

if (isBuilderFlow()) {
  const label = $("attendanceFlowLabel");
  const title = $("attendanceTitle");
  const lead = $("attendanceLead");
  if (label) label.textContent = "Attendance";
  if (title) title.textContent = "Athlete Check-In";
  if (lead) lead.textContent = "Find your name, check in, review attendance, then confirm today’s practice groups and skills.";


  document.querySelector('[data-step-screen="2"] .eyebrow')?.replaceChildren("Step 1 of 3");
  document.querySelector('[data-step-screen="3"] .eyebrow')?.replaceChildren("Step 2 of 3");
  document.querySelector('[data-step-screen="4"] .eyebrow')?.replaceChildren("Step 3 of 3");

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
  // Session Builder has already established the canonical practice.
  // Direct Attendance links go straight to athlete check-in as well.
  loadAthletes()
    .then(() => activePractice && startSession())
    .catch(error => {
      console.error("[session] attendance startup failed", error);
      setStatus(error?.message || "Could not open attendance.", true);
    });
}

// Step 1 is redundant: the practice was selected before Attendance.
document.querySelector('[data-step-target="1"]')?.setAttribute("hidden", "");
document.querySelector('[data-step-screen="1"]')?.setAttribute("hidden", "");
