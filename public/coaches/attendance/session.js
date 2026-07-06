import {
  db,
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

let athletes = [];
let filteredAthletes = [];
let checkedIn = new Map();
let sessionRef = null;
let sessionId = null;

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
    a.program ||
    a.track ||
    a.trackCode ||
    a.trackKey ||
    a.ladderKey ||
    ""
  ).toLowerCase();
}

function getJourney() {
  return $("journey")?.value || "p2l";
}

function getDiscipline() {
  return $("discipline")?.value || "wrestling";
}

function getPracticeType() {
  return `${getJourney()}-${getDiscipline()}`;
}

function programMatchesAthlete(athlete = {}) {
  const journey = getJourney();
  const program = athleteProgram(athlete);

  if (journey === "z2h") {
    return program.includes("foundry8") || program.includes("f8") || program.includes("z2h");
  }

  if (journey === "p2l") {
    return program.includes("foundry4") || program.includes("f4") || program.includes("p2l");
  }

  if (journey === "r2g") {
    return program.includes("r2g") || program.includes("road");
  }

  if (journey === "q2m") {
    return program.includes("q2m") || program.includes("quest") || program.includes("mma");
  }

  return true;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function countsAsDecayRecoveryDay(practiceType = "") {
  const type = String(practiceType || "").toLowerCase();

  return (
    type.includes("p2l") ||
    type.includes("z2h") ||
    type.includes("r2g") ||
    type.includes("q2m") ||
    type.includes("wrestling") ||
    type.includes("boxing") ||
    type.includes("mma") ||
    type.includes("open_mat")
  );
}

async function loadAthletes() {
  await ensureSignedIn();

  const snap = await getDocs(collection(db, "athletes"));

  athletes = snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {})
    }))
    .filter((athlete) => {
      if (!athlete.id) return false;
      if (athlete.devMode === true) return false;
      if (athlete.isDev === true) return false;
      if (athlete.isTest === true) return false;
      return true;
    })
    .sort((a, b) => athleteName(a).localeCompare(athleteName(b)));

  applyFilters();
}

function applyFilters() {
  const search = String($("searchAthlete")?.value || "").toLowerCase();

  filteredAthletes = athletes.filter((athlete) => {
    if (!programMatchesAthlete(athlete)) return false;

    const name = athleteName(athlete).toLowerCase();
    const id = String(athlete.id || "").toLowerCase();

    return !search || name.includes(search) || id.includes(search);
  });

  renderAthletes();
}

