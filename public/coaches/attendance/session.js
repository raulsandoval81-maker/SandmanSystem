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
  const lower = rank.toLowerCase();
  const color = /shadow|apprentice|white/.test(lower) ? "white" : /prospect|yellow/.test(lower) ? "yellow" : /competitor|orange/.test(lower) ? "orange" : /contender|green/.test(lower) ? "green" : /champion|legend|hero|black/.test(lower) ? "black" : "neutral";
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
  const response = await updateCheckIn({ practiceId: activePractice.practiceId, action: "add", athleteId: id });
  const attendance = response.data?.attendance || {};
  checkedIn = new Map((Array.isArray(attendance.checkedIn) ? attendance.checkedIn : [])
    .map((item) => [item.id || item.uid, item]));

  setStatus(`${payload.name} checked in.`);
  applyFilters();
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
  if (!rank) return "T0";

  const match = ladder.find((item) => String(item?.name || "").trim().toLowerCase() === rank);
  return match ? tierFromLadderKey(match.key) : "T0";
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

function suggestedTrainingGroups() {
  const present = checkedInAthletes();
  const ladder = ladderForPractice();
  const buckets = new Map();

  present.forEach((athlete) => {
    const ageGroup = athleteAgeGroup(athlete);
    const journey = journeyForAthlete(athlete);
    const athleteLadder = ladderForJourney(journey);
    const tier = normalizeAthleteTier(athlete, athleteLadder);
    const key = `${journey}|${ageGroup}|${tier}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        ageGroup,
        journey,
        tier,
        rank: rankForTier(tier, journey),
        athleteIds: [],
        athleteNames: []
      });
    }

    const group = buckets.get(key);
    group.athleteIds.push(String(athlete.id || athlete.uid || ""));
    group.athleteNames.push(athleteName(athlete));
  });

  let groups = [...buckets.values()]
    .sort((a, b) => {
      const aTeen = a.journey === "P2L" || /teen|adult/i.test(a.ageGroup) ? 1 : 0;
      const bTeen = b.journey === "P2L" || /teen|adult/i.test(b.ageGroup) ? 1 : 0;
      if (aTeen !== bTeen) return aTeen - bTeen;
      if (a.journey !== b.journey) return String(a.journey).localeCompare(String(b.journey));
      return String(a.tier).localeCompare(String(b.tier));
    });


  if (!groups.length) {
    groups = [{
      ageGroup: "Athletes",
      journey: normalizeJourneyCode(activePractice?.journey) || "Z2H",
      tier: "T0",
      rank: rankForTier("T0", normalizeJourneyCode(activePractice?.journey) || "Z2H"),
      athleteIds: [],
      athleteNames: []
    }];
  }

  const prior = previousRouteContext();
  return groups.map((group, index) => ({
    ...group,
    id: `group-${index + 1}`,
    label: `Mat 1 · Group ${index + 1}`,
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
  return ladderForJourney(normalizeJourneyCode(journey) || journey).map((rank) => {
    const tier = tierFromLadderKey(rank.key);
    return `<option value="${tier}"${tier === selected ? " selected" : ""}>${tier} — ${rank.name}</option>`;
  }).join("");
}

function renderTrainingGroups(groups = suggestedTrainingGroups()) {
  const container = $("trainingGroups");
  if (!container) return;

  container.innerHTML = groups.map((group, index) => `
    <section
      class="training-group-card"
      data-training-group="${index}"
      data-athlete-ids="${encodeURIComponent(JSON.stringify(group.athleteIds || []))}"
      data-athlete-names="${encodeURIComponent(JSON.stringify(group.athleteNames || []))}"
    >
      <div class="training-group-head">
        <div>
          <span class="training-group-kicker">Mat 1 · Group ${index + 1}</span>
          <strong>${group.athleteNames.length ? group.athleteNames.join(", ") : "Coach assigned"}</strong>
        </div>
        ${index > 0 ? '<button type="button" class="remove-training-group" aria-label="Remove training group">Remove</button>' : ""}
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
          Tier
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
    </section>
  `).join("");

  container.querySelectorAll(".training-journey").forEach((select) => {
    select.addEventListener("change", () => {
      const card = select.closest(".training-group-card");
      const tier = card?.querySelector(".training-tier");
      const rank = card?.querySelector(".training-rank");
      if (!tier) return;
      const previousTier = tier.value || "T0";
      tier.innerHTML = tierOptions(previousTier, select.value);
      if (!tier.value) tier.value = "T0";
      if (rank) rank.value = rankForTier(tier.value, select.value);
      updateContextSummary();
    });
  });

  container.querySelectorAll(".training-tier").forEach((select) => {
    select.addEventListener("change", () => {
      const card = select.closest(".training-group-card");
      const journey = card?.querySelector(".training-journey")?.value || activePractice?.journey;
      const rank = card?.querySelector(".training-rank");
      if (rank) rank.value = rankForTier(select.value, journey);
      updateContextSummary();
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
}

function renumberTrainingGroups() {
  document.querySelectorAll(".training-group-card").forEach((card, index) => {
    card.dataset.trainingGroup = String(index);
    const kicker = card.querySelector(".training-group-kicker");
    if (kicker) kicker.textContent = `Mat 1 · Group ${index + 1}`;
  });
}

function updateGroupControls() {
  const count = document.querySelectorAll(".training-group-card").length;
  if ($("addTrainingGroupBtn")) $("addTrainingGroupBtn").disabled = false;
  if ($("trainingGroupHint")) {
    $("trainingGroupHint").textContent =
      `${count} training group${count === 1 ? "" : "s"} identified. Groups share one Practice ID. Coach must confirm safe supervision and compatible partner work; no groups are automatically merged.`;
  }
}

function addTrainingGroup() {
  const current = captureTrainingGroups();
  const previous = current[current.length - 1] || {};
  const journey = previous.journey || (/teen/i.test(previous.ageGroup || "") ? "P2L" : "Z2H");
  current.push({
    ageGroup: previous.ageGroup || "Teen",
    journey,
    tier: previous.tier || "T0",
    rank: rankForTier(previous.tier || "T0", journey),
    trainingSession: previous.trainingSession || "1",
    carryForwardNote: "",
    athleteIds: [],
    athleteNames: []
  });
  renderTrainingGroups(current);
}

function captureTrainingGroups() {
  return [...document.querySelectorAll(".training-group-card")].map((card, index) => {
    const journey = String(card.querySelector(".training-journey")?.value || normalizeJourneyCode(activePractice?.journey) || "Z2H").trim();
    const tier = String(card.querySelector(".training-tier")?.value || "T0").trim();
    return {
      id: `group-${index + 1}`,
      label: `Group ${index + 1}`,
      ageGroup: String(card.querySelector(".training-age-group")?.value || "").trim(),
      journey,
      tier,
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
      })()
    };
  });
}

function updateContextSummary() {
  const groups = captureTrainingGroups();
  const summary = groups.map((group) =>
    `${group.label}: ${displayTrainingAgeGroup(group.ageGroup) || "Athletes"} · ${journeyDisplay(group.journey)} · ${group.tier} ${group.rank} · Session ${group.trainingSession}`
  ).join(" | ");
  if ($("contextSummary")) $("contextSummary").textContent = summary || "Waiting for attendance.";
}

function preparePracticeContext() {
  if (!activePractice?.practiceId || !checkedIn.size) {
    setStatus("Load today's practice and check in an athlete before Practice Groups.", true);
    showStep(2);
    return;
  }
  const journey = journeyDisplay(activePractice.journey);
  const discipline = disciplineDisplay(activePractice.discipline);
  if (!journey || !discipline) {
    setStatus("Practice route is incomplete. Return to Session Builder to confirm Journey and discipline.", true);
    showStep(3);
    return;
  }
  if ($("contextJourney")) $("contextJourney").textContent = journey;
  if ($("contextDiscipline")) $("contextDiscipline").textContent = discipline;
  renderTrainingGroups();
  showStep(4);
}

async function savePracticeContextToBuilderSession() {
  let session = {};
  try {
    session = JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");
  } catch {}

  const trainingGroups = captureTrainingGroups();
  const rosterIds = new Set(checkedInAthletes().map(a => String(a.id || a.uid || "")).filter(Boolean));
  const assignedIds = trainingGroups.flatMap(g => g.athleteIds || []).map(String);
  if (assignedIds.length !== new Set(assignedIds).size ||
      assignedIds.some(id => !rosterIds.has(id)) ||
      rosterIds.size !== new Set(assignedIds).size) {
    throw new Error("Training group assignments do not match checked-in athletes. Review the grouping before continuing.");
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
    journey: session.journey || activePractice?.journey || "",
    tier,
    rank: tier,
    rankLabel,
    week,
    trainingSession: week,
    trainingGroups,
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
    trainingGroups
  }));

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
        week,
        schema: activePractice.schema || session.schema || "academy-60",
        executionMode: activePractice.executionMode || session.executionMode || "hybrid",
        durationMinutes: Number(activePractice.durationMinutes || session.durationMinutes || 60)
      });
      activePractice = { ...activePractice, tier, week };
    } catch (error) {
      console.warn("[session] practice tier/session sync skipped", error);
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

  if (isBuilderFlow()) {
    const rosterIds = new Set(checkedInAthletes().map(a => String(a.id || a.uid || "")).filter(Boolean));
    const assigned = captureTrainingGroups().flatMap(g => g.athleteIds || []).map(String);
    if (assigned.length !== new Set(assigned).size ||
        assigned.some(id => !rosterIds.has(id)) ||
        new Set(assigned).size !== rosterIds.size) {
      setStatus("Training groups must account for every checked-in athlete exactly once. Review groups before submitting.", true);
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
  const updateCheckIn = httpsCallable(functions, "updatePracticeCheckIn");
  await updateCheckIn({ practiceId: activePractice.practiceId, action: "submit" });

  sessionLocked = true;

  setStatus(
  `Submitted ${checkedIn.size} athlete(s) for coach review • ${todayLabel()}`
);

  renderAthletes();
  renderCheckedIn();

  if (isBuilderFlow() && returnTarget() === "clipboard") {
    let sessionId = requestedSessionId();
    if (!sessionId) {
      try {
        sessionId = String(JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}")?.sessionId || "");
      } catch {}
    }
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
  $("addTrainingGroupBtn")?.addEventListener("click", addTrainingGroup);

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

