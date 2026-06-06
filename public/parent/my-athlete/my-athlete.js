import {
  auth,
  db,
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
  Number(tier?.cap ?? a.xpCap ?? a.cap ?? a.tierCap ?? 1)
);

const stripeMax = Math.max(1, Number(tier?.stripes ?? 4));
  const stripeSize = Math.max(1, Number(tier?.stripe ?? (xpCap / stripeMax)));

  const calculatedStripes = Math.min(
    stripeMax,
    Math.floor(xpNow / stripeSize)
  );

  const storedStripes = Number(a.stripeCount ?? a.stripes);
  const stripeCount = Number.isFinite(storedStripes)
    ? Math.max(0, Math.min(stripeMax, Math.max(storedStripes, calculatedStripes)))
    : calculatedStripes;

  const nextStripe = Math.min(stripeCount + 1, stripeMax);
  const remainingTier = Math.max(0, xpCap - xpNow);
  const remainingStripe =
    stripeCount < stripeMax
      ? Math.max(0, Math.ceil(nextStripe * stripeSize) - xpNow)
      : 0;

  setText("athlete-avatar", getInitial(name));
  setText("athlete-name", name);
  setText("athlete-tier", tierName);
  setText("athlete-tag", virtueTag);

  setText("summary-xp", `${xpNow}`);
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
const xpPercent = Math.min(
  100,
  Math.round((xpNow / xpCap) * 100)
);

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
    a.parentCoachNote ||
    a.coachNoteParent ||
    a.coachNote ||
    a.parentNote ||
    "";

  setHTML(
    "coach-note",
    coachNote
      ? esc(coachNote)
      : `<span class="en">No coach note available yet.</span>
         <span class="es">Todavía no hay una nota del entrenador.</span>`
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

function renderRecentActivity(a = {}) {
  const list = $("activity-list");
  if (!list) return;

  const raw = Array.isArray(a.parentRecentActivity)
    ? a.parentRecentActivity
    : Array.isArray(a.recentActivity)
      ? a.recentActivity
      : Array.isArray(a.activity)
        ? a.activity
        : [];

  if (!raw.length) {
    list.innerHTML = `
      <li class="muted-empty">
        <span class="en">Recent activity not available yet.</span>
        <span class="es">La actividad reciente todavía no está disponible.</span>
      </li>
    `;
    return;
  }

  list.innerHTML = raw
    .slice(0, 5)
    .map((item) => {
      const text =
        typeof item === "string"
          ? item
          : item?.label || item?.text || item?.title || JSON.stringify(item);
      return `<li>${esc(text)}</li>`;
    })
    .join("");
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

async function getAthleteForParent(userUid) {
  const linkQuery = query(
    collection(db, "parentAthleteLinks"),
    where("parentUid", "==", userUid),
    where("status", "==", "active"),
    limit(1)
  );

  const linkSnap = await getDocs(linkQuery);
  console.log("[parent-my-athlete] parentAthleteLinks size:", linkSnap.size);

  if (!linkSnap.empty) {
    const linkData = linkSnap.docs[0].data() || {};
    const linkedAthleteUid = String(linkData.athleteUid || "").trim().toUpperCase();

    console.log("[parent-my-athlete] parentAthleteLinks hit:", linkData);

    if (linkedAthleteUid) {
      const linked = await getAthleteByUid(linkedAthleteUid);
      if (linked) return linked;
    }
  }

  const parentRef = doc(db, "parents", userUid);
  const parentSnap = await getDoc(parentRef);

  if (parentSnap.exists()) {
    const parentData = parentSnap.data() || {};
    const linkedAthleteUid = String(
      parentData.athleteUid ||
      parentData.primaryAthleteUid ||
      parentData.uid ||
      ""
    ).trim().toUpperCase();

    console.log("[parent-my-athlete] parent doc found:", userUid, parentData);

    if (linkedAthleteUid) {
      const linked = await getAthleteByUid(linkedAthleteUid);
      if (linked) return linked;
    }
  }

  const athleteQuery = query(
    collection(db, "athletes"),
    where("parentUid", "==", userUid),
    limit(1)
  );

  const athleteSnap = await getDocs(athleteQuery);
  console.log("[parent-my-athlete] fallback athlete query size:", athleteSnap.size);

  if (athleteSnap.empty) return null;

  const athleteDoc = athleteSnap.docs[0];
  return {
    id: athleteDoc.id,
    data: athleteDoc.data() || {},
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
  try {
    const athleteResult = urlAthleteUid
      ? await getAthleteByUid(urlAthleteUid)
      : await getAthleteForParent(userUid);

    if (!athleteResult) {
      renderNoAccess();
      document.body.classList.remove("auth-pending");
      document.body.classList.add("auth-ready");
      return;
    }

    const athlete = athleteResult.data;
    console.log("[parent-my-athlete] athlete loaded:", athleteResult.id, athlete);

    renderAthlete(athlete);
    renderRecentActivity(athlete);

    const scheduleRef = doc(db, "system", "schedule");
    const scheduleSnap = await getDoc(scheduleRef);

    if (scheduleSnap.exists()) {
      const schedule = scheduleSnap.data() || {};
      const daily = Array.isArray(schedule.daily) ? schedule.daily : [];
      renderToday(daily);
    } else {
      setHTML("today-box", `
        <p class="muted-empty">
          <span class="en">No schedule posted yet.</span>
          <span class="es">Todavía no hay horario publicado.</span>
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