function renderAthletes() {
  const list = $("athleteList");
  if (!list) return;

  if (!filteredAthletes.length) {
    list.innerHTML = `<p class="muted">No athletes found.</p>`;
    return;
  }

  list.innerHTML = filteredAthletes.map((athlete) => {
    const isChecked = checkedIn.has(athlete.id);

    return `
      <div class="athlete-row">
        <span class="athlete-main">
          <strong>${athleteName(athlete)}</strong>
          <span class="muted">${athlete.id}</span>
          <span class="muted">${athleteProgram(athlete) || "—"}</span>
        </span>

        <button
          type="button"
          class="checkin-btn"
          data-athlete-id="${athlete.id}"
          ${isChecked ? "disabled" : ""}
        >
          ${isChecked ? "Checked In" : "Check In"}
        </button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".checkin-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      checkInAthlete(btn.dataset.athleteId);
    });
  });
}

async function startSession() {
  const journey = getJourney();
  const discipline = getDiscipline();
  const practiceType = getPracticeType();
  const coach = $("coachName")?.value?.trim() || "Coach";
  const notes = $("practiceNotes")?.value?.trim() || "";

  sessionRef = await addDoc(collection(db, "attendance_sessions"), {
    journey,
    discipline,
    type: practiceType,
    coach,
    notes,
    status: "draft",
    checkedIn: [],
    checkedInIds: [],
    checkedInCount: 0,
    finalized: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: "athlete-check-in"
  });

  sessionId = sessionRef.id;
  checkedIn = new Map();

  setStatus(`Session started. ID: ${sessionId}`);
  renderAthletes();
  renderCheckedIn();
}

async function checkInAthlete(id) {
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
    tier: athlete.tier || "",
    rank: athlete.rank || "",
    checkedInAt: new Date().toISOString()
  };

  checkedIn.set(id, payload);

  await updateDoc(sessionRef, {
    checkedIn: Array.from(checkedIn.values()),
    checkedInIds: Array.from(checkedIn.keys()),
    checkedInCount: checkedIn.size,
    updatedAt: serverTimestamp()
  });

  setStatus(`${payload.name} checked in.`);
  renderAthletes();
  renderCheckedIn();
}

function renderCheckedIn() {
  const count = $("checkedCount");
  const list = $("checkedList");

  if (count) count.textContent = `${checkedIn.size} checked in`;

  if (!list) return;

  if (!checkedIn.size) {
    list.innerHTML = `<p class="muted">No athletes checked in yet.</p>`;
    return;
  }

  list.innerHTML = Array.from(checkedIn.values()).map((athlete) => `
    <div class="athlete-row">
      <span>
        <strong>${athlete.name}</strong>
        <span class="muted">${athlete.id}</span>
      </span>

      <button
        type="button"
        class="remove-checkin-btn"
        data-athlete-id="${athlete.id}"
      >
        Remove
      </button>
    </div>
  `).join("");

  document.querySelectorAll(".remove-checkin-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.athleteId;
      checkedIn.delete(id);

      if (sessionRef) {
        await updateDoc(sessionRef, {
          checkedIn: Array.from(checkedIn.values()),
          checkedInIds: Array.from(checkedIn.keys()),
          checkedInCount: checkedIn.size,
          updatedAt: serverTimestamp()
        });
      }

      renderAthletes();
      renderCheckedIn();
    });
  });
}

async function finalizeSession() {
  if (!sessionRef || !sessionId) {
    setStatus("Start a session first.", true);
    return;
  }

  if (!checkedIn.size) {
    setStatus("No athletes checked in.", true);
    return;
  }

  const journey = getJourney();
  const discipline = getDiscipline();
  const practiceType = getPracticeType();
  const coach = $("coachName")?.value?.trim() || "Coach";

  const recoveryDateKey = todayKey();
  const isCombatRecoveryDay = countsAsDecayRecoveryDay(practiceType);

  await Promise.all(
    Array.from(checkedIn.values()).map((athlete) => {
      const current = athletes.find((a) => a.id === athlete.id) || {};
      const decay = current.decay || {};
      const recoveryLog = Array.isArray(decay.recoveryLog)
        ? decay.recoveryLog
        : [];

      const alreadyCountedToday = recoveryLog.includes(recoveryDateKey);

      const updatePayload = {
        lastAttendanceAt: serverTimestamp(),
        lastAttendanceType: practiceType,
        lastAttendanceCoach: coach,
        lastAttendanceSessionId: sessionId,
        updatedAt: serverTimestamp()
      };

      if (
        isCombatRecoveryDay &&
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

      return updateDoc(doc(db, "athletes", athlete.id), updatePayload);
    })
  );

  await updateDoc(sessionRef, {
    journey,
    discipline,
    type: practiceType,
    status: "finalized",
    finalized: true,
    finalizedAt: serverTimestamp(),
    finalizedBy: coach,
    present: Array.from(checkedIn.values()),
    presentIds: Array.from(checkedIn.keys()),
    presentCount: checkedIn.size,
    updatedAt: serverTimestamp()
  });

  setStatus(`Finalized attendance for ${checkedIn.size} athlete(s).`);

  checkedIn.clear();
  sessionRef = null;
  sessionId = null;

  renderAthletes();
  renderCheckedIn();

  await loadAthletes();
}

function bindEvents() {
  $("startSession")?.addEventListener("click", startSession);
  $("finalizeSession")?.addEventListener("click", finalizeSession);
  $("journey")?.addEventListener("change", applyFilters);
  $("discipline")?.addEventListener("change", applyFilters);
  $("searchAthlete")?.addEventListener("input", applyFilters);
}

bindEvents();
loadAthletes();