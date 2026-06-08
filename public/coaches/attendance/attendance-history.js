import {
  db,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

let sessions = [];

function dateFromFirestore(raw) {
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  return new Date(raw);
}

function formatDate(raw) {
  const date = dateFromFirestore(raw);
  if (!date || Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTime(raw) {
  const date = dateFromFirestore(raw);
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function athleteName(a = {}) {
  return a.name || a.publicName || a.fullName || a.uid || "Unknown athlete";
}

function renderSessionDetail(sessionId) {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;

  const detail = $("sessionDetail");
  const title = $("sessionTitle");
  const notes = $("sessionNotes");
  const athletes = $("sessionAthletes");

  if (!detail || !title || !notes || !athletes) return;

  title.textContent =
    `${formatDate(session.createdAt)} · ${session.type || "practice"} · ${session.presentCount || 0} athletes`;

  notes.textContent =
    session.notes
      ? `Notes: ${session.notes}`
      : "No notes logged.";

  const present = Array.isArray(session.present) ? session.present : [];

  athletes.innerHTML = present.length
    ? `
      <ul>
        ${present.map((a) => `<li>${athleteName(a)}</li>`).join("")}
      </ul>
    `
    : `<p class="muted">No athlete list saved for this session.</p>`;

  detail.hidden = false;
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSessions() {
  const rows = $("historyRows");
  const meta = $("historyMeta");

  if (meta) {
    meta.textContent = `${sessions.length} attendance session(s) loaded`;
  }

  if (!rows) return;

  rows.innerHTML = sessions.length
    ? sessions.map((s) => `
      <tr>
        <td data-label="Date">
          <strong>${formatDate(s.createdAt)}</strong>
          <div class="xp-sub">${formatTime(s.createdAt)}</div>
        </td>

        <td data-label="Type">
          ${s.type || "—"}
        </td>

        <td data-label="Coach">
          ${s.coach || "—"}
        </td>

        <td data-label="Count">
          ${Number(s.presentCount || 0)}
        </td>

        <td data-label="Session">
          <button class="pill" type="button" data-view-session="${s.id}">
            View
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="muted">No attendance sessions found.</td></tr>`;

  document.querySelectorAll("[data-view-session]").forEach((btn) => {
    btn.addEventListener("click", () => {
      renderSessionDetail(btn.dataset.viewSession);
    });
  });
}

async function loadAttendanceHistory() {
  await ensureSignedIn();

  const snap = await getDocs(
    query(
      collection(db, "attendance_sessions"),
      orderBy("createdAt", "desc"),
      limit(100)
    )
  );

  sessions = snap.docs.map((d) => ({
    id: d.id,
    data: d.data() || {},
    ...(d.data() || {})
  }));

  renderSessions();
}

loadAttendanceHistory();