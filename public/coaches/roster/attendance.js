import {
  db,
  collection,
  getDocs,
  query,
  limit,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const attendanceList = document.getElementById("attendanceList");
const saveBtn = document.getElementById("saveAttendance");
const saveStatus = document.getElementById("saveStatus");
const presentCount = document.getElementById("presentCount");

const practiceDate = document.getElementById("practiceDate");
const practiceType = document.getElementById("practiceType");
const coachName = document.getElementById("coachName");
const practiceNotes = document.getElementById("practiceNotes");

const selectAllBtn = document.getElementById("selectAll");
const clearAllBtn = document.getElementById("clearAll");

let athletes = [];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function athleteName(data = {}, id = "") {
  return data.publicName || data.fullName || data.name || id;
}

function dateFromFirestore(raw) {
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  return new Date(raw);
}

function lastSeenText(data = {}) {
  const date = dateFromFirestore(data.lastAttendanceAt);
  if (!date || Number.isNaN(date.getTime())) return "No attendance logged";

  const days = Math.floor((Date.now() - date.getTime()) / 86400000);

  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function updatePresentCount() {
  const checked = document.querySelectorAll(".attendance-check:checked").length;
  presentCount.textContent = `${checked} selected`;
}

async function loadAthletes() {
  await ensureSignedIn();

  practiceDate.value = todayKey();

  const snap = await getDocs(
    query(collection(db, "athletes"), limit(500))
  );

  athletes = snap.docs
    .map((d) => ({
      id: d.id,
      data: d.data() || {}
    }))
    .filter((a) => a.data.rosterStatus !== "archived")
    .filter((a) => !a.data.devMode && !a.data.isDev && !a.data.isTest)
    .sort((a, b) =>
      athleteName(a.data, a.id).localeCompare(athleteName(b.data, b.id))
    );

  attendanceList.innerHTML = athletes.length
    ? athletes.map((a) => `
      <label style="display:block;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);">
        <input
          type="checkbox"
          class="attendance-check"
          value="${a.id}"
        />
        <strong>${athleteName(a.data, a.id)}</strong>
        <span class="muted"> — Last seen: ${lastSeenText(a.data)}</span>
      </label>
    `).join("")
    : `<p class="muted">No current athletes found.</p>`;

  document.querySelectorAll(".attendance-check").forEach((box) => {
    box.addEventListener("change", updatePresentCount);
  });

  updatePresentCount();
}

async function saveAttendance() {
  const checked = [
    ...document.querySelectorAll(".attendance-check:checked")
  ];

  if (!checked.length) {
    alert("No athletes selected.");
    return;
  }

  const selectedIds = checked.map((item) => item.value);
  const selectedAthletes = athletes
    .filter((a) => selectedIds.includes(a.id))
    .map((a) => ({
      uid: a.id,
      name: athleteName(a.data, a.id)
    }));

  const dateValue = practiceDate.value || todayKey();
  const typeValue = practiceType.value || "wrestling";
  const coachValue = coachName.value.trim() || "Coach";
  const notesValue = practiceNotes.value.trim();

  saveBtn.disabled = true;
  saveStatus.textContent = "Saving attendance...";

  try {
    const sessionRef = await addDoc(collection(db, "attendance_sessions"), {
      date: dateValue,
      type: typeValue,
      coach: coachValue,
      notes: notesValue,
      presentCount: selectedAthletes.length,
      present: selectedAthletes,
      presentIds: selectedIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const attendanceTimestamp = Timestamp.fromDate(
      new Date(`${dateValue}T12:00:00`)
    );

    for (const athlete of selectedAthletes) {
      await updateDoc(doc(db, "athletes", athlete.uid), {
        lastAttendanceAt: attendanceTimestamp,
        lastAttendanceType: typeValue,
        lastAttendanceCoach: coachValue,
        lastAttendanceSessionId: sessionRef.id,
        updatedAt: serverTimestamp()
      });
    }

    saveStatus.textContent =
      `Saved ${selectedAthletes.length} athletes · ${dateValue} · ${typeValue}`;

    alert(`Attendance saved for ${selectedAthletes.length} athletes.`);

    await loadAthletes();
  } catch (err) {
    console.error("[attendance] save failed", err);
    saveStatus.textContent = "Attendance save failed.";
    alert("Attendance save failed.");
  }

  saveBtn.disabled = false;
}

selectAllBtn?.addEventListener("click", () => {
  document.querySelectorAll(".attendance-check").forEach((box) => {
    box.checked = true;
  });
  updatePresentCount();
});

clearAllBtn?.addEventListener("click", () => {
  document.querySelectorAll(".attendance-check").forEach((box) => {
    box.checked = false;
  });
  updatePresentCount();
});

saveBtn?.addEventListener("click", saveAttendance);

loadAthletes();