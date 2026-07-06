import {
  db,
  collection,
  getDocs,
  addDoc,
  query,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

let athletes = [];
let filteredAthletes = [];
let selectedIds = new Set();

function athleteName(a = {}) {
  return a.name || a.publicName || a.fullName || a.uid || a.id || "Unknown athlete";
}


function athleteProgram(a = {}) {
  return String(
    a.program ||
    a.track ||
    a.trackKey ||
    a.ladderKey ||
    ""
  ).toLowerCase();
}

function programMatchesAthlete(athlete = {}) {
  const selectedProgram = $("practiceType")?.value || "z2h";

  const program = athleteProgram(athlete);

  if (selectedProgram === "z2h") {
    return program.includes("foundry8") || program.includes("f8");
  }

  if (selectedProgram === "p2l") {
    return program.includes("foundry4") || program.includes("f4");
  }

  if (selectedProgram === "r2g") {
    return program.includes("r2g") || program.includes("road2greatness");
  }

  if (selectedProgram === "q2m") {
    return program.includes("q2m") || program.includes("quest2mastery");
  }

  return true;
}

function rosterStatusOf(a = {}) {
  return a.rosterStatus || "current";
}

function isArchived(a = {}) {
  return String(a.rosterStatus || "current") === "archived";
}

function dateFromFirestore(raw) {
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  return new Date(raw);
}

function daysSince(raw) {
  const date = dateFromFirestore(raw);
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function lastSeenText(a = {}) {
  const days = daysSince(a.lastAttendanceAt);

  if (days === null) return "No attendance logged";
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";

  return `${days} days ago`;
}

function edgeStatusOf(a = {}) {
  const days = daysSince(a.lastAttendanceAt);

  if (days === null) return "unknown";
  if (days >= 84) return "frozen";
  if (days >= 56) return "edge-loss";
  if (days >= 28) return "at-risk";
  if (days >= 14) return "warning";

  return "active";
}

function edgeChipHtml(a = {}) {
  const status = edgeStatusOf(a);

  if (status === "frozen") {
    return `<span class="status-chip status-chip--freeze">🔵 Frozen</span>`;
  }

  if (status === "edge-loss") {
    return `<span class="status-chip status-chip--cooldown">🔴 Edge Loss</span>`;
  }

  if (status === "at-risk") {
    return `<span class="status-chip status-chip--watch">🟠 At Risk</span>`;
  }

  if (status === "warning") {
    return `<span class="status-chip status-chip--tempo">🟡 Warning</span>`;
  }

  if (status === "active") {
    return `<span class="status-chip status-chip--promoted">🟢 Active</span>`;
  }

  return `<span class="status-chip">⚪ No Attendance</span>`;
}

function updateAttendanceSummary(list = []) {
  const counts = {
    active: 0,
    warning: 0,
    risk: 0,
    edgeLoss: 0,
    frozen: 0,
    unknown: 0
  };

  for (const athlete of list) {
    const status = edgeStatusOf(athlete);

    if (status === "active") counts.active++;
    else if (status === "warning") counts.warning++;
    else if (status === "at-risk") counts.risk++;
    else if (status === "edge-loss") counts.edgeLoss++;
    else if (status === "frozen") counts.frozen++;
    else counts.unknown++;
  }

  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  setText("summaryTotal", list.length);
  setText("summaryActive", counts.active);
  setText("summaryWarning", counts.warning);
  setText("summaryRisk", counts.risk);
  setText("summaryEdgeLoss", counts.edgeLoss);
  setText("summaryFrozen", counts.frozen);
  setText("summaryUnknown", counts.unknown);
}

function updatePresentCount() {
  const count = selectedIds.size;
  const presentCount = $("presentCount");

  if (presentCount) {
    presentCount.textContent = `${count} selected`;
  }
}

function applyFilters() {
  filteredAthletes = athletes.filter((athlete) => {
    if (isArchived(athlete)) return false;
    return programMatchesAthlete(athlete);
  });

  selectedIds = new Set(
    [...selectedIds].filter((id) =>
      filteredAthletes.some((athlete) => athlete.id === id)
    )
  );

  updateAttendanceSummary(filteredAthletes);
  renderAthletes();
}

function renderAthletes() {
  const list = $("athleteList");
  const meta = $("countMeta");

  if (meta) {
    meta.textContent = `${filteredAthletes.length} active athlete(s)`;
  }

  if (!list) return;

  if (!filteredAthletes.length) {
    list.innerHTML = `<p class="muted">No athletes found.</p>`;
    updatePresentCount();
    return;
  }

  list.innerHTML = filteredAthletes.map((athlete) => {
    const id = athlete.id;
    const name = athleteName(athlete);
    const program = athleteProgram(athlete) || "—";
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
          <strong>${name}</strong>
          <span class="muted">${program}</span>
          <span class="muted">Last seen: ${lastSeenText(athlete)}</span>
        </span>

        <span class="athlete-status">
          ${edgeChipHtml(athlete)}
        </span>
      </label>
    `;
  }).join("");

  document.querySelectorAll(".present-check").forEach((check) => {
    check.addEventListener("change", () => {
      const id = check.dataset.athleteId;

      if (check.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }

      updatePresentCount();
    });
  });

  updatePresentCount();
}

async function loadAthletes() {
  await ensureSignedIn();

  const list = $("athleteList");
  console.log("[attendance athletes]", athletes.length, athletes);
  const meta = $("countMeta");

  if (list) {
    list.innerHTML = `<p class="muted">Loading athletes…</p>`;
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, "athletes")
      )
    );

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

        const rosterStatus = String(
          athlete.rosterStatus || "current"
        );

        return rosterStatus === "current";
      })
      .sort((a, b) =>
        athleteName(a).localeCompare(athleteName(b))
      );

    console.log("[attendance] athletes loaded:", athletes.length, athletes);

    if (meta) {
      meta.textContent = `${athletes.length} active athlete(s) loaded`;
    }

    applyFilters();
  } catch (err) {
    console.error("[attendance] loadAthletes failed", err);

    if (list) {
      list.innerHTML = `
        <p class="muted">
          Could not load athletes. Check console.
        </p>
      `;
    }
  }
}

function selectedAthletesPayload() {
  return athletes
    .filter((athlete) => selectedIds.has(athlete.id))
    .map((athlete) => ({
      id: athlete.id,
      uid: athlete.uid || athlete.id,
      name: athleteName(athlete),
      publicName: athlete.publicName || "",
      fullName: athlete.fullName || "",
      program: athleteProgram(athlete),
      ladderKey: athlete.ladderKey || "",
      tier: athlete.tier || "",
      rank: athlete.rank || ""
    }));
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function countsAsDecayRecoveryDay(practiceType = "") {
  const type = String(practiceType || "").toLowerCase();

  return (
    type.includes("attendance") ||
    type.includes("combat") ||
    type.includes("practice") ||
    type.includes("open_mat") ||
    type.includes("daily_grind") ||
    type.includes("tournament") ||
    type.includes("p2l") ||
    type.includes("z2h") ||
    type.includes("r2g") ||
    type.includes("q2m")
  );
}

async function saveAttendance() {
  const saveBtn = $("saveAttendance");
  const saveStatus = $("saveStatus");

  const present = selectedAthletesPayload();

  if (!present.length) {
    if (saveStatus) {
      saveStatus.textContent = "Select at least one athlete before saving.";
    }
    return;
  }

  const practiceType = $("practiceType")?.value || "practice";
  const coach = $("coachName")?.value?.trim() || "Coach";
  const notes = $("practiceNotes")?.value?.trim() || "";

  try {
    if (saveBtn) saveBtn.disabled = true;
    if (saveStatus) saveStatus.textContent = "Saving attendance…";

    const sessionRef = await addDoc(collection(db, "attendance_sessions"), {
      type: practiceType,
      coach,
      notes,
      present,
      presentIds: present.map((a) => a.id),
      presentCount: present.length,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: "coach-attendance"
    });

const recoveryDateKey = todayKey();
const isCombatRecoveryDay =
  countsAsDecayRecoveryDay(practiceType);

await Promise.all(
  present.map((athlete) => {
    const current = athletes.find((a) => a.id === athlete.id) || {};
    const decay = current.decay || {};
    const recoveryLog = Array.isArray(decay.recoveryLog)
      ? decay.recoveryLog
      : [];

    const alreadyCountedToday =
      recoveryLog.includes(recoveryDateKey);

    const updatePayload = {
      lastAttendanceAt: serverTimestamp(),
      lastAttendanceType: practiceType,
      lastAttendanceCoach: coach,
      lastAttendanceSessionId: sessionRef.id,
      updatedAt: serverTimestamp()
    };

    if (
      isCombatRecoveryDay &&
      decay.state === "DECAY_ACTIVE" &&
      !alreadyCountedToday
    ) {
      const completed =
        Number(decay.recoveryDaysCompleted || 0) + 1;

      updatePayload["decay.recoveryDaysCompleted"] = completed;
      updatePayload["decay.recoveryLog"] =
        arrayUnion(recoveryDateKey);
      updatePayload["decay.lastRecoveryAt"] =
        serverTimestamp();

      if (completed >= 3) {
        updatePayload["decay.state"] = "CLEAR";
        updatePayload["decay.points"] = 0;
        updatePayload["decay.hits"] = 0;
        updatePayload["decay.nextHitAt"] = null;
        updatePayload["decay.recoveryLog"] = [];
        updatePayload["decay.recoveryDaysCompleted"] = 0;
        updatePayload["decay.clearedAt"] =
          serverTimestamp();
        updatePayload["decay.reason"] =
          "Recovered after 3 separate verified combat attendance days";
      }
    }

    return updateDoc(
      doc(db, "athletes", athlete.id),
      updatePayload
    );
  })
);

    selectedIds.clear();

    if (saveStatus) {
      saveStatus.textContent = `Attendance saved for ${present.length} athlete(s).`;
    }

    await loadAthletes();
  } catch (error) {
    console.error("[attendance] save failed", error);

    if (saveStatus) {
      saveStatus.textContent = "Attendance save failed. Check console.";
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindEvents() {

  $("practiceType")?.addEventListener("change", applyFilters);

  $("selectAll")?.addEventListener("click", () => {
    filteredAthletes.forEach((athlete) => selectedIds.add(athlete.id));
    renderAthletes();
  });

  $("clearAll")?.addEventListener("click", () => {
    selectedIds.clear();
    renderAthletes();
  });

  $("saveAttendance")?.addEventListener("click", saveAttendance);
}

bindEvents();
loadAthletes();