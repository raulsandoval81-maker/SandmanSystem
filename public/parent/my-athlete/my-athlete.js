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

    const discipline =
      params.get("discipline");

    if (discipline) {
      url.searchParams.set(
        "discipline",
        discipline
      );
    }

    a.setAttribute(
      "href",
      url.pathname + url.search
    );
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
    ["shadow", "recruit", "contender", "competitor", "warrior", "champion", "commander", "hero"].includes(rank)
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

  const tierNum = getTierNum(a);
  return ladder[tierNum] || ladder[0];
}
function getColorClass(a = {}, tierName = "") {

  // renderAthlete() already passes the selected combat record.
  // No need to resolve activeDiscipline again.
  const journey = String(
    a.journey ||
    a.programTrack ||
    a.program ||
    a.track ||
    a.trackCode ||
    ""
  ).toLowerCase();

const colorMaps = {
    z2h: {
      Shadow: "belt-z2h-shadow",
      Recruit: "belt-z2h-recruit",
      Competitor: "belt-z2h-competitor",
      Contender: "belt-z2h-contender",
      Warrior: "belt-z2h-warrior",
      Champion: "belt-z2h-champion",
      Commander: "belt-z2h-commander",
      Hero: "belt-z2h-hero"
    },

    p2l: {
      Apprentice: "belt-p2l-apprentice",
      Warrior: "belt-p2l-warrior",
      Champion: "belt-p2l-champion",
      Veteran: "belt-p2l-veteran",
      Legend: "belt-p2l-legend"
    },

    r2g: {
      Apprentice: "belt-r2g-apprentice",
      Warrior: "belt-r2g-warrior",
      Champion: "belt-r2g-champion",
      Veteran: "belt-r2g-veteran",
      Craftsman: "belt-r2g-craftsman"
    },

    q2m: {
      Apprentice: "belt-q2m-apprentice",
      Warrior: "belt-q2m-warrior",
      Champion: "belt-q2m-champion",
      Veteran: "belt-q2m-veteran",
      Master: "belt-q2m-master"
    }
  };

  let key = journey;

  if (
    key === "z2h" ||
    key.startsWith("zero2hero")
  ) {
    key = "z2h";
  } else if (
    key === "p2l" ||
    key.startsWith("path2legend")
  ) {
    key = "p2l";
  } else if (
    key === "r2g" ||
    key.startsWith("road2greatness")
  ) {
    key = "r2g";
  } else if (
    key === "q2m" ||
    key.startsWith("quest2mastery")
  ) {
    key = "q2m";
  } else if (!key) {
    key = resolveLadder(a) === LADDER_F8 ? "z2h" : "p2l";
  }

  return colorMaps[key]?.[tierName] || "belt-p2l-apprentice";
}

function formatCombatDisciplineLabel(value = "") {
  const key = String(value || "")
    .trim()
    .toLowerCase();

  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    mma: "MMA",
    "submission-grappling": "Submission Grappling",
  };

  return labels[key] ||
    key
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
}

function getParentCombatContext(a = {}) {
  const athleteUid =
    String(
      a.id ||
      a.uid ||
      a.uidCode ||
      urlAthleteUid ||
      ""
    )
      .trim()
      .toUpperCase();

  // Include nested discipline records and legacy root fields.
  // This matters for athletes whose original discipline still lives at root.
  const disciplineIds = Array.from(
    new Set([
      ...(Array.isArray(a.disciplineIds)
        ? a.disciplineIds
        : []),
      ...Object.keys(a.disciplines || {}),
      a.activeDiscipline,
      a.primaryDiscipline,
      a.discipline,
      a.art,
    ]
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean))
  );

  const requestedDiscipline =
    params.get("discipline") ||
    localStorage.getItem(
      `parent_active_discipline_${athleteUid}`
    );

  const normalizedRequested =
    String(requestedDiscipline || "")
      .trim()
      .toLowerCase();

  const activeDiscipline =
    normalizedRequested &&
    disciplineIds.includes(normalizedRequested)
      ? normalizedRequested
      : String(
          a.activeDiscipline ||
          disciplineIds[0] ||
          a.primaryDiscipline ||
          a.discipline ||
          a.art ||
          "wrestling"
        )
          .trim()
          .toLowerCase();

  const combat =
    a.disciplines?.[activeDiscipline] || a;

  return {
    athleteUid,
    disciplineIds,
    activeDiscipline,
    combat,
  };
}

