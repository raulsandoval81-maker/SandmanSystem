/* ---------------------------------------
   Athlete Bulletin Schedule Feed
---------------------------------------*/

import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init-para.js";

const bannerWrap = document.getElementById("coach-banner");
const bannerText = document.getElementById("coach-banner-text");
const dailyEl = document.getElementById("daily-schedule");
const tournamentEl = document.getElementById("tournament-schedule");

function esc(str = "") {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[c]);
}

function getDisplayTime(row = {}) {
  const label = String(row?.label || "").trim();
  const legacyTime = String(row?.time || "").trim();
  const start = String(row?.start || "").trim();
  const end = String(row?.end || "").trim();

  if (label) return label;
  if (legacyTime) return legacyTime;
  if (start && end) return `${start} - ${end}`;
  return "";
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

function formatDateLabel(value = "") {
  const d = parseEventDate(value);
  if (!d) return value || "";

  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isMeaningfulTournament(row = {}) {
  const title = String(row?.title || "").trim().toUpperCase();
  const location = String(row?.location || "").trim().toUpperCase();
  const details = String(row?.details || "").trim().toUpperCase();

  return (
    (title && title !== "TBA") ||
    (location && location !== "TBA" && location !== "TBA / TBA" && location !== "TBA/ TBA") ||
    (details && details !== "TBA")
  );
}

async function loadSchedule() {
  try {
    const ref = doc(db, "system", "schedule");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("[schedule-feed] schedule doc missing");
      renderBanner({});
      renderDaily([]);
      renderTournaments([]);
      return;
    }

    const data = snap.data() || {};

    renderBanner(data.banner || {});
    renderDaily(Array.isArray(data.daily) ? data.daily : []);
    renderTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
  } catch (err) {
    console.error("[schedule-feed] load failed:", err);
    renderBanner({});
    renderDaily([]);
    renderTournaments([]);
  }
}

function renderBanner(banner) {
  if (!bannerWrap || !bannerText) return;

  const active = banner && banner.active === true;
  const text = String(banner?.text || "").trim();

  if (!active || !text) {
    bannerWrap.style.display = "none";
    bannerText.textContent = "";
    return;
  }

  bannerText.textContent = text;
  bannerWrap.style.display = "block";
}

function renderDaily(rows) {
  if (!dailyEl) return;

  dailyEl.innerHTML = "";

  if (!rows.length) {
    dailyEl.innerHTML = `<div class="empty">No schedule posted yet.</div>`;
    return;
  }

  rows.forEach((row) => {
    const effective =
      row.currentAsOf ||
      row.effectiveDate ||
      row.updatedLabel ||
      "";

    const effectiveHtml = effective
      ? `<div class="item-current">Current as of ${esc(formatDateLabel(effective))}</div>`
      : "";

    const displayTime = getDisplayTime(row);

    const el = document.createElement("div");
    el.className = "schedule-item";

    el.innerHTML = `
      <div class="item-top">
        <div class="item-day">${esc(row.day || "")}</div>
        <div class="item-time">${esc(displayTime)}</div>
      </div>
      <div class="item-title">${esc(row.title || "")}</div>
      <div class="item-detail">${esc(row.details || "")}</div>
      ${effectiveHtml}
    `;

    dailyEl.appendChild(el);
  });
}

function renderTournaments(rows) {
  if (!tournamentEl) return;

  tournamentEl.innerHTML = "";

  const today = todayStart();

  const upcoming = rows
    .filter((row) => {
      const d = parseEventDate(row?.date);
      if (!d) return true;
      return d >= today;
    })
    .filter(isMeaningfulTournament);

  if (!upcoming.length) {
    tournamentEl.innerHTML = `<div class="empty">No upcoming tournaments posted yet.</div>`;
    return;
  }

  upcoming
    .sort((a, b) => {
      const da = parseEventDate(a?.date);
      const db = parseEventDate(b?.date);
      if (!da || !db) return 0;
      return da - db;
    })
    .forEach((row) => {
      const el = document.createElement("div");
      el.className = "schedule-item";

      el.innerHTML = `
        <div class="item-top">
          <div class="item-day">${esc(formatDateLabel(row.date || ""))}</div>
          <div class="item-time">${esc(row.location || "")}</div>
        </div>
        <div class="item-title">${esc(row.title || "")}</div>
        <div class="item-detail">${esc(row.details || "")}</div>
      `;

      tournamentEl.appendChild(el);
    });
}

loadSchedule();