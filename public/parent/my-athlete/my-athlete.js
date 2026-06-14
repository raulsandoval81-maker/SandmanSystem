import {
  auth,
  db,
  functions,
  httpsCallable,
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "/assets/js/firebase-init-para.js";

import {
  LADDER_F4,
  LADDER_F8,
} from "/assets/js/ladder.service.js";

import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const getParentInboxCall = httpsCallable(functions, "getParentInbox");

const params = new URLSearchParams(window.location.search);
const urlAthleteUid =
  (params.get("id") || params.get("uid") || params.get("athleteUid") || "")
    .trim()
    .toUpperCase();

const $ = (id) => document.getElementById(id);

function esc(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setHTML(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value;
}

function wireParentTabs() {
  const athleteId =
    (params.get("id") || params.get("uid") || params.get("athleteUid") || "")
      .trim()
      .toUpperCase();

  if (!athleteId) return;

  document.querySelectorAll(".parent-tabs a, .parent-subtabs a").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;

    const url = new URL(href, window.location.origin);
    url.searchParams.set("id", athleteId);
    a.setAttribute("href", url.pathname + url.search);
  });
}

function toMinutes(hhmm = "") {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getPacificNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
}

function getPacificNowMinutes() {
  const pacific = getPacificNow();
  return pacific.getHours() * 60 + pacific.getMinutes();
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
  const pacific = getPacificNow();
  const todayName = DAYS[pacific.getDay()];
  const rowDay = String(item?.day || "").trim();

  if (!rowDay.toLowerCase().includes(todayName.toLowerCase())) return false;

  const start = toMinutes(item?.start);
  const end = toMinutes(item?.end);

  if (start == null || end == null) return false;

  const nowMinutes = getPacificNowMinutes();
  return nowMinutes >= start && nowMinutes <= end;
}

function getAthleteName(a = {}) {
  return a.publicName || a.fullName || a.displayName || a.name || a.athleteName || "Athlete";
}

function getVirtueTag(a = {}) {
  return a.mintVirtueTagDisplay || a.virtueName || a.virtue || a.virtueCode || a.mintVirtueTag || "—";
}

function getTier(a = {}) {
  return a.rankName || a.tierName || a.tier || a.rank || "—";
}

function getInitial(name = "") {
  return String(name || "A").trim().charAt(0).toUpperCase() || "A";
}

function resolveLadder(a = {}) {
  const id = String(a.uid || a.uidCode || a.id || "").toUpperCase();
  const track = String(a.track || a.trackCode || "").trim().toLowerCase();
  const rank = String(a.rankName || a.tierName || a.tier || a.rank || "").trim().toLowerCase();

  if (
    id.startsWith("F8_") ||
    track.includes("foundry8") ||
    ["shadow", "recruit", "combatant", "competitor", "contender", "commander", "hero"].includes(rank)
  ) {
    return LADDER_F8;
  }

  return LADDER_F4;
}

function getTierNum(a = {}) {
  if (typeof a?.tierNum === "number") return a.tierNum;
  if (typeof a?.rankNum === "number") return a.rankNum;

  const raw = String(a.tier || a.rank || "").trim();
  const match = raw.match(/T(\d+)|R(\d+)|(\d+)/i);
  if (!match) return 0;

  return Number(match[1] || match[2] || match[3] || 0) || 0;
}

function findCurrentTier(ladder, tierName, a = {}) {
  const wanted = String(tierName || "").trim().toLowerCase();

  const direct = ladder.find((t) =>
    String(t.name || "").trim().toLowerCase() === wanted
  );

  if (direct) return direct;

  // Youth wording safety: older UI sometimes says Contender while ladder says Competitor.
  if (wanted === "contender") {
    const competitor = ladder.find((t) =>
      String(t.name || "").trim().toLowerCase() === "competitor"
    );
    if (competitor) return competitor;
  }

  const tierNum = getTierNum(a);
  return ladder[tierNum] || ladder[0];
}

