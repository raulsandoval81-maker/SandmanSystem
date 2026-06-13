import {
  auth,
  db,
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs
} from "/assets/js/firebase-init-para.js";

import {
  LADDER_F4,
  LADDER_F8,
  getStripeInfo,
} from "/assets/js/ladder.service.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const bannerPanel = document.getElementById("banner-card");
const bannerText = document.getElementById("banner-text");
const todayCard = document.getElementById("today-box");
const weeklyList = document.getElementById("weekly-list");
const eventsList = document.getElementById("events-list");
const lastUpdated = document.getElementById("last-updated");
const getMyAthleteCall = httpsCallable(functions, "getMyAthlete");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY_ORDER = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7
};

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isUsableText(v = "") {
  const s = String(v || "").trim();
  return !!s && s.toUpperCase() !== "TBA";
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getXp(a = {}) {
  return safeNumber(a.xp ?? 0, 0);
}

function resolveLadder(a = {}) {
  const track = String(a.track || "").trim().toLowerCase();
  const tier = String(a.rankName || a.tier || a.rank || "").trim().toLowerCase();

  if (track.includes("foundry8")) return LADDER_F8;
  if (track.includes("foundry4")) return LADDER_F4;

  if (["shadow", "recruit", "combatant", "competitor", "commander", "hero"].includes(tier)) {
    return LADDER_F8;
  }

  return LADDER_F4;
}

function canSeeTournaments(athlete = {}) {
  const ladder = resolveLadder(athlete);
  const info = getStripeInfo(ladder, getXp(athlete));

  const tierName = String(
    info?.tier?.name || athlete.rankName || athlete.tier || athlete.rank || ""
  )
    .trim()
    .toLowerCase();

  const isYouth = ladder === LADDER_F8;
  const isFirstShirt = tierName === "shadow";

  return !(isYouth && isFirstShirt);
}

async function getAthleteByUid(athleteUid) {
  const cleanUid = String(athleteUid || "").trim().toUpperCase();
  if (!cleanUid) return null;

  const ref = doc(db, "athletes", cleanUid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return snap.data() || {};
}

function formatUpdatedAt(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function sortDaily(rows = []) {
  return [...rows].sort((a, b) => {
    const aVal = DAY_ORDER[String(a?.day || "").split(",")[0].trim()] || 99;
    const bVal = DAY_ORDER[String(b?.day || "").split(",")[0].trim()] || 99;
    return aVal - bVal;
  });
}

function toMinutes(hhmm = "") {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getDisplayTime(item = {}) {
  const label = String(item?.label || "").trim();
  const legacyTime = String(item?.time || "").trim();
  const start = String(item?.start || "").trim();
  const end = String(item?.end || "").trim();

  if (label) return label;
  if (legacyTime) return legacyTime;
  if (start && end) return `${start} - ${end}`;
  return "—";
}

function isLiveNow(item = {}) {
  const now = new Date();
  const todayName = DAYS[now.getDay()];
  const rowDay = String(item?.day || "").trim();

  if (!rowDay.toLowerCase().includes(todayName.toLowerCase())) return false;

  const start = toMinutes(item?.start);
  const end = toMinutes(item?.end);

  if (start == null || end == null) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= start && nowMinutes <= end;
}

function renderBanner(banner = {}) {
  if (!bannerPanel || !bannerText) return;

  const active = banner?.active === true;
  const text = String(banner?.text || "").trim();

  if (!active || !text) {
    bannerPanel.style.display = "none";
    bannerText.textContent = "";
    return;
  }

  bannerText.textContent = text;
  bannerPanel.style.display = "block";
}

function renderToday(daily = []) {
  if (!todayCard) return;

  const todayName = DAYS[new Date().getDay()];
  const todayRow = daily.find(item =>
    String(item?.day || "")
      .toLowerCase()
      .includes(todayName.toLowerCase())
  );

  if (
    !todayRow ||
    (!isUsableText(getDisplayTime(todayRow)) &&
      !isUsableText(todayRow.title) &&
      !isUsableText(todayRow.details))
  ) {
    todayCard.innerHTML = `
      <div class="status-row">
        <div class="k">
          <span class="en">Status</span>
          <span class="es">Estado</span>
        </div>
        <div class="v">
          <span class="en">NO PRACTICE TODAY</span>
          <span class="es">NO HAY PRÁCTICA HOY</span>
        </div>

        <div class="k">
          <span class="en">Day</span>
          <span class="es">Día</span>
        </div>
        <div class="v">${esc(todayName)}</div>

        <div class="k">
          <span class="en">Details</span>
          <span class="es">Detalles</span>
        </div>
        <div class="v">
          <span class="en">No scheduled session today.</span>
          <span class="es">No hay sesión programada hoy.</span>
        </div>
      </div>
    `;
    return;
  }

  const displayTime = getDisplayTime(todayRow);
  const title = String(todayRow.title || "").trim();
  const details = String(todayRow.details || "").trim();
  const live = isLiveNow(todayRow);
  const statusEN = live ? "LIVE NOW" : "Not Active";
  const statusES = live ? "EN VIVO AHORA" : "No Activa";

  todayCard.innerHTML = `
    <div class="status-row">
      <div class="k">
        <span class="en">Status</span>
        <span class="es">Estado</span>
      </div>
      <div class="v">
        <span class="en">${esc(statusEN)}</span>
        <span class="es">${esc(statusES)}</span>
      </div>

      <div class="k">
        <span class="en">Day</span>
        <span class="es">Día</span>
      </div>
      <div class="v">${esc(todayName)}</div>

      <div class="k">
        <span class="en">Time</span>
        <span class="es">Hora</span>
      </div>
      <div class="v">${esc(displayTime)}</div>

      <div class="k">
        <span class="en">Session</span>
        <span class="es">Sesión</span>
      </div>
      <div class="v">${esc(title || "—")}</div>

      <div class="k">
        <span class="en">Details</span>
        <span class="es">Detalles</span>
      </div>
      <div class="v">${esc(details || "—")}</div>
    </div>
  `;
}

function renderWeekly(daily = []) {
  if (!weeklyList) return;

  const rows = sortDaily(daily);

  if (!rows.length) {
    weeklyList.innerHTML = `
      <p class="muted-empty">
        <span class="en">No weekly schedule posted yet.</span>
        <span class="es">Todavía no hay horario semanal publicado.</span>
      </p>
    `;
    return;
  }

  weeklyList.innerHTML = rows.map(item => {
    const day = String(item?.day || "").trim();
    const displayTime = getDisplayTime(item);
    const title = String(item?.title || "").trim();
    const details = String(item?.details || "").trim();

    return `
      <div class="item">
        <div class="item-top">
          <div class="item-day">${esc(day || "—")}</div>
          <div class="item-sub">${esc(displayTime)}</div>
        </div>
        <div class="item-title">${esc(title || "—")}</div>
        ${details ? `<div class="item-sub">${esc(details)}</div>` : ""}
      </div>
    `;
  }).join("");
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

function isMeaningful(item = {}) {
  const title = String(item?.title || "").trim().toUpperCase();
  const location = String(item?.location || "").trim().toUpperCase();
  const details = String(item?.details || "").trim().toUpperCase();

  return (
    (title && title !== "TBA") ||
    (location && location !== "TBA" && location !== "TBA / TBA") ||
    (details && details !== "TBA")
  );
}

function renderEvents(tournaments = [], canSee = true) {
  if (!eventsList) return;

  if (!canSee) {
    eventsList.innerHTML = `
      <p class="muted-empty">
        <span class="en">Tournament schedule unlocks after first shirt progression.</span>
        <span class="es">El calendario de torneos se desbloquea después de la primera progresión de camiseta.</span>
      </p>
    `;
    return;
  }

  const today = startOfToday();

  const filtered = tournaments
    .filter(item => {
      const d = parseEventDate(item?.date);
      if (!d) return true;
      return d >= today;
    })
    .filter(isMeaningful);

  if (!filtered.length) {
    eventsList.innerHTML = `
      <p class="muted-empty">
        <span class="en">No upcoming events posted yet.</span>
        <span class="es">Todavía no hay eventos próximos publicados.</span>
      </p>
    `;
    return;
  }

  eventsList.innerHTML = filtered.map(item => {
    const date = String(item?.date || "").trim();
    const title = String(item?.title || "").trim();
    const location = String(item?.location || "").trim();
    const details = String(item?.details || "").trim();

    return `
      <div class="item">
        <div class="item-date">${esc(date || "—")}</div>
        <div class="item-title">${esc(title || "—")}</div>
        ${location ? `<div class="item-sub">${esc(location)}</div>` : ""}
        ${details ? `<div class="item-sub">${esc(details)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function paintSchedule(lang) {
  const L = lang || localStorage.getItem("lang") || "en";
  const showEN = L === "en";

  document.querySelectorAll(".en").forEach(el => {
    el.style.display = showEN ? "" : "none";
  });

  document.querySelectorAll(".es").forEach(el => {
    el.style.display = showEN ? "none" : "";
  });
}

const btns = document.querySelectorAll(".lang-btn");

function setLang(lang) {
  const normalized = lang === "sp" ? "es" : lang;
  localStorage.setItem("lang", normalized);

  btns.forEach(b => {
    const btnLang = b.dataset.lang === "sp" ? "es" : b.dataset.lang;
    b.classList.toggle("active", btnLang === normalized);
  });

  paintSchedule(normalized);
}

async function loadSchedule(athlete = null) {
  try {
    const ref = doc(db, "system", "schedule");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      renderBanner({});
      renderToday([]);
      renderWeekly([]);
      renderEvents([], athlete ? canSeeTournaments(athlete) : true);

      if (lastUpdated) {
        lastUpdated.innerHTML = `
          <span class="en"><strong>Last updated:</strong> No schedule posted yet.</span>
          <span class="es"><strong>Última actualización:</strong> Todavía no hay horario publicado.</span>
        `;
      }

      paintSchedule(localStorage.getItem("lang") || "en");
      return;
    }

    const data = snap.data() || {};
    const daily = Array.isArray(data.daily) ? data.daily : [];
    const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
    const banner = data.banner || {};
    const showTournaments = athlete ? canSeeTournaments(athlete) : true;

    renderBanner(banner);
    renderToday(daily);
    renderWeekly(daily);
    renderEvents(tournaments, showTournaments);

    const updated = formatUpdatedAt(data.updatedAt);
    if (lastUpdated) {
      lastUpdated.innerHTML = `
        <span class="en"><strong>Last updated:</strong> ${esc(updated || "—")}</span>
        <span class="es"><strong>Última actualización:</strong> ${esc(updated || "—")}</span>
      `;
    }

    paintSchedule(localStorage.getItem("lang") || "en");
  } catch (err) {
    console.error("[parent-schedule] load failed:", err);

    if (todayCard) {
      todayCard.innerHTML = `
        <p class="muted-empty">
          <span class="en">Failed to load today’s practice.</span>
          <span class="es">No se pudo cargar la práctica de hoy.</span>
        </p>
      `;
    }

    if (weeklyList) {
      weeklyList.innerHTML = `
        <p class="muted-empty">
          <span class="en">Failed to load weekly schedule.</span>
          <span class="es">No se pudo cargar el horario semanal.</span>
        </p>
      `;
    }

    if (eventsList) {
      eventsList.innerHTML = `
        <p class="muted-empty">
          <span class="en">Failed to load events.</span>
          <span class="es">No se pudieron cargar los eventos.</span>
        </p>
      `;
    }

    if (lastUpdated) {
      lastUpdated.innerHTML = `
        <span class="en"><strong>Last updated:</strong> Unavailable</span>
        <span class="es"><strong>Última actualización:</strong> No disponible</span>
      `;
    }

    paintSchedule(localStorage.getItem("lang") || "en");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("lang") || "en";
  setLang(saved);

  btns.forEach(b => {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user || !user.uid) {
      await loadSchedule(null);
      return;
    }

const result =
  await getMyAthleteCall({});

if (!result.data?.ok || !result.data?.linked) {
  renderNoAccess?.();
  return;
}

const athlete =
  result.data.athlete;

    await loadSchedule(athlete);
  });
});