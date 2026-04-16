import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init-para.js";

const todayBox = document.getElementById("today-box");
const dailyEl = document.getElementById("daily-schedule");
const tourEl = document.getElementById("tournament-schedule");
const bannerEl = document.getElementById("coach-banner");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function esc(str = "") {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[c]);
}

function dayMatches(rowDay = "", todayName = "") {
  return String(rowDay || "").toLowerCase().includes(String(todayName || "").toLowerCase());
}

function toMinutes(hhmm = "") {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getDisplayTime(row = {}) {
  return (
    row.label ||
    row.time ||
    ((row.start || row.end)
      ? `${row.start || ""}${row.start && row.end ? " - " : ""}${row.end || ""}`
      : "—")
  );
}

function isLiveNow(row = {}) {
  const now = new Date();
  const todayName = DAYS[now.getDay()];
  const rowDay = String(row?.day || "").trim();

  if (!dayMatches(rowDay, todayName)) return false;

  const start = toMinutes(row?.start);
  const end = toMinutes(row?.end);
  if (start == null || end == null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= start && nowMinutes <= end;
}

function parseEventDate(value = "") {
  const s = String(value || "").trim();
  if (!s) return null;

  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct;

  const firstPart = s.split("-")[0].trim();
  const fallback = new Date(firstPart);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isMeaningfulTournament(item = {}) {
  const title = String(item?.title || "").trim().toUpperCase();
  const location = String(item?.location || "").trim().toUpperCase();
  const details = String(item?.details || "").trim().toUpperCase();

  return (
    (title && title !== "TBA") ||
    (location && location !== "TBA" && location !== "TBA / TBA") ||
    (details && details !== "TBA")
  );
}

function renderToday(daily = []) {
  if (!todayBox) return;

  const todayName = DAYS[new Date().getDay()];
  const row = daily.find((x) => dayMatches(x?.day, todayName));

  if (!row) {
    todayBox.innerHTML = `
      <div class="item">
        <div class="item-day">${esc(todayName)}</div>
        <div class="item-sub">No practice today.</div>
      </div>
    `;
    return;
  }

  const live = isLiveNow(row);
  const timeText = getDisplayTime(row);
  const title = String(row?.title || "").trim() || "—";
  const details = String(row?.details || "").trim() || "—";

  todayBox.innerHTML = `
    <div class="item">
      <div class="item-top">
        <div class="item-day">${esc(todayName)}</div>
        <div class="item-time">${esc(timeText)}</div>
      </div>

      ${live ? `<div class="live">LIVE NOW</div>` : ""}

      <div class="item-title">${esc(title)}</div>
      <div class="item-sub">${esc(details)}</div>
    </div>
  `;
}

function renderWeekly(daily = []) {
  if (!dailyEl) return;

  dailyEl.innerHTML = "";

  if (!Array.isArray(daily) || !daily.length) {
    dailyEl.innerHTML = `<div class="item"><div class="item-sub">No weekly schedule posted yet.</div></div>`;
    return;
  }

  daily.forEach((row) => {
    const div = document.createElement("div");
    div.className = "item";

    const timeText = getDisplayTime(row);

    div.innerHTML = `
      <div class="item-top">
        <div class="item-day">${esc(row.day || "")}</div>
        <div class="item-time">${esc(timeText)}</div>
      </div>
      <div class="item-title">${esc(row.title || "")}</div>
      <div class="item-sub">${esc(row.details || "")}</div>
    `;

    dailyEl.appendChild(div);
  });
}

function renderEvents(tournaments = []) {
  if (!tourEl) return;

  tourEl.innerHTML = "";

  if (!Array.isArray(tournaments)) {
    tourEl.innerHTML = `<div class="item"><div class="item-sub">No upcoming events.</div></div>`;
    return;
  }

  const today = startOfToday();

  const filtered = tournaments
    .filter((t) => {
      const d = parseEventDate(t?.date);
      if (!d) return true;
      return d >= today;
    })
    .filter(isMeaningfulTournament);

  if (!filtered.length) {
    tourEl.innerHTML = `<div class="item"><div class="item-sub">No upcoming events.</div></div>`;
    return;
  }

  filtered.forEach((t) => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="item-top">
        <div class="item-day">${esc(t.title || "")}</div>
        <div class="item-time">${esc(t.date || "")}</div>
      </div>
      <div class="item-sub">${esc(t.location || "")}</div>
      <div class="item-sub">${esc(t.details || "")}</div>
    `;

    tourEl.appendChild(div);
  });
}

async function loadSchedule() {
  const ref = doc(db, "system", "schedule");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    renderToday([]);
    renderWeekly([]);
    renderEvents([]);
    return;
  }

  const data = snap.data() || {};

  if (bannerEl) {
    bannerEl.innerHTML = "";
    if (data.banner && data.banner.active) {
      bannerEl.innerHTML = `<div class="coach-banner">${esc(data.banner.text || "")}</div>`;
    }
  }

  const daily = Array.isArray(data.daily) ? data.daily : [];
  const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];

  renderToday(daily);
  renderWeekly(daily);
  renderEvents(tournaments);
}

loadSchedule();