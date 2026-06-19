// public/coaches/arena-xp/duel-arena.js
import "/coaches/_ui/dev-boot.js";

import { db, collection, getDocs } from "/assets/js/firebase-init.js";
import { XP_URL } from "/assets/js/coach-endpoints.js";
import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import { LADDER_F4, LADDER_F8 } from "/assets/js/ladder.service.js";
import {
  isDevMode,
  paintDevUi,
  bindDevToggle,
  patchDevLinks,
} from "/assets/js/dev-mode.js";

/* -----------------------------
   DEV UI
----------------------------- */
document.body.classList.toggle("dev-on", isDevMode());
paintDevUi({ toggleId: "devModeToggle" });
patchDevLinks();
bindDevToggle({
  toggleId: "devModeToggle",
  onChange: () => location.reload(),
});

/* -----------------------------
   DOM
----------------------------- */
const rowsEl = document.getElementById("rows");
const statusEl = document.getElementById("status");

const tourEl = document.getElementById("tournamentId");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refreshBtn");

const pickAllEl = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

const battleAllEl =
  document.getElementById("battleAll") ||
  document.getElementById("fullAll");

const forfeitAllEl =
  document.getElementById("forfeitAll");

const noOppAllEl =
  document.getElementById("noOppAll");

const iqAllEl =
  document.getElementById("iqAll") ||
  document.getElementById("styleAll");

const sportsmanshipAllEl =
  document.getElementById("sportsmanshipAll");

const iqSelectEl = document.getElementById("iqSelect");

const sessionBar = document.getElementById("sessionBar");
const sbLoaded = document.getElementById("sb-loaded");
const sbAwarded = document.getElementById("sb-awarded");
const sbXP = document.getElementById("sb-xp");
const sbReceipts = document.getElementById("sb-receipts");

const trackF8OnlyEl = document.getElementById("trackF8Only");

/* -----------------------------
   State
----------------------------- */
let roster = [];
let filtered = [];

let currentTournamentId = "";
let awardedCount = 0;
let awardedXP = 0;
let receipts = 0;
let isSaving = false;

/* -----------------------------
   Helpers
----------------------------- */
function setStatus(msg, ok = true) {
  if (!statusEl) return;

  statusEl.textContent = msg;
  statusEl.style.color = ok ? "#bef264" : "#fca5a5";

  setTimeout(() => {
    if (statusEl) statusEl.style.color = "";
  }, 1200);
}

function syncTournament() {
  currentTournamentId = String(tourEl?.value || "").trim();
}

function trackWanted() {
  return trackF8OnlyEl?.checked ? "F8" : "F4";
}

function trackBaseOf(docId, a = {}) {
  const tb = String(a.trackBase || "").trim().toUpperCase();

  if (tb === "F4" || tb === "F8") return tb;

  const id = String(docId || a.uid || "").toUpperCase();

  if (id.startsWith("F4_")) return "F4";
  if (id.startsWith("F8_")) return "F8";

  const t = String(a.track || a.trackCode || "").toLowerCase();

  if (t.includes("foundry4")) return "F4";
  if (t.includes("foundry8")) return "F8";

  return "";
}

function baseFromAthlete(a = {}) {
  return trackBaseOf(a.id, a) || "F4";
}

function resolveRank(a = {}) {
  if (a.rankName) return a.rankName;
  if (a.tierName) return a.tierName;

  const base = trackBaseOf(a.id, a);
  const t = String(a.tier || "").toUpperCase();

  if (base === "F8") {
    const map = {
      T0: "Shadow",
      T1: "Recruit",
      T2: "Combatant",
      T3: "Competitor",
      T4: "Warrior",
      T5: "Champion",
      T6: "Commander",
      T7: "Hero",
    };

    return map[t] || "Shadow";
  }

  const map = {
    T0: "Apprentice",
    T1: "Warrior",
    T2: "Champion",
    T3: "Veteran",
    T4: "Legend",
  };

  return map[t] || "Apprentice";
}