function getColorClass(ladder, tierName) {
  const colorMapF8 = {
    Shadow: "belt-white",
    Recruit: "belt-yellow",
    Combatant: "belt-orange",
    Competitor: "belt-green",
    Contender: "belt-green",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Commander: "belt-brown",
    Hero: "belt-black"
  };

  const colorMapF4 = {
    Apprentice: "belt-white",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Veteran: "belt-brown",
    Legend: "belt-black"
  };

  const isF8 = ladder === LADDER_F8;
  return (isF8 ? colorMapF8 : colorMapF4)[tierName] || "belt-white";
}

function renderAthlete(a = {}) {
  const name = getAthleteName(a);
  const virtueTag = getVirtueTag(a);
  const summaryThird = a.team || a.teamName || "—";

  const ladder = resolveLadder(a);

  const tierName =
    a.rankName ||
    a.tierName ||
    getTier(a);

  const tier = findCurrentTier(ladder, tierName, a);

  // Current tier XP. Your system resets this on promotion.
  const xpNow = Math.max(0, Number(a.xp ?? a.currentTierXP ?? 0));

  // Current tier cap comes from stored athlete cap first, then ladder tier cap.
const xpCap = Math.max(
  1,
  Number(a.xpCap ?? a.cap ?? a.tierCap ?? tier?.cap ?? 1)
);


const stripeMax =
  Math.max(1, Number(a.stripesTotal ?? tier?.stripes ?? 4));

const stripeSize =
  Math.max(1, xpCap / stripeMax);

const calculatedStripes =
  Math.min(
    stripeMax,
    Math.floor(xpNow / stripeSize)
  );

const storedStripes = Number(a.stripeCount ?? a.stripes);
  const stripeCount = Number.isFinite(storedStripes)
    ? Math.max(0, Math.min(stripeMax, Math.max(storedStripes, calculatedStripes)))
    : calculatedStripes;

  const nextStripe = Math.min(stripeCount + 1, stripeMax);
  const remainingTier = Math.max(0, xpCap - xpNow);

  const xpPercent = Math.min(
  100,
  Math.round((xpNow / xpCap) * 100)
);

  const remainingStripe =
    stripeCount < stripeMax
      ? Math.max(0, Math.ceil(nextStripe * stripeSize) - xpNow)
      : 0;

  setText("athlete-avatar", getInitial(name));
  setText("athlete-name", name);
  setText("athlete-tier", tierName);
  setText("athlete-tag", virtueTag);

  setText("summary-xp", `${xpPercent}%`);
  setText("summary-stripe", `${stripeCount}/${stripeMax}`);
  setText("summary-grind", summaryThird);

  setText("athlete-tier-line", tierName);

  const mappedColor = getColorClass(ladder, tierName);

  setHTML(
    "rankBar",
    renderDigitalBelt({
      colorClass: mappedColor,
      stripes: stripeCount,
      size: "small"
    })
  );

  setText("stripeText", `Stripes: ${stripeCount}/${stripeMax}`);

setText("summary-xp", `${xpPercent}%`);
setText("summary-stripe", `${stripeCount}/${stripeMax}`);
setText("summary-grind", summaryThird);

setText(
  "xpText",
  `XP · ${xpPercent}%`
);

  setHTML(
    "milestone-xp",
    remainingTier > 0
      ? `<span class="en">${esc(name)} needs <strong>${remainingTier} XP</strong> to complete this tier.</span>
         <span class="es">${esc(name)} necesita <strong>${remainingTier} XP</strong> para completar este nivel.</span>`
      : `<span class="en">${esc(name)} is ready for the next tier step.</span>
         <span class="es">${esc(name)} está listo para el siguiente paso de nivel.</span>`
  );

  setHTML(
    "milestone-stripe",
    stripeCount < stripeMax
      ? `<span class="en">Next visible progress target: <strong>Stripe ${nextStripe}</strong> (${remainingStripe} XP)</span>
         <span class="es">Próximo objetivo visible: <strong>Franja ${nextStripe}</strong> (${remainingStripe} XP)</span>`
      : `<span class="en">All current stripes filled.</span>
         <span class="es">Todas las franjas actuales están completas.</span>`
  );

  setText("stripe-target", "");

const coachNote =
  a.latestCoachNote?.note ||
  a.parentCoachNote ||
  a.coachNoteParent ||
  a.coachNote ||
  a.parentNote ||
  "";

const coachName =
  a.latestCoachNote?.coachName || "";

setHTML(
  "coach-note",
  coachNote
    ? `
        ${coachName ? `<strong>${esc(coachName)}</strong><br>` : ""}
        ${esc(coachNote)}
      `
    : `
        <span class="en">No coach note available yet.</span>
        <span class="es">Todavía no hay una nota del entrenador.</span>
      `
);

}

