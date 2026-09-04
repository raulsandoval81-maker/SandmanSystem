// public/coaches/daily-xp/daily-grind.js

import {
  db,
  collection,
  onSnapshot,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  updateDoc,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import { XP_URL } from "/assets/js/coach-endpoints.js";
import { LADDER_F4, LADDER_F8, canonicalF8XpCap } from "/assets/js/ladder.service.js";

console.log("XP_URL =", XP_URL);

await ensureSignedIn();

window.addEventListener("error", (e) => {
  const el = document.getElementById("pageStatus");
  if (el) el.textContent = "JS ERROR: " + (e?.message || "unknown");
});

window.addEventListener("unhandledrejection", (e) => {
  const el = document.getElementById("pageStatus");
  const msg = e?.reason?.message || String(e?.reason || "unknown");
  if (el) el.textContent = "PROMISE ERROR: " + msg;
});

const rowsEl = document.getElementById("rows");
const pageStatusEl = document.getElementById("pageStatus");
const journeyFilterEl = document.getElementById("journeyFilter");

const searchEl = document.getElementById("search");
const pickAllEl = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

const laneEl = document.getElementById("xpLane");
const modeEl = document.getElementById("xpMode");
const awardHintEl = document.getElementById("awardHint");

const sessionBar = document.getElementById("sessionBar");
const sbLoaded = document.getElementById("sb-loaded");
const sbAwarded = document.getElementById("sb-awarded");
const sbXP = document.getElementById("sb-xp");

const refreshBtn = document.getElementById("refreshBtn");

const btnGrind10 = document.getElementById("btnGrind10");
const btnGrind5  = document.getElementById("btnGrind5");

function ensureCombatAwardButton({
  id,
  award,
  label,
  anchor
}) {
  const existing = document.getElementById(id);
  if (existing) return existing;

  if (!anchor?.parentElement) return null;

  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = anchor.className;
  button.dataset.award = award;
  button.textContent = label;

  anchor.parentElement.insertBefore(
    button,
    anchor.nextSibling
  );

  return button;
}

const btnGrind15 = ensureCombatAwardButton({
  id: "btnGrind15",
  award: "GRIND_15",
  label: "+15 Full-Time",
  anchor: btnGrind10
});

const btnGrind20 = ensureCombatAwardButton({
  id: "btnGrind20",
  award: "GRIND_20",
  label: "+20 Full-Time",
  anchor: btnGrind15 || btnGrind10
});

const btnStr10   = document.getElementById("btnStr10");
const btnStr5    = document.getElementById("btnStr5");
const btnHon10   = document.getElementById("btnHon10");
const btnHon5    = document.getElementById("btnHon5");


const ALL_PILLS = [
  btnGrind20,
  btnGrind15,
  btnGrind10,
  btnGrind5,
  btnStr10,
  btnStr5,
  btnHon10,
  btnHon5
].filter(Boolean);

let roster = [];
let filtered = [];
let awardedCount = 0;
let awardedXP = 0;
let unsub = null;
let isSaving = false;

let activeAttendanceSession = {
  id: "",
  schema: "",
  durationMinutes: 60,
  xpTimeScale: "standard",
  academyId: "",
  roomId: "",
  sessionId: ""
};

function normalizeDurationMinutes(value, schema = "") {
  const direct = Number(value);

  if ([45, 60, 90, 120].includes(direct)) {
    return direct;
  }

  const match = String(schema || "")
    .toLowerCase()
    .match(/(?:^|[-_])(45|60|90|120)(?:$|[-_])/);

  if (match) {
    return Number(match[1]);
  }

  const fallback = Number(
    localStorage.getItem(
      "sandman_session_duration_minutes"
    )
  );

  return [45, 60, 90, 120].includes(fallback)
    ? fallback
    : 60;
}

function xpTimeScaleForDuration(durationMinutes) {
  if (durationMinutes >= 120) return "two-hour";
  if (durationMinutes >= 90) return "ninety-minute";
  return "standard";
}

function sessionDurationLabel() {
  const minutes =
    Number(activeAttendanceSession.durationMinutes || 60);

  return `${minutes}-minute session`;
}

function setStatus(msg) {
  if (pageStatusEl) pageStatusEl.textContent = msg;
}

function rosterStatusOf(a = {}) {
  return String(a.rosterStatus || "current");
}


function baseFromAthlete(a) {
  const tb = String(a?.trackBase || "").trim().toUpperCase();
  if (tb === "F4" || tb === "F8") return tb;

  const id = String(a?.id || a?.uid || "").toUpperCase();
  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";

  const t = String(a?.track || a?.trackCode || a?.program || "").toLowerCase();
  if (t.includes("foundry8")) return "F8";
  if (t.includes("foundry4")) return "F4";

  return "F4";
}

function xpCapForAthlete(a = {}) {
  const base = baseFromAthlete(a);
  if (base === "F8") return canonicalF8XpCap(a);
  const rankName = a.rankName || a.tierName;
  const ladder = base === "F8" ? LADDER_F8 : LADDER_F4;
  const tier = ladder.find((t) => t.name === rankName);

  return Number(
    tier?.cap ??
    a.xpCap ??
    a.cap ??
    a.tierCap ??
    (base === "F8" ? 800 : 1000)
  );
}

function setAllPicks(checked) {
  if (!rowsEl) return;
  rowsEl.querySelectorAll(".pick").forEach((cb) => {
    cb.checked = checked;
  });
}

function selectedAthleteIds() {
  if (!rowsEl) return [];

  return Array.from(rowsEl.querySelectorAll(".pick:checked"))
    .map((el) => el.getAttribute("data-id"))
    .filter(Boolean);
}

function athleteById(id) {
  return roster.find((a) => a.id === id);
}

function updateSessionBar() {
  if (!sessionBar) return;

  if (!filtered.length) {
    sessionBar.style.display = "none";
    return;
  }

  sessionBar.style.display = "flex";

  if (sbLoaded) {
    sbLoaded.textContent = `Loaded: ${filtered.length}`;
  }

  if (sbAwarded) {
    sbAwarded.textContent = `Awarded this session: ${awardedCount}`;
  }

  if (sbXP) {
    sbXP.textContent = `XP issued: ${awardedXP}`;
  }
}


function render(list) {
  if (!rowsEl) return;

  if (!list.length) {
    rowsEl.innerHTML = `
      <tr>
        <td colspan="4" class="muted">No athletes match.</td>
      </tr>
    `;
    updateSessionBar();
    return;
  }


  rowsEl.innerHTML = list.map((a) => {
    const uid = a.uidCode || a.uid || a.id;
    const name = a.publicName || a.fullName || uid;
    const track = a.trackCode || a.track || "—";
    const tier = a.rankName || a.tierName || a.tier || "Apprentice";
    const xp = a.xp ?? 0;
    const cap = xpCapForAthlete(a);
    const stripes = Number(a.stripeCount ?? a.stripes ?? 0);

const stars =
  "★".repeat(stripes) +
  "☆".repeat(4 - stripes);
    return `
      <tr data-id="${a.id}">
        <td>
          <input type="checkbox" class="pick" data-id="${a.id}" />
        </td>

        <td>
          <div class="ath-name">${name}</div>
          <div class="sub">${uid}</div>
        </td>

        <td>${tier} / ${track}</td>

<td>
  <div class="coach-xp-card">
    <div><strong>Combat:</strong> ${xp} / ${cap}</div>
    <div><strong>Strength:</strong> ${a.strengthXp ?? 0} / 120</div>
    <div><strong>Honor:</strong> ${a.honorXp ?? 0} / 120</div>
    <div><strong>Stripes:</strong> ${stars}</div>
    <div><strong>Attendance:</strong> ${a.attendanceStatus ?? "Active"}</div>
  </div>
</td>
        </tr>
    `;
  }).join("");

  updateSessionBar();
}

function applyFilterAndRender() {
  const q = String(searchEl?.value || "").toLowerCase().trim();
  const wantedJourney = String(journeyFilterEl?.value || "all").toLowerCase();

  if (wantedJourney === "all") {
    filtered = [];
    render(filtered);
    setStatus("Select a journey to begin.");
    return;
  }

  filtered = !q
    ? roster.slice()
    : roster.filter((a) => {
        const n = String(a.publicName || a.fullName || "").toLowerCase();
        const u = String(a.uidCode || a.uid || a.id || "").toLowerCase();
        const id = String(a.id || "").toLowerCase();

        return n.includes(q) || u.includes(q) || id.includes(q);
      });

  filtered = filtered.filter((a) => {
    const journey = String(
      a.journey ||
      a.ladderKey ||
      a.program ||
      a.programTrack ||
      ""
    ).toLowerCase();

    const discipline = String(
      a.discipline ||
      a.primaryDiscipline ||
      a.sport ||
      a.art ||
      a.track ||
      a.trackCode ||
      ""
    ).toLowerCase();

    const athleteId = String(a.id || "").toUpperCase();

    const isZ2H =
      journey.includes("z2h") ||
      journey.includes("zero2hero") ||
      journey.includes("foundry8") ||
      athleteId.startsWith("F8_");

    const isP2L =
      journey.includes("p2l") ||
      journey.includes("path2legend") ||
      journey.includes("path-to-legend");

    const isQ2M =
      journey.includes("q2m") ||
      journey.includes("quest2mastery") ||
      journey.includes("quest-to-mastery") ||
      journey.includes("mastery");

    const isWrestling =
      discipline.includes("wrest");

    const isBoxing =
      discipline.includes("box");

    const isKickboxing =
      discipline.includes("kick");

    const isMma =
      discipline.includes("mma") ||
      discipline.includes("mixed martial");

    if (wantedJourney === "z2h-wrestling") {
      return isZ2H && isWrestling;
    }

    if (wantedJourney === "z2h-kickboxing") {
      return isZ2H && isKickboxing;
    }

    if (wantedJourney === "p2l-wrestling") {
      return isP2L && isWrestling;
    }

    if (wantedJourney === "p2l-boxing") {
      return isP2L && isBoxing;
    }

    if (wantedJourney === "q2m-mma") {
      return isQ2M && isMma;
    }

    return false;
  });


  filtered.sort((a, b) => {
    const an = String(a.publicName || a.fullName || a.uidCode || a.uid || a.id || "");
    const bn = String(b.publicName || b.fullName || b.uidCode || b.uid || b.id || "");
    return an.localeCompare(bn);
  });

render(filtered);

const journeyLabels = {
  all: "Select Program",
  "z2h-wrestling": "Zero2Hero · Wrestling",
  "z2h-kickboxing": "Zero2Hero · Kickboxing",
  "p2l-wrestling": "Path2Legend · Wrestling",
  "p2l-boxing": "Path2Legend · Boxing",
  "q2m-mma": "Quest2Mastery · MMA"
};

setStatus(`Ready · ${journeyLabels[wantedJourney] || wantedJourney}`);

}

async function loadApprovedAttendance() {
  const snap = await getDocs(
    query(
      collection(db, "attendance_sessions"),
      where("status", "==", "finalized"),
      where("readyForDailyGrind", "==", true),
      orderBy("finalizedAt", "desc"),
      limit(1)
    )
  );

  if (snap.empty) {
    return false;
  }

  const sessionDoc = snap.docs[0];
  const session = sessionDoc.data() || {};

  const durationMinutes = normalizeDurationMinutes(
    session.durationMinutes,
    session.schema
  );

  activeAttendanceSession = {
    id: sessionDoc.id,
    schema: String(session.schema || ""),
    durationMinutes,
    xpTimeScale:
      session.xpTimeScale ||
      xpTimeScaleForDuration(durationMinutes),
    academyId: String(session.academyId || ""),
    roomId: String(session.roomId || ""),
    sessionId: String(
      session.sessionId ||
      session.liveSessionId ||
      sessionDoc.id
    )
  };

  const presentIds = Array.isArray(session.presentIds)
    ? session.presentIds
    : [];

  if (!presentIds.length) {
    setStatus("Approved attendance has no athletes.");
    return true;
  }

  filtered = roster.filter((a) =>
    presentIds.includes(a.id)
  );

  render(filtered);

  syncPillsToLane();

  await updateDoc(
    doc(db, "attendance_sessions", sessionDoc.id),
    {
      readyForDailyGrind: false
    }
  );

  setStatus(
    `Daily Grind loaded ${filtered.length} approved athlete(s) · ` +
    `${durationMinutes} minutes`
  );

  return true;
}

async function initializeDailyGrind() {
  const loadedSession = await loadApprovedAttendance();

  if (loadedSession) {
    return;
  }

  applyFilterAndRender();
}

function subscribe() {
  if (unsub) {
    unsub();
    unsub = null;
  }

  setStatus("Loading athletes…");

  const colRef = collection(db, "athletes");

  unsub = onSnapshot(
    colRef,
    (snap) => {
      roster = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      roster = roster.filter((a) => {
        return rosterStatusOf(a) === "current";
      });

      initializeDailyGrind();
    },
    (err) => {
      console.error(err);
      setStatus("Athlete load failed. See console.");
    }
  );
}

function setPillVisible(btn, on) {
  if (!btn) return;
  btn.style.display = on ? "" : "none";
}

function syncPillsToLane() {
  const lane = String(laneEl?.value || "combat").toLowerCase();
  const page = document.querySelector(".daily-xp-page");

  if (page) {
    page.dataset.xpLane = lane;
  }

  ALL_PILLS.forEach((b) => setPillVisible(b, false));

  if (lane === "combat") {
    const duration =
      Number(activeAttendanceSession.durationMinutes || 60);

    if (duration >= 120) {
      setPillVisible(btnGrind20, true);
      setPillVisible(btnGrind10, true);

      if (awardHintEl) {
        awardHintEl.textContent =
          `${sessionDurationLabel()} · +10 part-time / +20 full-time`;
      }

      return;
    }

    if (duration >= 90) {
      setPillVisible(btnGrind15, true);
      setPillVisible(btnGrind10, true);
      setPillVisible(btnGrind5, true);

      if (awardHintEl) {
        awardHintEl.textContent =
          `${sessionDurationLabel()} · +5 limited / +10 part-time / +15 full-time`;
      }

      return;
    }

    setPillVisible(btnGrind10, true);
    setPillVisible(btnGrind5, true);

    if (awardHintEl) {
      awardHintEl.textContent =
        `${sessionDurationLabel()} · +5 part-time / +10 full-time`;
    }

    return;
  }

  if (lane === "strength") {
    setPillVisible(btnStr10, true);
    setPillVisible(btnStr5, true);
    if (awardHintEl) awardHintEl.textContent = "Pick an award. Strength lane only.";
    return;
  }

  if (lane === "honor") {
    setPillVisible(btnHon10, true);
    setPillVisible(btnHon5, true);
    if (awardHintEl) awardHintEl.textContent = "Pick an award. Honor lane only.";
    return;
  }

  setPillVisible(btnGrind10, true);
  setPillVisible(btnGrind5, true);
}

const AWARDS = Object.freeze({
  GRIND_20: {
    label: "+20 Daily Grind — Two-Hour Full-Time Work",
    kind: "DAILY_GRIND",
    amount: 20
  },

  GRIND_15: {
    label: "+15 Daily Grind — Double Shift",
    kind: "DAILY_GRIND",
    amount: 15
  },

  GRIND_10: {
    label: "+10 Daily Grind — Full-Time Work",
    kind: "DAILY_GRIND",
    amount: 10
  },

  GRIND_5: {
    label: "+5 Daily Grind — Part-Time Work",
    kind: "DAILY_GRIND",
    amount: 5
  },

  STR_10: {
    label: "+10 Strength",
    kind: "STRENGTH",
    amount: 10
  },

  STR_5: {
    label: "+5 Strength",
    kind: "STRENGTH",
    amount: 5
  },

  HON_10: {
    label: "+10 Honor",
    kind: "HONOR",
    amount: 10
  },

  HON_5: {
    label: "+5 Honor",
    kind: "HONOR",
    amount: 5
  }
});

function autoAmountForAthlete(a, chosenAmount, awardKind) {
  const base = baseFromAthlete(a);

  if (base === "F8" && (awardKind === "STRENGTH" || awardKind === "HONOR")) {
    return 5;
  }

  return chosenAmount;
}

function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}

