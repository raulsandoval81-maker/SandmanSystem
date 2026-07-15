// public/coaches/arena-xp/weekend-arena.js

import {
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

import { XP_URL } from "/assets/js/coach-endpoints.js";
import {
  LADDER_F4,
  LADDER_F8
} from "/assets/js/ladder.service.js";

/* =========================================================
   DOM
========================================================= */

const rowsEl = document.getElementById("rows");
const statusEl = document.getElementById("status");

const journeyFilterEl =
  document.getElementById("journeyFilter");

const tournamentIdEl =
  document.getElementById("tournamentId");

const searchEl =
  document.getElementById("search");

const refreshBtn =
  document.getElementById("refreshBtn");

const pickAllEl =
  document.getElementById("pickAll");

const clearAllEl =
  document.getElementById("clearAll");

const battleBtn =
  document.getElementById("fullAll");

const podiumBtn =
  document.getElementById("partAll");

const secondDivisionBtn =
  document.getElementById("styleAll");

const sportsmanshipBtn =
  document.getElementById("sportsmanshipAll");

const sessionBar =
  document.getElementById("sessionBar");

const sbLoaded =
  document.getElementById("sb-loaded");

const sbAwarded =
  document.getElementById("sb-awarded");

const sbXP =
  document.getElementById("sb-xp");

const sbReceipts =
  document.getElementById("sb-receipts");

/* =========================================================
   COACH-FACING BUTTON LABELS
========================================================= */

if (battleBtn) {
  battleBtn.textContent = "+15 Weekend Battle";
}

if (podiumBtn) {
  podiumBtn.textContent = "+5 Podium";
}

if (secondDivisionBtn) {
  secondDivisionBtn.textContent = "+5 Second Division";
}

if (sportsmanshipBtn) {
  sportsmanshipBtn.textContent = "−5 Sportsmanship";
}

/* =========================================================
   STATE
========================================================= */

let roster = [];
let filtered = [];

let currentTournamentId = "";

let tournamentMode = false;
let tournamentAthleteIds = new Set();

let awardedCount = 0;
let awardedXP = 0;
let receipts = 0;

let isSaving = false;

/* =========================================================
   PROGRAM DOCTRINE
========================================================= */

const PROGRAM_LABELS = Object.freeze({
  "z2h-wrestling": "Zero2Hero · Wrestling",
  "z2h-kickboxing": "Zero2Hero · Kickboxing",
  "p2l-wrestling": "Path2Legend · Wrestling",
  "p2l-boxing": "Path2Legend · Boxing",
  "q2m-mma": "Quest2Mastery · MMA"
});

function selectedProgram() {
  return String(
    journeyFilterEl?.value || "all"
  )
    .trim()
    .toLowerCase();
}

function selectedProgramParts() {
  const program = selectedProgram();

  if (program === "all") {
    return {
      program: "all",
      journey: "",
      discipline: ""
    };
  }

  const [journey = "", discipline = ""] =
    program.split("-");

  return {
    program,
    journey,
    discipline
  };
}

function normalizeJourney(value = "") {
  const raw = String(value)
    .trim()
    .toLowerCase();

  if (
    raw === "z2h" ||
    raw.includes("zero2hero") ||
    raw.includes("zero-to-hero") ||
    raw.includes("foundry8")
  ) {
    return "z2h";
  }

  if (
    raw === "p2l" ||
    raw.includes("path2legend") ||
    raw.includes("path-to-legend")
  ) {
    return "p2l";
  }

  if (
    raw === "q2m" ||
    raw.includes("quest2mastery") ||
    raw.includes("quest-to-mastery") ||
    raw.includes("mastery")
  ) {
    return "q2m";
  }

  return "";
}

function normalizeDiscipline(value = "") {
  const raw = String(value)
    .trim()
    .toLowerCase();

  if (raw.includes("kick")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw.includes("mma") ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return "";
}

function athleteJourney(a = {}) {
  const explicit = normalizeJourney(
    a.journey ||
    a.ladderKey ||
    a.program ||
    a.programTrack ||
    ""
  );

  if (explicit) {
    return explicit;
  }

  const id = String(
    a.id ||
    a.uid ||
    ""
  ).toUpperCase();

  if (id.startsWith("F8_")) {
    return "z2h";
  }

  return "";
}

function athleteDiscipline(a = {}) {
  return normalizeDiscipline(
    a.discipline ||
    a.primaryDiscipline ||
    a.sport ||
    a.art ||
    a.track ||
    a.trackCode ||
    ""
  );
}

function athleteProgram(a = {}) {
  const journey = athleteJourney(a);
  const discipline = athleteDiscipline(a);

  if (!journey || !discipline) {
    return "";
  }

  return `${journey}-${discipline}`;
}

function athleteMatchesSelectedProgram(a = {}) {
  const {
    program
  } = selectedProgramParts();

  if (program === "all") {
    return false;
  }

  return athleteProgram(a) === program;
}

/* =========================================================
   TOURNAMENT HANDOFF
========================================================= */

function normalizeProgram(value = "") {
  const raw = String(value)
    .trim()
    .toLowerCase();

  const aliases = {
    "z2h-wrestling": "z2h-wrestling",
    "zero2hero-wrestling": "z2h-wrestling",

    "z2h-kickboxing": "z2h-kickboxing",
    "zero2hero-kickboxing": "z2h-kickboxing",

    "p2l-wrestling": "p2l-wrestling",
    "path2legend-wrestling": "p2l-wrestling",

    "p2l-boxing": "p2l-boxing",
    "path2legend-boxing": "p2l-boxing",

    "q2m-mma": "q2m-mma",
    "quest2mastery-mma": "q2m-mma"
  };

  return aliases[raw] || "";
}

function readTournamentHandoff() {
  const params =
    new URLSearchParams(window.location.search);

  const tournamentId = String(
    params.get("tournamentId") ||
    params.get("eventId") ||
    sessionStorage.getItem(
      "sandman_tournament_id"
    ) ||
    ""
  ).trim();

  const program = normalizeProgram(
    params.get("program") ||
    params.get("track") ||
    sessionStorage.getItem(
      "sandman_tournament_program"
    ) ||
    ""
  );

  const athleteIdsRaw = String(
    params.get("athleteIds") ||
    sessionStorage.getItem(
      "sandman_tournament_athlete_ids"
    ) ||
    ""
  );

  tournamentAthleteIds = new Set(
    athleteIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );

  tournamentMode = Boolean(
    tournamentId ||
    program ||
    tournamentAthleteIds.size
  );

  if (tournamentId && tournamentIdEl) {
    tournamentIdEl.value = tournamentId;
  }

  if (
    program &&
    journeyFilterEl &&
    Array.from(
      journeyFilterEl.options || []
    ).some((option) => {
      return option.value === program;
    })
  ) {
    journeyFilterEl.value = program;
  }

  syncTournamentId();
}

/* =========================================================
   GENERAL HELPERS
========================================================= */

function setStatus(message, ok = true) {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.style.color =
    ok ? "#bef264" : "#fca5a5";

  window.setTimeout(() => {
    if (statusEl) {
      statusEl.style.color = "";
    }
  }, 1200);
}

function syncTournamentId() {
  currentTournamentId = String(
    tournamentIdEl?.value || ""
  ).trim();
}

function trackBaseOf(docId, a = {}) {
  const trackBase = String(
    a.trackBase || ""
  )
    .trim()
    .toUpperCase();

  if (
    trackBase === "F4" ||
    trackBase === "F8" ||
    trackBase === "ADULT"
  ) {
    return trackBase;
  }

  const id = String(
    docId ||
    a.uid ||
    ""
  ).toUpperCase();

  if (id.startsWith("F8_")) {
    return "F8";
  }

  const journey = athleteJourney(a);

  if (journey === "z2h") {
    return "F8";
  }

  if (journey === "q2m") {
    return "ADULT";
  }

  return "F4";
}

function selectedTrackBase() {
  const {
    journey
  } = selectedProgramParts();

  if (journey === "z2h") {
    return "F8";
  }

  if (journey === "q2m") {
    return "ADULT";
  }

  return "F4";
}

function resolveRank(a = {}) {
  if (a.rankName) {
    return a.rankName;
  }

  if (a.tierName) {
    return a.tierName;
  }

  const base = trackBaseOf(a.id, a);
  const tier = String(
    a.tier || ""
  ).toUpperCase();

  if (base === "F8") {
    const map = {
      T0: "Shadow",
      T1: "Recruit",
      T2: "Combatant",
      T3: "Competitor",
      T4: "Warrior",
      T5: "Champion",
      T6: "Commander",
      T7: "Hero"
    };

    return map[tier] || "Shadow";
  }

  if (base === "ADULT") {
    const map = {
      T0: "Apprentice",
      T1: "Champion",
      T2: "Veteran",
      T3: "Master"
    };

    return map[tier] || "Apprentice";
  }

  const map = {
    T0: "Apprentice",
    T1: "Warrior",
    T2: "Champion",
    T3: "Veteran",
    T4: "Legend"
  };

  return map[tier] || "Apprentice";
}

function xpCapForAthlete(a = {}) {
  const base = trackBaseOf(a.id, a);
  const rankName = resolveRank(a);

  const ladder =
    base === "F8"
      ? LADDER_F8
      : LADDER_F4;

  const tier = ladder.find((item) => {
    return item.name === rankName;
  });

  return Number(
    tier?.cap ??
    a.xpCap ??
    a.cap ??
    a.tierCap ??
    (base === "F8" ? 600 : 1000)
  );
}

function rosterStatusOf(a = {}) {
  return String(
    a.rosterStatus || "current"
  );
}

function athleteIds(a = {}) {
  return [
    a.id,
    a.uid,
    a.uidCode
  ]
    .map((value) => {
      return String(value || "").trim();
    })
    .filter(Boolean);
}

function athleteMatchesTournament(a = {}) {
  if (
    !tournamentMode ||
    !tournamentAthleteIds.size
  ) {
    return true;
  }

  return athleteIds(a).some((id) => {
    return tournamentAthleteIds.has(id);
  });
}

function athleteMatchesSearch(a = {}) {
  const query = String(
    searchEl?.value || ""
  )
    .toLowerCase()
    .trim();

  if (!query) {
    return true;
  }

  const name = String(
    a.publicName ||
    a.fullName ||
    ""
  ).toLowerCase();

  const uid = String(
    a.uid ||
    a.uidCode ||
    a.id ||
    ""
  ).toLowerCase();

  return (
    name.includes(query) ||
    uid.includes(query)
  );
}

function getSelectedIds() {
  return Array.from(
    document.querySelectorAll(
      ".pick:checked"
    )
  )
    .map((checkbox) => {
      return checkbox.dataset.id;
    })
    .filter(Boolean);
}

function clearSelections() {
  document.querySelectorAll(
    ".pick"
  ).forEach((checkbox) => {
    checkbox.checked = false;
  });
}

/* =========================================================
   SESSION BAR
========================================================= */

function updateSessionBar() {
  if (!sessionBar) {
    return;
  }

  if (!filtered.length) {
    sessionBar.style.display = "none";
    return;
  }

  sessionBar.style.display = "flex";

  if (sbLoaded) {
    sbLoaded.textContent =
      `Loaded: ${filtered.length}`;
  }

  if (sbAwarded) {
    sbAwarded.textContent =
      `Awarded this session: ${awardedCount}`;
  }

  if (sbXP) {
    sbXP.textContent =
      `XP issued: ${awardedXP}`;
  }

  if (sbReceipts) {
    sbReceipts.textContent =
      receipts
        ? `Receipts: ${receipts}`
        : "";
  }
}

/* =========================================================
   RENDERING
========================================================= */

function render(list) {
  if (!rowsEl) {
    return;
  }

  if (!list.length) {
    rowsEl.innerHTML = `
      <tr>
        <td colspan="4" class="muted">
          No athletes match.
        </td>
      </tr>
    `;

    updateSessionBar();
    return;
  }

  rowsEl.innerHTML = list
    .map((a) => {
      const uid =
        a.uidCode ||
        a.uid ||
        a.id;

      const name =
        a.publicName ||
        a.fullName ||
        uid;

      const track =
        a.trackCode ||
        a.track ||
        athleteProgram(a) ||
        "—";

      const tier =
        resolveRank(a);

      const xp =
        Number(a.xp ?? 0);

      const cap =
        xpCapForAthlete(a);

      const stripeCount = Math.max(
        0,
        Math.min(
          4,
          Number(
            a.stripeCount ??
            a.stripes ??
            0
          )
        )
      );

      const stars =
        "★".repeat(stripeCount) +
        "☆".repeat(4 - stripeCount);

      return `
        <tr data-id="${a.id}">
          <td>
            <input
              type="checkbox"
              class="pick"
              data-id="${a.id}"
            />
          </td>

          <td>
            <div class="ath-name">${name}</div>
            <div class="sub">${uid}</div>
          </td>

          <td>
            ${tier} / ${track}
          </td>

          <td>
            <div class="coach-xp-card">
              <div>
                <strong>Combat:</strong>
                <span data-xpline="${a.id}">
                  ${xp} / ${cap}
                </span>
              </div>

              <div>
                <strong>Strength:</strong>
                ${a.xpStrength ?? a.strengthXP ?? 0} / 120
              </div>

              <div>
                <strong>Honor:</strong>
                ${a.xpHonor ?? a.honorXP ?? 0} / 120
              </div>

              <div>
                <strong>Stripes:</strong>
                ${stars}
              </div>

              <div>
                <strong>Attendance:</strong>
                ${a.attendanceStatus ?? "Active"}
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  updateSessionBar();
}

/* =========================================================
   ROSTER FILTERING
========================================================= */

function applyFilterAndRender() {
  const program = selectedProgram();

  if (program === "all") {
    filtered = [];
    render(filtered);
    updateButtons();

    setStatus(
      tournamentMode
        ? "Tournament loaded. Select a program to continue."
        : "Select a program to begin.",
      true
    );

    return;
  }

  filtered = roster
    .filter(athleteMatchesSelectedProgram)
    .filter(athleteMatchesTournament)
    .filter(athleteMatchesSearch)
    .sort((a, b) => {
      const aName = String(
        a.publicName ||
        a.fullName ||
        a.uid ||
        a.id ||
        ""
      );

      const bName = String(
        b.publicName ||
        b.fullName ||
        b.uid ||
        b.id ||
        ""
      );

      return aName.localeCompare(bName);
    });

  render(filtered);
  updateButtons();

  const modeLabel =
    tournamentMode
      ? "Tournament roster"
      : "Manual roster";

  setStatus(
    `${modeLabel} · ` +
    `${PROGRAM_LABELS[program] || program} · ` +
    `${filtered.length} athlete(s)`,
    true
  );
}

/* =========================================================
   LOAD ROSTER
========================================================= */

async function loadRoster() {
  setStatus("Loading athletes…", true);

  const snap = await getDocs(
    collection(db, "athletes")
  );

  roster = snap.docs.map((documentSnapshot) => {
    return {
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    };
  });

roster = roster.filter((a) => {
  if (rosterStatusOf(a) !== "current") {
    return false;
  }

  if (
    a.isDev === true ||
    a.devMode === true ||
    a.isTest === true
  ) {
    return false;
  }

  return true;
});
  applyFilterAndRender();
}

/* =========================================================
   BUTTON GATING
========================================================= */

function updateButtons() {
  syncTournamentId();

  const hasTournamentId =
    Boolean(currentTournamentId);

  const hasProgram =
    selectedProgram() !== "all";

  const hasVisibleRoster =
    filtered.length > 0;

  const locked =
    isSaving;

  const disabled =
    !hasTournamentId ||
    !hasProgram ||
    !hasVisibleRoster ||
    locked;

  if (battleBtn) {
    battleBtn.disabled = disabled;
  }

  if (podiumBtn) {
    podiumBtn.disabled = disabled;
  }

  if (secondDivisionBtn) {
    secondDivisionBtn.disabled = disabled;
  }

  if (sportsmanshipBtn) {
    sportsmanshipBtn.disabled = disabled;
  }
}

/* =========================================================
   XP PAYLOADS
========================================================= */

function parseFunctionJson(raw) {
  return (
    raw?.result ??
    raw?.data ??
    raw
  );
}

function baseMeta() {
  const {
    program,
    journey,
    discipline
  } = selectedProgramParts();

  return {
    tournamentId: currentTournamentId,
    eventId: currentTournamentId,
    eventType: "weekend-tournament",

    program,
    journey,
    discipline,
    trackBase: selectedTrackBase(),

    source: "weekend-arena"
  };
}

function buildPayload(uid, awardKind) {
  if (!currentTournamentId) {
    throw new Error(
      "Tournament ID is required."
    );
  }

  const meta = baseMeta();

  if (awardKind === "battle") {
    return {
      uid,
      kind: "ARENA/WEEKEND_BATTLE",
      amount: 15,
      meta: {
        ...meta,
        weekendComponent: "BATTLE"
      }
    };
  }

  if (awardKind === "podium") {
    return {
      uid,
      kind: "ARENA/PODIUM",
      amount: 5,
      meta: {
        ...meta,
        weekendComponent: "PODIUM"
      }
    };
  }

  if (awardKind === "secondDivision") {
    return {
      uid,
      kind: "ARENA/SECOND_DIVISION",
      amount: 5,
      meta: {
        ...meta,
        weekendComponent:
          "SECOND_DIVISION",
        sameDay: true,
        divisionNumber: 2
      }
    };
  }

  if (awardKind === "sportsmanship") {
    return {
      uid,
      kind: "ARENA/SPORTSMANSHIP",
      amount: -5,
      meta: {
        ...meta,
        weekendComponent:
          "SPORTSMANSHIP"
      }
    };
  }

  throw new Error(
    `Unknown Weekend Arena kind: ${awardKind}`
  );
}

/* =========================================================
   AWARD ONE ATHLETE
========================================================= */

async function giveToOne(id, awardKind) {
  const athlete = roster.find((a) => {
    return a.id === id;
  });

  if (!athlete) {
    return {
      ok: false,
      delta: 0,
      error: "Athlete not found"
    };
  }

  const row = document.querySelector(
    `tr[data-id="${id}"]`
  );

  const coachUid =
    window.COACH_UID ||
    localStorage.getItem("coachUid") ||
    "DEV_COACH";

  const payload = buildPayload(
    athlete.uidCode ||
    athlete.uid ||
    athlete.id,
    awardKind
  );

  const response = await fetch(XP_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-coach-uid": String(
        coachUid
      ).trim()
    },

    body: JSON.stringify({
      data: payload
    })
  });

  const text = await response
    .text()
    .catch(() => "");

  if (!response.ok) {
    console.error(
      "XP ERR:",
      response.status,
      text
    );

    return {
      ok: false,
      delta: 0,
      error:
        `HTTP ${response.status}` +
        (text ? ` · ${text}` : "")
    };
  }

  let raw = null;

  try {
    raw = text
      ? JSON.parse(text)
      : null;
  } catch {
    raw = null;
  }

  const data =
    parseFunctionJson(raw) || {};

  if (!data.ok) {
    return {
      ok: false,
      delta: 0,
      error:
        data.error ||
        data.reason ||
        "Blocked"
    };
  }

  const delta = Number(
    data.delta ??
    payload.amount ??
    0
  );

  const afterXp =
    typeof data.afterXp === "number"
      ? data.afterXp
      : typeof data.afterXP === "number"
        ? data.afterXP
        : null;

  if (typeof afterXp === "number") {
    athlete.xp = afterXp;
  }

  if (typeof data.afterCap === "number") {
    athlete.xpCap = data.afterCap;
  }

  if (data.afterRankName) {
    athlete.rankName =
      data.afterRankName;
  }

  if (data.afterTierName) {
    athlete.tierName =
      data.afterTierName;
  }

  if (row) {
    const cap =
      xpCapForAthlete(athlete);

    const line = row.querySelector(
      `[data-xpline="${id}"]`
    );

    if (line) {
      line.textContent =
        `${athlete.xp ?? 0} / ${cap}`;
    }
  }

  return {
    ok: true,
    delta
  };
}

/* =========================================================
   BULK AWARD
========================================================= */

async function bulkGive(
  awardKind,
  label
) {
  const ids = getSelectedIds();

  if (!ids.length) {
    setStatus(
      "No athletes selected.",
      false
    );

    return;
  }

  syncTournamentId();

  if (!currentTournamentId) {
    setStatus(
      "Tournament ID required.",
      false
    );

    return;
  }

  if (isSaving) {
    return;
  }

  isSaving = true;
  updateButtons();

  setStatus(
    `Saving ${label} for ${ids.length}…`,
    true
  );

  let successCount = 0;
  let xpIssued = 0;
  let failureCount = 0;

  try {
    for (const id of ids) {
      const result = await giveToOne(
        id,
        awardKind
      );

      if (result.ok) {
        successCount += 1;
        xpIssued += result.delta;
        receipts += 1;
      } else {
        failureCount += 1;

        console.warn(
          "Weekend Arena award blocked:",
          id,
          result.error
        );
      }
    }

    awardedCount += successCount;
    awardedXP += xpIssued;

    updateSessionBar();
    applyFilterAndRender();

    setStatus(
      `Saved ${label}. ` +
      `Success: ${successCount}/${ids.length} · ` +
      `XP: ${xpIssued}` +
      (
        failureCount
          ? ` · Blocked: ${failureCount}`
          : ""
      ),
      failureCount === 0
    );
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ||
      "Save failed.",
      false
    );
  } finally {
    isSaving = false;
    updateButtons();
  }
}

/* =========================================================
   EVENTS
========================================================= */

[
  "input",
  "change",
  "blur"
].forEach((eventName) => {
  tournamentIdEl?.addEventListener(
    eventName,
    updateButtons
  );
});

journeyFilterEl?.addEventListener(
  "change",
  () => {
    clearSelections();
    applyFilterAndRender();
  }
);

searchEl?.addEventListener(
  "input",
  applyFilterAndRender
);

refreshBtn?.addEventListener(
  "click",
  async () => {
    clearSelections();
    await loadRoster();
  }
);

pickAllEl?.addEventListener(
  "click",
  () => {
    rowsEl
      ?.querySelectorAll(".pick")
      .forEach((checkbox) => {
        checkbox.checked = true;
      });

    setStatus(
      "All visible athletes selected.",
      true
    );
  }
);

clearAllEl?.addEventListener(
  "click",
  () => {
    clearSelections();

    setStatus(
      "Selection cleared.",
      true
    );
  }
);

battleBtn?.addEventListener(
  "click",
  () => {
    bulkGive(
      "battle",
      "+15 Weekend Battle"
    );
  }
);

podiumBtn?.addEventListener(
  "click",
  () => {
    bulkGive(
      "podium",
      "+5 Podium"
    );
  }
);

secondDivisionBtn?.addEventListener(
  "click",
  () => {
    bulkGive(
      "secondDivision",
      "+5 Second Division"
    );
  }
);

sportsmanshipBtn?.addEventListener(
  "click",
  () => {
    bulkGive(
      "sportsmanship",
      "−5 Sportsmanship"
    );
  }
);

/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeArena() {
  readTournamentHandoff();
  updateButtons();
  await loadRoster();
}

await initializeArena();

console.log(
  "weekend-arena.js loaded",
  {
    tournamentMode,
    currentTournamentId,
    program: selectedProgram(),
    tournamentAthleteCount:
      tournamentAthleteIds.size
  }
);

window.__weekend_arena_loaded = true;