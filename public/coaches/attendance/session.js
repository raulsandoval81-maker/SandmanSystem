import {
  db,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  ensureSignedIn,
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

let athletes = [];
let filteredAthletes = [];
let checkedIn = new Map();
let sessionRef = null;
let sessionId = null;
let sessionLocked = false;
let activePractice = null;

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

function getPracticeType() {
  return `${activePractice?.journey || "session"}-${activePractice?.discipline || "practice"}`;
}

function programMatchesAthlete(athlete = {}) {
  const journey = String(activePractice?.journey || "").toLowerCase();
  const program = athleteProgram(athlete);

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

function requestedPracticeId() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("practice") || params.get("practiceId") || "").trim();
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
  if (!String(practice.discipline || "").trim()) {
    throw new Error("The active practice has no explicit discipline.");
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
    await ensureSignedIn();
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
  const search = String($("searchAthlete")?.value || "").toLowerCase();

  filteredAthletes = athletes.filter((athlete) => {
    if (!programMatchesAthlete(athlete)) return false;

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

  const journey = String(activePractice?.journey || "").toLowerCase();
  const discipline = String(activePractice?.discipline || "").toLowerCase();
  const practiceType = getPracticeType();
  const coach = $("coachName")?.value?.trim() || "Coach";
  const notes = $("practiceNotes")?.value?.trim() || "";


  sessionRef = doc(db, "attendance_sessions", activePractice.practiceId);
  const existing = await getDoc(sessionRef);
  if (existing.exists()) {
    const data = existing.data() || {};
    checkedIn = new Map((Array.isArray(data.checkedIn) ? data.checkedIn : [])
      .map((athlete) => [athlete.id || athlete.uid, athlete]));
    setStatus(`Existing check-in loaded for ${todayLabel()}.`);
    renderAthletes();
    renderCheckedIn();
    return;
  }

  await setDoc(sessionRef, {
    practiceId: activePractice.practiceId,
    sessionId: activePractice.practiceId,
    liveSessionId: activePractice.liveSessionId || "",
    locationId: activePractice.locationId || activePractice.academyId || "",
    academyId: activePractice.academyId || activePractice.locationId || "",
    roomId: activePractice.roomId || "",
    sessionDateKey: todayKey(),
    sessionDateLabel: todayLabel(),
    journey,
    discipline,
    type: practiceType,
    coach,
    coachUid: activePractice.coachUid || "",
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

  sessionId = activePractice.practiceId;
  checkedIn = new Map();

  setStatus(`Session started for ${todayLabel()}.`);
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

  const journey = String(activePractice?.journey || "").toLowerCase();
  const discipline = String(activePractice?.discipline || "").toLowerCase();
  const practiceType = getPracticeType();
  const coach = $("coachName")?.value?.trim() || "Coach";

  await updateDoc(sessionRef, {
    sessionDateKey: todayKey(),
    sessionDateLabel: todayLabel(),

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

  setStatus(
  `Submitted ${checkedIn.size} athlete(s) for coach review • ${todayLabel()}`
);

  renderAthletes();
  renderCheckedIn();
}

function bindEvents() {
  $("startSession")?.addEventListener("click", startSession);
  $("finalizeSession")?.addEventListener("click", submitForReview);

  $("searchAthlete")?.addEventListener("input", applyFilters);
}

bindEvents();
loadAthletes();