async function issueAwardForSelection(award) {
  const ids = selectedAthleteIds();

  if (!ids.length) {
    setStatus("Step 2: pick at least one athlete.");
    return;
  }

  if (isSaving) return;
  isSaving = true;

  const mode = String(modeEl?.value || "auto").toLowerCase();

  ALL_PILLS.forEach((b) => {
    b.disabled = true;
  });

  setStatus(`Issuing… (${ids.length})`);

  let okCount = 0;
  let xpTotal = 0;

  for (const id of ids) {
    const a = athleteById(id);
    if (!a) continue;

    const uid = a.uidCode || a.uid || a.id;

    const amt =
      mode === "auto"
        ? autoAmountForAthlete(a, award.amount, award.kind)
        : award.amount;

    const lane = String(laneEl?.value || "combat").toLowerCase();

    const payload = {
      uid,
      kind: award.kind,
      amount: amt,
      lane,
      meta: {
        lane,
        source: "daily-grind",
        attendanceSessionId:
          activeAttendanceSession.id,
        sessionId:
          activeAttendanceSession.sessionId,
        schema:
          activeAttendanceSession.schema,
        durationMinutes:
          activeAttendanceSession.durationMinutes,
        xpTimeScale:
          activeAttendanceSession.xpTimeScale,
        academyId:
          activeAttendanceSession.academyId,
        roomId:
          activeAttendanceSession.roomId
      }
    };

    console.log("XP SEND →", {
      uid,
      kind: award.kind,
      amount: amt,
      lane
    });

    try {
      const coachUid =
        window.COACH_UID ||
        localStorage.getItem("coachUid") ||
        "DEV_COACH";

      const res = await fetch(XP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-coach-uid": String(coachUid).trim()
        },
        body: JSON.stringify({
          data: payload
        })
      });

      const text = await res.text().catch(() => "");

      if (!res.ok) {
        console.log("XP ERR:", res.status, text);
        setStatus(`HTTP ${res.status}${text ? " · " + text : ""}`);
        continue;
      }

      console.log("XP OK:", res.status, text);

      let raw = null;
      try {
        raw = text ? JSON.parse(text) : null;
      } catch {}

      const data = parseFunctionJson(raw) || {};

      if (data.ok) {
        okCount += 1;

        const delta = Number(data.delta ?? amt);
        xpTotal += delta;

        const after =
          typeof data.afterXp === "number"
            ? data.afterXp
            : typeof data.afterXP === "number"
              ? data.afterXP
              : null;

        if (typeof after === "number") {
          a.xp = after;
        }

        if (typeof data.afterCap === "number") {
          a.xpCap = data.afterCap;
        }

        if (data.afterRankName) {
          a.rankName = data.afterRankName;
        }

        if (data.afterTierName) {
          a.tierName = data.afterTierName;
        }

        const row = rowsEl?.querySelector?.(`tr[data-id="${id}"]`);

        if (row) {
          const cap = xpCapForAthlete(a);
          const line = row.querySelector(`[data-xpline="${id}"]`);

          if (line) {
            line.textContent = `${a.xp ?? 0} / ${cap}`;
          }

        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Call failed. See console.");
    }
  }

  awardedCount += okCount;
  awardedXP += xpTotal;

  updateSessionBar();

  setStatus(`Done. Success: ${okCount}/${ids.length} · XP issued: ${xpTotal}`);

  ALL_PILLS.forEach((b) => {
    b.disabled = false;
  });

  isSaving = false;
}

function bindPill(btn) {
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const key = btn.getAttribute("data-award");
    const award = AWARDS[key];

    if (!award) {
      setStatus("Invalid award button.");
      return;
    }

    await issueAwardForSelection(award);
  });
}

journeyFilterEl?.addEventListener("change", () => {
  setAllPicks(false);
  applyFilterAndRender();
});

searchEl?.addEventListener("input", applyFilterAndRender);
pickAllEl?.addEventListener("click", () => setAllPicks(true));
clearAllEl?.addEventListener("click", () => setAllPicks(false));

refreshBtn?.addEventListener("click", () => {
  setAllPicks(false);
  subscribe();
});

laneEl?.addEventListener("change", syncPillsToLane);

syncPillsToLane();
subscribe();

bindPill(btnGrind20);
bindPill(btnGrind15);
bindPill(btnGrind10);
bindPill(btnGrind5);
bindPill(btnStr10);
bindPill(btnStr5);
bindPill(btnHon10);
bindPill(btnHon5);

console.log("daily-grind.js loaded");
window.__daily_loaded = true;
