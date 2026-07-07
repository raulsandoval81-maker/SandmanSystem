import {
  db,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  ensureSignedIn,
  query,
  where,
  orderBy,
  limit
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

let athletes = [];
let filteredAthletes = [];
let checkedIn = new Map();
let sessionRef = null;
let sessionId = null;
let sessionLocked = false;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

  if (journey === "z2h") return program.includes("z2h") || program.includes("zero2hero") || program.includes("foundry8") || program.includes("f8");
  if (journey === "p2l") return program.includes("p2l") || program.includes("path2legend") || program.includes("foundry4") || program.includes("f4");
  if (journey === "r2g") return program.includes("r2g") || program.includes("road2greatness") || program.includes("road");
  if (journey === "q2m") return program.includes("q2m") || program.includes("quest2mastery") || program.includes("quest") || program.includes("mma");

  return true;
}

async function checkTodaySessionLock() {
  const snap = await getDocs(
    query(
      collection(db, "attendance_sessions"),
      where("sessionDateKey", "==", todayKey()),
      where("type", "==", getPracticeType()),
      orderBy("createdAt", "desc"),
      limit(1)
    )
  );

  if (snap.empty) {
    sessionLocked = false;
    return;
  }

  const docSnap = snap.docs[0];
  const data = docSnap.data() || {};

  if (data.status === "pending_review" || data.status === "finalized") {
    sessionLocked = true;
    setStatus(`Today's ${getPracticeType()} session is already submitted.`);
  }
}

async function loadAthletes() {
  await ensureSignedIn();
  await checkTodaySessionLock();

  const snap = await getDocs(collection(db, "athletes"));

  athletes = snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {})
    }))
    .filter((athlete) => {
      if (!athlete.id) return false;
      return String(athlete.rosterStatus || "current") === "current";
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
  if (sessionLocked) {
    setStatus("Today's session is already submitted. No more check-ins allowed.", true);
    return;
  }

  const journey = getJourney();
  const discipline = getDiscipline();
  const practiceType = getPracticeType();
  const coach = $("coachName")?.value?.trim() || "Coach";
  const notes = $("practiceNotes")?.value?.trim() || "";

  sessionRef = await addDoc(collection(db, "attendance_sessions"), {
    sessionDateKey: todayKey(),
    journey,
    discipline,
    type: practiceType,
    coach,
    notes,
    status: "draft",
    readyForDailyGrind: false,
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

  setStatus(`Session started for ${todayKey()}.`);
  renderAthletes();
  renderCheckedIn();
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

  checkedIn.set(id, payload);

  await updateDoc(sessionRef, {
    status: "draft",
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

async function submitForReview() {
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

  await updateDoc(sessionRef, {
    sessionDateKey: todayKey(),
    journey,
    discipline,
    type: practiceType,
    status: "pending_review",
    readyForDailyGrind: false,
    finalized: false,
    submittedAt: serverTimestamp(),
    submittedBy: coach,
    checkedIn: Array.from(checkedIn.values()),
    checkedInIds: Array.from(checkedIn.keys()),
    checkedInCount: checkedIn.size,
    updatedAt: serverTimestamp()
  });

  sessionLocked = true;

  setStatus(`Submitted ${checkedIn.size} athlete(s) for coach review.`);

  renderAthletes();
  renderCheckedIn();
}

function bindEvents() {
  $("startSession")?.addEventListener("click", startSession);
  $("finalizeSession")?.addEventListener("click", submitForReview);

  $("journey")?.addEventListener("change", async () => {
    checkedIn.clear();
    sessionRef = null;
    sessionId = null;
    await loadAthletes();
  });

  $("discipline")?.addEventListener("change", async () => {
    checkedIn.clear();
    sessionRef = null;
    sessionId = null;
    await loadAthletes();
  });

  $("searchAthlete")?.addEventListener("input", applyFilters);
}

bindEvents();
loadAthletes();