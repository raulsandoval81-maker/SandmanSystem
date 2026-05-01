const video = document.getElementById("video");
const matchInfo = document.getElementById("matchInfo");
const eventsEl = document.getElementById("events");
const statsEl = document.getElementById("stats");
const notesEl = document.getElementById("notes");
const statusEl = document.getElementById("status");

const match =
  JSON.parse(localStorage.getItem("arena_last_video_match") || "null") ||
  JSON.parse(localStorage.getItem("arena_active_match") || "null");

const arenaState =
  JSON.parse(localStorage.getItem("arena_last_match_state") || "null") || {};

if (!match) {
  matchInfo.textContent = "No saved match found.";
} else {
  matchInfo.textContent = `${match.athlete || "Athlete"} vs ${match.opponent || "Opponent"}`;

  if (match.videoUrl) {
    video.src = match.videoUrl;
  }
}

const events = arenaState.events || [];

renderStats(events);
renderEvents(events);

notesEl.value = match?.notes || "";

document.getElementById("saveNotes")?.addEventListener("click", () => {
  const updated = {
    ...(match || {}),
    notes: notesEl.value.trim(),
    reviewedAt: new Date().toISOString(),
    events
  };

  localStorage.setItem("arena_reviewed_match", JSON.stringify(updated));
  statusEl.textContent = "Notes saved to reviewed match.";
});

function renderEvents(events) {
  if (!events.length) {
    eventsEl.innerHTML = `<div class="muted">No events recorded yet.</div>`;
    return;
  }

  eventsEl.innerHTML = events.map((e, i) => `
    <div class="event" data-index="${i}">
      ${e.time || "--"} · ${String(e.side || "").toUpperCase()} · ${e.label || e.code} ${e.points ? "+" + e.points : ""}
    </div>
  `).join("");

  eventsEl.querySelectorAll(".event").forEach(el => {
    el.addEventListener("click", () => {
      const e = events[Number(el.dataset.index)];
      if (!video || !e.videoTime) return;
      video.currentTime = e.videoTime;
      video.play();
    });
  });
}

function renderStats(events) {
  const stats = {};

  events.forEach(e => {
    const key = `${e.side || "unknown"}_${e.code || e.label}`;
    stats[key] = (stats[key] || 0) + 1;
  });

  const rows = Object.entries(stats).map(([key, val]) => `
    <div>${key.replaceAll("_", " ")}: <strong>${val}</strong></div>
  `).join("");

  statsEl.innerHTML = rows || `<div class="muted">No stats yet.</div>`;
}