function ensureParentDisciplineSelectorStyles() {
  if ($("parentDisciplineSelectorStyles")) return;

  const style = document.createElement("style");
  style.id = "parentDisciplineSelectorStyles";

  style.textContent = `
    .parent-discipline-wrap{
      margin:12px 0;
      padding:12px;
      border:1px solid rgba(255,255,255,.14);
      border-radius:14px;
      background:rgba(255,255,255,.045);
    }

    .parent-discipline-label{
      margin-bottom:8px;
      font-size:.76rem;
      font-weight:800;
      opacity:.7;
      text-transform:uppercase;
      letter-spacing:.06em;
    }

    .parent-discipline-selector{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
    }

    .parent-discipline-btn{
      appearance:none;
      border:1px solid rgba(255,255,255,.18);
      border-radius:999px;
      padding:8px 14px;
      background:rgba(255,255,255,.06);
      color:inherit;
      font:inherit;
      font-size:.85rem;
      font-weight:800;
      cursor:pointer;
    }

    .parent-discipline-btn.is-active{
      background:#facc15;
      border-color:#facc15;
      color:#111;
    }
  `;

  document.head.appendChild(style);
}

function renderParentDisciplineSelector({
  athleteUid,
  disciplineIds,
  activeDiscipline,
}) {
  let wrap =
    $("combatDisciplineSelectorWrap");

  if (disciplineIds.length <= 1) {
    if (wrap) wrap.hidden = true;
    return;
  }

  ensureParentDisciplineSelectorStyles();

  if (!wrap) {
    const rankBar = $("rankBar");
    if (!rankBar?.parentElement) return;

    wrap = document.createElement("div");
    wrap.id = "combatDisciplineSelectorWrap";
    wrap.className = "parent-discipline-wrap";

    rankBar.parentElement.insertBefore(
      wrap,
      rankBar
    );
  }

  wrap.hidden = false;

  wrap.innerHTML = `
    <div class="parent-discipline-label">
      Combat Discipline
    </div>

    <div
      id="combatDisciplineSelector"
      class="parent-discipline-selector"
      role="group"
      aria-label="Combat discipline"
    ></div>
  `;

  const selector =
    $("combatDisciplineSelector");

  disciplineIds.forEach((discipline) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className =
      "parent-discipline-btn";

    button.textContent =
      formatCombatDisciplineLabel(discipline);

    const isActive =
      discipline === activeDiscipline;

    button.classList.toggle(
      "is-active",
      isActive
    );

    button.setAttribute(
      "aria-pressed",
      String(isActive)
    );

    button.addEventListener("click", () => {
      if (isActive) return;

      localStorage.setItem(
        `parent_active_discipline_${athleteUid}`,
        discipline
      );

      const url =
        new URL(window.location.href);

      url.searchParams.set(
        "discipline",
        discipline
      );

      window.location.href =
        url.pathname + url.search;
    });

    selector.appendChild(button);
  });
}