function xpCapForAthlete(a = {}) {
  const base = trackBaseOf(a.id, a);
  const rankName = resolveRank(a);

  const ladder = base === "F8" ? LADDER_F8 : LADDER_F4;
  const tier = ladder.find((t) => t.name === rankName);

  return Number(
    tier?.cap ??
      a.xpCap ??
      a.cap ??
      a.tierCap ??
      (baseFromAthlete(a) === "F8" ? 600 : 1000)
  );
}

function updateSessionBar() {
  if (!sessionBar) return;

  if (!filtered.length) {
    sessionBar.style.display = "none";
    return;
  }

  sessionBar.style.display = "flex";

  if (sbLoaded) sbLoaded.textContent = `Loaded: ${filtered.length}`;
  if (sbAwarded) sbAwarded.textContent = `Awarded this session: ${awardedCount}`;
  if (sbXP) sbXP.textContent = `XP issued: ${awardedXP}`;
  if (sbReceipts) sbReceipts.textContent = receipts ? `Receipts: ${receipts}` : "";
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll(".pick:checked"))
    .map((c) => c.dataset.id)
    .filter(Boolean);
}

function repaintMiniBarForRow({ rowEl, athlete, xp, cap, rankName }) {
  const slot = rowEl?.querySelector?.(".xp-slot");
  if (!slot) return;

  const ladder = baseFromAthlete(athlete) === "F8" ? LADDER_F8 : LADDER_F4;
  const tier = ladder.find((t) => t.name === rankName) || ladder[0];

  const xpNow = Number(xp ?? 0);
  const xpCap = Number(cap ?? tier.cap);
  const stripeMax = Number(tier.stripes ?? 4);
  const stripeSize = Number(tier.stripe ?? xpCap / stripeMax);

  const calculatedStripes = Math.min(
    stripeMax,
    Math.floor(xpNow / stripeSize)
  );

  const finalStripes = Math.max(
    Number(athlete.stripeCount ?? 0),
    calculatedStripes
  );

  const colorMapF4 = {
    Apprentice: "belt-white",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Veteran: "belt-brown",
    Legend: "belt-black",
  };

  const colorMapF8 = {
    Shadow: "belt-white",
    Recruit: "belt-yellow",
    Combatant: "belt-orange",
    Competitor: "belt-green",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Commander: "belt-brown",
    Hero: "belt-black",
  };

  const base = baseFromAthlete(athlete);

  const colorClass =
    base === "F8"
      ? colorMapF8[rankName] || "belt-white"
      : colorMapF4[rankName] || "belt-white";

  slot.innerHTML = renderDigitalBelt({
    colorClass,
    stripes: finalStripes,
    size: "small",
  });
}

/* -----------------------------
   Render
----------------------------- */
function render(list) {
  if (!rowsEl) return;

  if (!list.length) {
    rowsEl.innerHTML =
      `<tr><td colspan="4" class="muted">No athletes match.</td></tr>`;

    updateSessionBar();
    return;
  }

  const byId = new Map(list.map((a) => [a.id, a]));

  rowsEl.innerHTML = list
    .map((a) => {
      const uid = a.uid || a.id;
      const name = a.publicName || a.fullName || uid;
      const track = a.track || a.trackCode || "—";
      const rank = resolveRank(a);
      const xp = a.xp ?? 0;
      const cap = xpCapForAthlete(a);

      return `
        <tr data-id="${a.id}">
          <td>
            <input type="checkbox" class="pick" data-id="${a.id}">
          </td>

          <td>
            <div class="ath-name">${name}</div>
            <div class="sub">${uid}</div>
          </td>

          <td>${rank} / ${track}</td>

          <td>
            <div class="xp-slot"></div>
            <div class="sub" data-xpline="${a.id}">${xp} / ${cap}</div>
          </td>
        </tr>
      `;
    })
    .join("");

  rowsEl.querySelectorAll("tr[data-id]").forEach((tr) => {
    const a = byId.get(tr.dataset.id);
    if (!a) return;

    const rank = resolveRank(a);

    repaintMiniBarForRow({
      rowEl: tr,
      athlete: a,
      xp: a.xp ?? 0,
      cap: xpCapForAthlete(a),
      rankName: rank,
    });
  });

  updateSessionBar();
}