function renderToday(daily = []) {
  const pacific = getPacificNow();
  const todayName = DAYS[pacific.getDay()];
  const todayRow = daily.find((x) =>
    String(x?.day || "")
      .toLowerCase()
      .includes(todayName.toLowerCase())
  );

  const todayBox = $("today-box");

  if (!todayBox) return;

  if (!todayRow) {
    todayBox.innerHTML = `
      <div class="live-pill none">
        <span class="en">NO PRACTICE TODAY</span>
        <span class="es">NO HAY PRÁCTICA HOY</span>
      </div>
      <p class="today-title">${esc(todayName)}</p>
      <p class="today-sub">
        <span class="en">No scheduled session today.</span>
        <span class="es">No hay sesión programada hoy.</span>
      </p>
    `;
    return;
  }

  const live = isLiveNow(todayRow);
  const displayTime = getDisplayTime(todayRow);
  const title = String(todayRow.title || "").trim() || "—";
  const details = String(todayRow.details || "").trim() || "—";

  todayBox.innerHTML = `
    <div class="live-pill ${live ? "live" : "idle"}">
      <span class="en">${live ? "LIVE NOW" : "NOT ACTIVE"}</span>
      <span class="es">${live ? "EN VIVO AHORA" : "NO ACTIVA"}</span>
    </div>

    <p class="today-title">${esc(title)}</p>
    <p class="today-sub">${esc(displayTime)}</p>

    <div class="today-grid">
      <div class="k"><span class="en">Day</span><span class="es">Día</span></div>
      <div class="v">${esc(todayName)}</div>

      <div class="k"><span class="en">Time</span><span class="es">Hora</span></div>
      <div class="v">${esc(displayTime)}</div>

      <div class="k"><span class="en">Details</span><span class="es">Detalles</span></div>
      <div class="v">${esc(details)}</div>
    </div>
  `;
}

function formatInboxDate(value) {
  if (!value) return "—";

  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString()
    : "—";
}


async function renderParentInboxPreview(parentUid, athleteUid) {
  const list = $("activity-list");
  if (!list) return false;

  try {
    const result = await getParentInboxCall({});

    const items = (result.data?.items || [])
      .filter((item) => {
        if (!athleteUid) return true;

        const itemAthleteId =
          String(
            item.athleteId ||
            item.uid ||
            ""
          ).toUpperCase();

        return itemAthleteId === String(athleteUid).toUpperCase();
      })
      .slice(0, 3);

    if (!items.length) {
      list.innerHTML = `
        <li class="muted-empty">
          <span class="en">No recent activity yet.</span>
          <span class="es">Todavía no hay actividad reciente.</span>
        </li>
      `;
      return true;
    }

    list.innerHTML = items
      .map((item) => {
        return `
          <li>
            <strong>${esc(item.title || "Update")}</strong>
            <br />
            <span>${esc(item.message || "")}</span>
            <br />
            <small>${esc(formatInboxDate(item.createdAt))}</small>
          </li>
        `;
      })
      .join("");

    return true;
  } catch (err) {
    console.error("[parent-my-athlete] parent inbox preview failed:", err);
    return false;
  }
}

async function getAthleteByUid(athleteUid) {
  const athleteRef = doc(db, "athletes", athleteUid);
  const athleteSnap = await getDoc(athleteRef);

  console.log("[parent-my-athlete] athlete direct lookup:", athleteUid, athleteSnap.exists());

  if (!athleteSnap.exists()) return null;

  return {
    id: athleteSnap.id,
    data: athleteSnap.data() || {},
  };
}