function renderAthlete(a = {}) {
  const {
    athleteUid,
    disciplineIds,
    activeDiscipline,
    combat,
  } = getParentCombatContext(a);

  renderParentDisciplineSelector({
    athleteUid,
    disciplineIds,
    activeDiscipline,
  });

  const name = getAthleteName(a);
  const virtueTag = getVirtueTag(a);
  const summaryThird = a.team || a.teamName || "—";

  const ladder = resolveLadder(combat);

  const tierName =
    combat.rankName ||
    combat.tierName ||
    getTier(combat);

  const tier = findCurrentTier(
    ladder,
    tierName,
    combat
  );

  // Current tier XP. Your system resets this on promotion.
  const xpNow = Math.max(
    0,
    Number(
      combat.xp ??
      combat.currentTierXP ??
      combat.xpCombat ??
      0
    )
  );

  // SCORING LAW:
  // Use the athlete's deployed tier cap first.
  // Fall back to the canonical ladder cap only when no athlete cap exists.
  // Percentage and stripe targets therefore adapt automatically when caps change.
const xpCap = Math.max(
  1,
  Number(
    tier?.cap ??
    combat.xpCap ??
    combat.cap ??
    combat.tierCap ??
    1
  )
);


const stripeMax =
  Math.max(
    1,
    Number(
      combat.stripesTotal ??
      tier?.stripes ??
      4
    )
  );

const stripeSize =
  Math.max(1, xpCap / stripeMax);

const calculatedStripes =
  Math.min(
    stripeMax,
    Math.floor(xpNow / stripeSize)
  );

const storedStripes = Number(
  combat.stripeCount ??
  combat.stripes
);
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

  const mappedColor = getColorClass(
    combat,
    tierName
  );

  setHTML(
    "rankBar",
    renderDigitalBelt({
      colorClass: mappedColor,
      stripes: stripeCount,
      size: "small"
    })
  );

  setText("stripeText", `Stripes: ${stripeCount}/${stripeMax}`);

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
      .slice(0, 2);

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

function renderAthleteSelector(
  athletes = [],
  selectedUid = ""
) {
  const wrap =
    $("athleteSelectorWrap");

  const selector =
    $("athleteSelector");

  if (!wrap || !selector) return;

  if (athletes.length <= 1) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;

  selector.innerHTML =
    athletes
      .map((a) => {
        const uid =
          a.id || a.uid || "";

        const name =
          a.publicName ||
          a.fullName ||
          uid;

        return `
          <option value="${esc(uid)}">
            ${esc(name)}
          </option>
        `;
      })
      .join("");

  selector.value =
    selectedUid;

  selector.onchange = () => {
    const nextUid =
      selector.value;

    localStorage.setItem(
      "parentSelectedAthleteUid",
      nextUid
    );

    const url =
      new URL(window.location.href);

url.searchParams.set("id", nextUid);
url.searchParams.set("uid", nextUid);
url.searchParams.set("athleteUid", nextUid);

    window.location.href =
      url.pathname + url.search;
  };
}
async function loadPageForUser(userUid) {
  console.log("CURRENT USER UID", userUid);

  try {
    const getMyAthlete =
      httpsCallable(functions, "getMyAthlete");

    const athleteResult =
      await getMyAthlete({});

    console.log(
      "ATHLETE RESULT",
      athleteResult.data
    );

    console.log(
  "ATHLETE COUNT",
  athleteResult.data?.athletes?.length
);

console.log(
  "ATHLETES",
  athleteResult.data?.athletes
);

    if (
      !athleteResult.data?.ok ||
      !athleteResult.data?.linked
    ) {
      renderNoAccess();
      document.body.classList.remove("auth-pending");
      document.body.classList.add("auth-ready");
      return;
    }

    const athletes =
      athleteResult.data?.athletes || [];

    if (!athletes.length) {
      renderNoAccess();
      document.body.classList.remove("auth-pending");
      document.body.classList.add("auth-ready");
      return;
    }

    let selectedUid =
      localStorage.getItem(
        "parentSelectedAthleteUid"
      );

    if (urlAthleteUid) {
      selectedUid = urlAthleteUid;

      localStorage.setItem(
        "parentSelectedAthleteUid",
        selectedUid
      );
    }

    let athlete =
      athletes.find((a) =>
        String(a.id || a.uid || "")
          .toUpperCase() ===
        String(selectedUid || "")
          .toUpperCase()
      );

    if (!athlete) {
      athlete = athletes[0];

      localStorage.setItem(
        "parentSelectedAthleteUid",
        athlete.id || athlete.uid
      );
    }

    const athleteUid =
      athlete.id || athlete.uid;

    renderAthleteSelector(
      athletes,
      athleteUid
    );

    // The callable may return a compact athlete summary.
    // Read the authorized full document so nested disciplines are available.
    try {
      const fullRecord =
        await getAthleteByUid(athleteUid);

      if (fullRecord?.data) {
        athlete = {
          ...athlete,
          ...fullRecord.data,
          id: athleteUid,
          uid:
            fullRecord.data.uid ||
            athlete.uid ||
            athleteUid,
        };
      }
    } catch (error) {
      console.error(
        "[parent-my-athlete] full athlete lookup skipped:",
        error
      );
    }

    console.log(
      "[parent-my-athlete] athlete loaded:",
      athleteUid,
      athlete
    );

    renderAthlete(athlete);

    try {
      await renderParentInboxPreview(
        userUid,
        athleteUid
      );
    } catch (err) {
      console.error(
        "[parent-my-athlete] inbox preview skipped:",
        err
      );
    }

    const scheduleRef =
      doc(db, "system", "schedule");

    const scheduleSnap =
      await getDoc(scheduleRef);

    try {
      if (scheduleSnap.exists()) {
        const schedule =
          scheduleSnap.data() || {};

        const daily =
          Array.isArray(schedule.daily)
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
      console.error(
        "[parent-my-athlete] schedule skipped:",
        err
      );

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
    console.error(
      "[parent-my-athlete] load failed:",
      err
    );

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