/* -----------------------------
   Load roster
----------------------------- */
async function load() {
  syncTournament();

  setStatus("Loading athletes…", true);

  const snap = await getDocs(collection(db, "athletes"));

  roster = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const dev = isDevMode();
  const wanted = trackWanted();

  roster = roster.filter((a) => {
    const status = a.rosterStatus || "current";

    if (status !== "current") return false;

    if (dev) return true;

    if (a.isDev === true || a.devMode === true || a.isTest === true) {
      return false;
    }

    return true;
  });

  roster = roster.filter((a) => trackBaseOf(a.id, a) === wanted);

  const q = String(searchEl?.value || "").toLowerCase().trim();

  filtered = roster
    .filter((a) => {
      if (!q) return true;

      const name = String(a.publicName || a.fullName || "").toLowerCase();
      const uid = String(a.uid || a.id || "").toLowerCase();

      return name.includes(q) || uid.includes(q);
    })
    .sort((a, b) => {
      const an = String(a.publicName || a.fullName || a.uid || a.id || "");
      const bn = String(b.publicName || b.fullName || b.uid || b.id || "");

      return an.localeCompare(bn);
    });

  render(filtered);
  updateButtons();

  setStatus(
    `${filtered.length} athletes loaded. (${dev ? "DEV" : "LIVE"} · ${wanted})`,
    true
  );
}

/* -----------------------------
   Buttons
----------------------------- */
function updateButtons() {
  syncTournament();

  const hasEventId = !!currentTournamentId;
  const hasIQ = !!String(iqSelectEl?.value || "").trim();
  const locked = isSaving;

  if (battleAllEl) battleAllEl.disabled = !hasEventId || locked;
  if (forfeitAllEl) forfeitAllEl.disabled = !hasEventId || locked;
  if (noOppAllEl) noOppAllEl.disabled = !hasEventId || locked;
  if (iqAllEl) iqAllEl.disabled = !(hasEventId && hasIQ) || locked;
  if (sportsmanshipAllEl) sportsmanshipAllEl.disabled = !hasEventId || locked;
}

/* -----------------------------
   Award Mapping
----------------------------- */
function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}

function mapArenaAward(kind) {
  if (kind === "battle") {
    return {
      serverKind: "ARENA/BATTLE",
      amount: 10,
      meta: {},
    };
  }

  if (kind === "forfeit") {
    return {
      serverKind: "ARENA/FORFEIT_WIN",
      amount: 5,
      meta: {
        duelLogic: true,
      },
    };
  }

  if (kind === "noOpp") {
    return {
      serverKind: "ARENA/NO_OPP_DAY",
      amount: 5,
      meta: {
        duelLogic: true,
        note:
          "Dual-event only. Athlete attended, made weight, warmed up, remained available, but received no match opportunity through no fault of their own.",
      },
    };
  }

  if (kind === "iq") {
    const matchIq = String(iqSelectEl?.value || "").trim();

    if (!matchIq) {
      throw new Error("Pick Match IQ first.");
    }

    return {
      serverKind: "ARENA/STYLEIQ",
      amount: 5,
      meta: {
        matchIq,
      },
    };
  }

  if (kind === "sportsmanship") {
    return {
      serverKind: "ARENA/SPORTSMANSHIP",
      amount: -5,
      meta: {},
    };
  }

  throw new Error("Unknown Duel Arena award: " + kind);
}