function renderNoAccess() {
  setText("athlete-avatar", "A");
  setText("athlete-name", "No Athlete Linked");
  setText("athlete-tier", "—");
  setText("athlete-tag", "—");

  setText("summary-xp", "—");
  setText("summary-stripe", "—");
  setText("summary-grind", "—");

  setText("athlete-tier-line", "—");
  setText("stripeText", "—");
  setText("xpText", "—");
  setText("stripe-target", "");

  setHTML("rankBar", "");

  setHTML("activity-list", `
    <li class="muted-empty">
      <span class="en">No athlete is linked to this parent account yet.</span>
      <span class="es">Todavía no hay un atleta vinculado a esta cuenta de padre.</span>
    </li>
  `);

  setHTML("today-box", `
    <p class="muted-empty">
      <span class="en">Sign in with the correct parent account or contact coach.</span>
      <span class="es">Inicie sesión con la cuenta correcta del padre o comuníquese con el entrenador.</span>
    </p>
  `);

  setHTML("milestone-xp", `
    <span class="en">No athlete linked yet.</span>
    <span class="es">Todavía no hay un atleta vinculado.</span>
  `);

  setHTML("milestone-stripe", "");
  setHTML("coach-note", `
    <span class="en">No coach note available yet.</span>
    <span class="es">Todavía no hay una nota del entrenador.</span>
  `);
}

function redirectToAuth() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/parent/auth.html?next=${next}`;
}

async function loadPageForUser(userUid) {
  console.log("CURRENT USER UID", userUid);

  try {
    const getMyAthlete =
  httpsCallable(functions, "getMyAthlete");

const athleteResult =
  await getMyAthlete({});

if (
  !athleteResult.data?.ok ||
  !athleteResult.data?.linked
) {
  renderNoAccess();
document.body.classList.remove("auth-pending");
document.body.classList.add("auth-ready");
return;
}

    if (!athleteResult) {
      renderNoAccess();
      document.body.classList.remove("auth-pending");
      document.body.classList.add("auth-ready");
      return;
    }

const athlete = athleteResult.data.athlete;


console.log("[parent-my-athlete] athlete loaded:", athlete.id, athlete);

renderAthlete(athlete);

try {
await renderParentInboxPreview(
  userUid,
  athleteResult.data.athleteId
);

} catch (err) {
  console.error(
    "[parent-my-athlete] inbox preview skipped:",
    err
  );
}

    const scheduleRef = doc(db, "system", "schedule");
    const scheduleSnap = await getDoc(scheduleRef);

try {

  if (scheduleSnap.exists()) {
    const schedule = scheduleSnap.data() || {};
    const daily = Array.isArray(schedule.daily)
      ? schedule.daily
      : [];

    renderToday(daily);
  } else {
    setHTML("today-box", `
      <p class="muted-empty">
        <span class="en">No schedule posted yet.</span>
        <span class="es">Todavía no hay horario publicado.</span>
      </p>
    `);
  }
} catch (err) {
  console.error("[parent-my-athlete] schedule skipped:", err);

  setHTML("today-box", `
    <p class="muted-empty">
      <span class="en">Schedule unavailable right now.</span>
      <span class="es">Horario no disponible en este momento.</span>
    </p>
  `);
}

    document.body.classList.remove("auth-pending");
    document.body.classList.add("auth-ready");
  } catch (err) {
    console.error("[parent-my-athlete] load failed:", err);
    setHTML("today-box", `
      <p class="muted-empty">
        <span class="en">Failed to load page data.</span>
        <span class="es">No se pudieron cargar los datos de la página.</span>
      </p>
    `);
    document.body.classList.remove("auth-pending");
    document.body.classList.add("auth-ready");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireParentTabs();

  onAuthStateChanged(auth, async (user) => {
    if (!user || !user.uid) {
      redirectToAuth();
      return;
    }

    console.log("[parent-my-athlete] signed-in uid:", user.uid);
    await loadPageForUser(user.uid);
  });
});