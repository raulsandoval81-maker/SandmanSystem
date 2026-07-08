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
import { LADDER_F4, LADDER_F8 } from "/assets/js/ladder.service.js";

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
const trackF8OnlyEl = document.getElementById("trackF8Only");

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
const btnStr10   = document.getElementById("btnStr10");
const btnStr5    = document.getElementById("btnStr5");
const btnHon10   = document.getElementById("btnHon10");
const btnHon5    = document.getElementById("btnHon5");


const ALL_PILLS = [
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

function setStatus(msg) {
  if (pageStatusEl) pageStatusEl.textContent = msg;
}

function rosterStatusOf(a = {}) {
  return String(a.rosterStatus || "current");
}

function wantedTrackBase() {
  return trackF8OnlyEl && trackF8OnlyEl.checked ? "F8" : "F4";
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
  const rankName = a.rankName || a.tierName;
  const ladder = base === "F8" ? LADDER_F8 : LADDER_F4;
  const tier = ladder.find((t) => t.name === rankName);

  return Number(
    tier?.cap ??
    a.xpCap ??
    a.cap ??
    a.tierCap ??
    (base === "F8" ? 600 : 1000)
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

  filtered = !q
    ? roster.slice()
    : roster.filter((a) => {
        const n = String(a.publicName || a.fullName || "").toLowerCase();
        const u = String(a.uidCode || a.uid || a.id || "").toLowerCase();
        const id = String(a.id || "").toLowerCase();

        return n.includes(q) || u.includes(q) || id.includes(q);
      });

  filtered = filtered.filter((a) => {
    if (wantedJourney === "all") return true;

    const journey = String(
      a.journey ||
      a.program ||
      a.track ||
      a.trackCode ||
      ""
    ).toLowerCase();

    if (wantedJourney === "z2h") {
      return journey.includes("z2h") ||
        journey.includes("foundry8") ||
        String(a.id || "").startsWith("F8_");
    }

    if (wantedJourney === "p2l") {
      return journey.includes("p2l") ||
        journey.includes("path") ||
        journey.includes("wrestling");
    }

    if (wantedJourney === "r2g") {
      return journey.includes("r2g") ||
        journey.includes("greatness") ||
        journey.includes("boxing");
    }

    if (wantedJourney === "q2m") {
      return journey.includes("q2m") ||
        journey.includes("mastery") ||
        journey.includes("mma");
    }

    return true;
  });


  filtered.sort((a, b) => {
    const an = String(a.publicName || a.fullName || a.uidCode || a.uid || a.id || "");
    const bn = String(b.publicName || b.fullName || b.uidCode || b.uid || b.id || "");
    return an.localeCompare(bn);
  });

render(filtered);

const journeyLabels = {
  all: "All Journeys",
  z2h: "Zero2Hero",
  p2l: "Path2Legend",
  r2g: "Road2Greatness",
  q2m: "Quest2Mastery"
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
    setStatus("No approved attendance ready for Daily Grind.");
    return;
  }

  const session = snap.docs[0].data() || {};
  const presentIds = Array.isArray(session.presentIds)
    ? session.presentIds
    : [];

  if (!presentIds.length) {
    setStatus("Approved attendance has no athletes.");
    return;
  }

  filtered = roster.filter((a) =>
    presentIds.includes(a.id)
  );

  render(filtered);

  await updateDoc(
  doc(db, "attendance_sessions", snap.docs[0].id),
  {
    readyForDailyGrind: false
  }
);

  setStatus(`Daily Grind loaded ${filtered.length} approved athlete(s).`);
}

function subscribe() {
  if (unsub) {
    unsub();
    unsub = null;
  }

  const wantedBase = wantedTrackBase();

  setStatus(`Loading athletes… ${wantedBase}`);

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

      loadApprovedAttendance();
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

  ALL_PILLS.forEach((b) => setPillVisible(b, false));

  if (lane === "combat") {
    setPillVisible(btnGrind10, true);
    setPillVisible(btnGrind5, true);
    if (awardHintEl) awardHintEl.textContent = "Pick an award. Combat lane only.";
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
        source: "daily-grind"
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

bindPill(btnGrind10);
bindPill(btnGrind5);
bindPill(btnStr10);
bindPill(btnStr5);
bindPill(btnHon10);
bindPill(btnHon5);

console.log("daily-grind.js loaded");
window.__daily_loaded = true;