/* -----------------------------
   Award Flow
----------------------------- */
async function giveToOne(id, kind) {
  const a = roster.find((x) => x.id === id);

  if (!a) {
    return {
      ok: false,
      delta: 0,
      error: "Athlete not found",
    };
  }

  const row = document.querySelector(`tr[data-id="${id}"]`);

  const coachUid =
    window.COACH_UID ||
    localStorage.getItem("coachUid") ||
    "DEV_COACH";

  const mapped = mapArenaAward(kind);

  const payload = {
    uid: a.uidCode || a.uid || a.id,
    kind: mapped.serverKind,
    amount: mapped.amount,
    meta: {
      tournamentId: currentTournamentId,
      eventId: currentTournamentId,
      eventType: "duel",
      source: "duel-arena",
      track: trackWanted(),
      ...mapped.meta,
    },
  };

  const res = await fetch(XP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-coach-uid": String(coachUid).trim(),
    },
    body: JSON.stringify({ data: payload }),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.log("XP ERR:", res.status, text);

    return {
      ok: false,
      delta: 0,
      error: `HTTP ${res.status}${text ? " · " + text : ""}`,
    };
  }

  console.log("XP OK:", res.status, text);

  let raw = null;

  try {
    raw = text ? JSON.parse(text) : null;
  } catch {}

  const data = parseFunctionJson(raw) || {};

  if (!data.ok) {
    return {
      ok: false,
      delta: 0,
      error: data.error || "Blocked",
    };
  }

  const delta = Number(data.delta ?? payload.amount ?? 0);

  const afterFromServer =
    typeof data.afterXp === "number"
      ? data.afterXp
      : typeof data.afterXP === "number"
        ? data.afterXP
        : null;

  if (typeof afterFromServer === "number") a.xp = afterFromServer;
  if (typeof data.afterCap === "number") a.xpCap = data.afterCap;
  if (data.afterRankName) a.rankName = data.afterRankName;
  if (data.afterTierName) a.tierName = data.afterTierName;

  if (row) {
    const cap = xpCapForAthlete(a);
    const rank = resolveRank(a);

    const line = row.querySelector(`[data-xpline="${id}"]`);

    if (line) {
      line.textContent = `${a.xp ?? 0} / ${cap}`;
    }

    repaintMiniBarForRow({
      rowEl: row,
      athlete: a,
      xp: a.xp ?? 0,
      cap,
      rankName: rank,
    });
  }

  return {
    ok: true,
    delta,
  };
}

async function bulkGive(kind, label) {
  const ids = getSelectedIds();

  if (!ids.length) {
    setStatus("No athletes selected.", false);
    return;
  }

  try {
    updateButtons();

    if (!currentTournamentId) {
      throw new Error("Duel/Event ID required.");
    }

    if (kind === "iq" && !String(iqSelectEl?.value || "").trim()) {
      throw new Error("Pick Match IQ first.");
    }

    isSaving = true;
    updateButtons();

    setStatus(`Saving ${label} for ${ids.length}…`, true);

    let ok = 0;
    let xp = 0;

    for (const id of ids) {
      const r = await giveToOne(id, kind);

      if (r.ok) {
        ok++;
        xp += r.delta;
        receipts++;
      }
    }

    awardedCount += ok;
    awardedXP += xp;

    updateSessionBar();

    await load();

    setStatus(
      `Saved ${label}. ok:${ok}/${ids.length} • XP:${xp}`,
      true
    );
  } catch (e) {
    setStatus(e?.message || "Save failed", false);
  } finally {
    isSaving = false;
    updateButtons();
  }
}

/* -----------------------------
   Events
----------------------------- */
["input", "change", "blur"].forEach((evt) => {
  tourEl?.addEventListener(evt, updateButtons);
});

searchEl?.addEventListener("input", () => load());
iqSelectEl?.addEventListener("change", () => updateButtons());

refreshBtn?.addEventListener("click", () => load());

pickAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => {
    c.checked = true;
  });

  setStatus("All visible athletes selected.", true);
});

clearAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => {
    c.checked = false;
  });

  setStatus("Selection cleared.", true);
});

battleAllEl?.addEventListener("click", () => {
  bulkGive("battle", "+10 Battle");
});

forfeitAllEl?.addEventListener("click", () => {
  bulkGive("forfeit", "+5 Forfeit Win");
});

noOppAllEl?.addEventListener("click", () => {
  bulkGive("noOpp", "+5 NO_OPP_DAY");
});

iqAllEl?.addEventListener("click", () => {
  bulkGive("iq", "+5 Match IQ");
});

sportsmanshipAllEl?.addEventListener("click", () => {
  bulkGive("sportsmanship", "-5 Sportsmanship");
});

trackF8OnlyEl?.addEventListener("change", () => load());

/* -----------------------------
   Init
----------------------------- */
updateButtons();
await load();