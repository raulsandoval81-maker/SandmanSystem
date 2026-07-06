// public/coaches/daily-xp/daily-grind.js

import {
  db,
  collection,
  onSnapshot,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import { XP_URL } from "/assets/js/coach-endpoints.js";
import { renderDigitalBelt } from "/assets/js/digital-belt.js";
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

function repaintMiniBarForRow({ rowEl, athlete, xp, cap, tierName, rankName }) {
  const slot = rowEl?.querySelector?.(".xp-slot");
  if (!slot) return;

  const ladder = baseFromAthlete(athlete) === "F8" ? LADDER_F8 : LADDER_F4;
  const tier = ladder.find((t) => t.name === rankName) || ladder[0];

  const xpNow = Number(xp ?? 0);
  const xpCap = Number(cap ?? tier.cap);
  const stripeMax = Number(tier.stripes ?? 4);
  const stripeSize = Number(tier.stripe ?? (xpCap / stripeMax));

  const calculatedStripes = Math.min(
    stripeMax,
    Math.floor(xpNow / stripeSize)
  );

  const finalStripes = Math.max(
    Number(athlete.stripeCount ?? 0),
    calculatedStripes
  );

const colorMapByJourney = {
  z2h: {
    Shadow: "belt-white-gray",
    Recruit: "belt-yellow-gray",
    Competitor: "belt-orange-gray",
    Contender: "belt-green-gray",
    Warrior: "belt-blue-gray",
    Champion: "belt-purple-gray",
    Commander: "belt-brown-gray",
    Hero: "belt-black-gray"
  },

  p2l: {
    Apprentice: "belt-white",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Veteran: "belt-brown",
    Legend: "belt-black"
  },

  r2g: {
    Apprentice: "belt-gray",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Veteran: "belt-brown",
    Craftsman: "belt-black"
  },

  q2m: {
    Apprentice: "belt-gray",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Veteran: "belt-brown",
    Master: "belt-black"
  }
};

  const base = baseFromAthlete(athlete);

  const colorClass =
    base === "F8"
      ? colorMapF8[rankName] || "belt-white"
      : colorMapF4[rankName] || "belt-white";

  slot.innerHTML = renderDigitalBelt({
    colorClass,
    stripes: finalStripes,
    size: "small"
  });
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

  const byId = new Map(list.map((a) => [a.id, a]));

  rowsEl.innerHTML = list.map((a) => {
    const uid = a.uidCode || a.uid || a.id;
    const name = a.publicName || a.fullName || uid;
    const track = a.trackCode || a.track || "—";
    const tier = a.rankName || a.tierName || a.tier || "Apprentice";
    const xp = a.xp ?? 0;
    const cap = xpCapForAthlete(a);

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
          <div class="xp-slot"></div>
          <div class="row-xp-meta" data-xpline="${a.id}">
            ${xp} / ${cap}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  rowsEl.querySelectorAll("tr[data-id]").forEach((tr) => {
    const a = byId.get(tr.dataset.id);
    if (!a) return;

    repaintMiniBarForRow({
      rowEl: tr,
      athlete: a,
      xp: a.xp ?? 0,
      cap: xpCapForAthlete(a),
      tierName: a.rankName || a.tierName || a.tier || "Apprentice",
      rankName: a.rankName
    });
  });

  updateSessionBar();
}

function applyFilterAndRender() {
  const q = String(searchEl?.value || "").toLowerCase().trim();
  const wantedBase = wantedTrackBase();

  filtered = !q
    ? roster.slice()
    : roster.filter((a) => {
        const n = String(a.publicName || a.fullName || "").toLowerCase();
        const u = String(a.uidCode || a.uid || a.id || "").toLowerCase();
        const id = String(a.id || "").toLowerCase();

        return n.includes(q) || u.includes(q) || id.includes(q);
      });

  filtered = filtered.filter((a) => baseFromAthlete(a) === wantedBase);

  filtered.sort((a, b) => {
    const an = String(a.publicName || a.fullName || a.uidCode || a.uid || a.id || "");
    const bn = String(b.publicName || b.fullName || b.uidCode || b.uid || b.id || "");
    return an.localeCompare(bn);
  });

  render(filtered);
  setStatus(`Ready · ${wantedBase}`);
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

      applyFilterAndRender();
      setStatus(`Ready · ${wantedBase}`);
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

          repaintMiniBarForRow({
            rowEl: row,
            athlete: a,
            xp: a.xp ?? 0,
            cap,
            tierName: a.rankName || a.tierName || a.tier || "Apprentice",
            rankName: a.rankName
          });
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

searchEl?.addEventListener("input", applyFilterAndRender);
pickAllEl?.addEventListener("click", () => setAllPicks(true));
clearAllEl?.addEventListener("click", () => setAllPicks(false));

trackF8OnlyEl?.addEventListener("change", () => {
  setAllPicks(false);
  subscribe();
});

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