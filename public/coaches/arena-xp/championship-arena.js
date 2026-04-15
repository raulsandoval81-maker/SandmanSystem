// public/coaches/arena-xp/championship-arena.js
// Championship Arena XP — V1 (canonical)
// - Arena: Battle + Podium + Style/IQ (+5)
// - Prestige: Lion/Tiger/Bear (requires Won + type WIN + Event Level)
// - Style/IQ selector stays hidden until +5 Style pressed (prestige-styleiq.js)

import "/coaches/_ui/dev-boot.js";

import { db, collection, getDocs } from "/assets/js/firebase-init.js";
import { awardXP, KIND } from "/assets/js/xp-api.js";
import { renderMiniXpBar } from "/assets/js/xp-bar-mini.js";

import {
  isDevMode,
  patchDevLinks,
  paintDevUi,
  bindDevToggle,
} from "/assets/js/dev-mode.js";

import {
  COLORS,
  colorKeyFor,
  getAthleteStripeInfo,
} from "/assets/js/ladder.service.js";

import {
  getCurrentStyle,
  onStyleIqAwarded,
  initStyleIqUi,
} from "/assets/js/prestige-styleiq.js";

/* -----------------------------
   DEV UI lens
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
const pageStatusEl = document.getElementById("pageStatus");

const searchEl = document.getElementById("search");
const tourEl = document.getElementById("tournamentId");
const evEl = document.getElementById("eventName");
const levelEl = document.getElementById("eventLevel");
const wonEl = document.getElementById("wonEvent");
const winArmEl = document.getElementById("winArm");

const pickAllEl = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

const bulkLionEl = document.getElementById("bulkLion");
const bulkTigerEl = document.getElementById("bulkTiger");
const bulkBearEl = document.getElementById("bulkBear");

const bulkBattleEl = document.getElementById("bulkBattle");
const bulkPodiumEl = document.getElementById("bulkPodium");
const bulkStyleEl = document.getElementById("bulkStyle");

const stampBar = document.getElementById("stampBar");
const sessionBar = document.getElementById("sessionBar");
const sbLoaded = document.getElementById("sb-loaded");
const sbAwarded = document.getElementById("sb-awarded");
const sbXP = document.getElementById("sb-xp");

const trackF8OnlyEl = document.getElementById("trackF8Only");

/* -----------------------------
   State
----------------------------- */
let roster = [];
let filtered = [];

let currentTournamentId = "";
let awardedCount = 0;
let awardedXP = 0;
let isSaving = false;

/* -----------------------------
   Helpers
----------------------------- */
function setStatus(msg, ok = true) {
  if (!pageStatusEl) return;
  pageStatusEl.textContent = msg;
  pageStatusEl.style.color = ok ? "#bef264" : "#fca5a5";
  setTimeout(() => {
    if (pageStatusEl) pageStatusEl.style.color = "";
  }, 1200);
}

function stamp(key, value, on) {
  return `
    <span class="stamp ${on ? "on" : "off"}">
      <span class="k">${key}</span>
      <span>${value}</span>
    </span>
  `;
}

function syncTournament() {
  currentTournamentId = (tourEl?.value || "").trim();
}

function eventLevel() {
  return String(levelEl?.value || "").trim();
}

function prestigeArmed() {
  const won = !!wonEl?.checked;
  const typed = String(winArmEl?.value || "").trim().toUpperCase();
  return won && typed === "WIN";
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

function resolveRank(a = {}) {
  if (a.rankName) return a.rankName;
  if (a.tierName) return a.tierName;

  const t = String(a.tier || "").toUpperCase();
  const base = trackBaseOf(a.id, a);

  if (base === "F8") {
    if (t === "T0") return "Shadow";
    if (t === "T1") return "Recruit";
    if (t === "T2") return "Combatant";
    if (t === "T3") return "Competitor";
    if (t === "T4") return "Warrior";
    if (t === "T5") return "Champion";
    if (t === "T6") return "Commander";
    if (t === "T7") return "Hero";
  }

  if (base === "F4") {
    if (t === "T0") return "Apprentice";
    if (t === "T1") return "Warrior";
    if (t === "T2") return "Champion";
    if (t === "T3") return "Veteran";
    if (t === "T4") return "Legend";
  }

  return a.tier || a.rank || "Apprentice";
}

function updateStamps() {
  if (!stampBar) return;

  const hasT = !!currentTournamentId;
  const style = getCurrentStyle();
  const hasIQ = !!style;
  const armed = prestigeArmed();
  const lvl = eventLevel();

  stampBar.innerHTML = [
    stamp("MODE", isDevMode() ? "DEV" : "LIVE", true),
    stamp("TRACK", trackWanted(), true),
    stamp("TOURNAMENT", hasT ? "Set" : "Required", hasT),
    stamp("BONUS IQ", hasIQ ? `${style}` : "Hidden (press +5)", hasIQ),
    stamp("LEVEL", lvl ? lvl.toUpperCase() : "Required for Prestige", !!lvl),
    stamp("PRESTIGE", armed ? "Armed" : "Locked (Won + WIN)", armed),
  ].join("");
}

function updateButtons() {
  syncTournament();

  const hasT = !!currentTournamentId;
  const hasIQ = !!getCurrentStyle();
  const armed = prestigeArmed();
  const hasLvl = !!eventLevel();

  if (bulkBattleEl) bulkBattleEl.disabled = !hasT || isSaving;
  if (bulkPodiumEl) bulkPodiumEl.disabled = !hasT || isSaving;
  if (bulkStyleEl) bulkStyleEl.disabled = !(hasT && hasIQ) || isSaving;

  const prestigeOk = hasT && armed && hasLvl;
  if (bulkLionEl) bulkLionEl.disabled = !prestigeOk || isSaving;
  if (bulkTigerEl) bulkTigerEl.disabled = !prestigeOk || isSaving;
  if (bulkBearEl) bulkBearEl.disabled = !prestigeOk || isSaving;

  updateStamps();

  if (!hasT) {
    setStatus("Step 1: enter Tournament ID.", true);
    return;
  }

  const style = getCurrentStyle();
  const lvl = eventLevel();
  const parts = [
    `Tournament: ${currentTournamentId}`,
    `Track: ${trackWanted()}`,
    style ? `Bonus IQ: ${style}` : "Bonus IQ: (press +5 to pick)",
    lvl ? `Level: ${lvl.toUpperCase()}` : "Level: required for Prestige",
    armed ? "Prestige: ARMED" : "Prestige: locked (Won + WIN)",
  ];
  setStatus(parts.join(" • "), true);
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
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll(".pick:checked"))
    .map((c) => c.dataset.id)
    .filter(Boolean);
}

function repaintMiniBarForRow({ rowEl, athlete, xp, cap, tierName }) {
  const slot = rowEl?.querySelector?.(".xp-slot");
  if (!slot) return;

  const info = getAthleteStripeInfo({
    ...athlete,
    xp,
    xpCap: cap,
    rankName: tierName,
    tierName,
  });

  const stripesEarned = Number(info?.stripesEarned ?? 0);
  const stripesTotal = Number(info?.stripesTotal ?? 4);

  const safeXp = Math.max(0, Number(xp) || 0);
  const safeCap = Math.max(1, Number(cap) || 1200);

  const key = colorKeyFor(tierName || "") || "apprentice";
  const c = COLORS[key] || COLORS.apprentice;

  const isWhiteStripeTier =
    String(tierName || "").toLowerCase() === "legend" ||
    String(tierName || "").toLowerCase() === "hero" ||
    String(tierName || "").toLowerCase() === "mastery";

  renderMiniXpBar({
    container: slot,
    xp: safeXp,
    cap: safeCap,
    tierName: tierName || "Apprentice",
    stripesEarned,
    stripesTotal,
    fillColor: c.start,
    stripeTone: isWhiteStripeTier ? "white" : "black",
  });
}

function render(list) {
  if (!rowsEl) return;

  if (!list.length) {
    rowsEl.innerHTML = `<tr><td colspan="4" class="muted">No athletes match.</td></tr>`;
    updateSessionBar();
    return;
  }

  const byId = new Map(list.map((a) => [a.id, a]));

  rowsEl.innerHTML = list.map((a) => {
    const uid = a.uidCode || a.uid || a.id;
    const name = a.publicName || a.fullName || uid;
    const track = a.trackCode || a.track || "—";
    const tier = resolveRank(a);
    const xp = a.xp ?? 0;
    const cap = a.xpCap ?? 1200;

    return `
      <tr data-id="${a.id}">
        <td><input type="checkbox" class="pick" data-id="${a.id}"></td>
        <td>
          <div class="ath-name">${name}</div>
          <div class="sub">${uid}</div>
        </td>
        <td>${tier} / ${track}</td>
        <td>
          <div class="xp-slot"></div>
          <div class="sub" data-xpline="${a.id}">${xp} / ${cap}</div>
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
      cap: a.xpCap ?? 1200,
      tierName: resolveRank(a),
    });
  });

  updateSessionBar();
}

/* -----------------------------
   Load roster
----------------------------- */
async function load() {
  syncTournament();

  const dev = isDevMode();
  const wanted = trackWanted();

  setStatus(`Loading athletes… (${dev ? "DEV" : "LIVE"} · ${wanted})`, true);

  const snap = await getDocs(collection(db, "athletes"));
  roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
      const uid = String(a.uidCode || a.uid || a.id || "").toLowerCase();
      return name.includes(q) || uid.includes(q);
    })
    .sort((a, b) => {
      const an = String(a.publicName || a.fullName || a.uidCode || a.uid || a.id || "");
      const bn = String(b.publicName || b.fullName || b.uidCode || b.uid || b.id || "");
      return an.localeCompare(bn);
    });

  render(filtered);
  updateButtons();
  setStatus(`${filtered.length} athletes loaded. (${dev ? "DEV" : "LIVE"} · ${wanted})`, true);
}

/* -----------------------------
   Payload builders
----------------------------- */
function buildArenaPayload(uid, arenaKind) {
  if (!currentTournamentId) throw new Error("Tournament ID is required.");

  if (arenaKind === "battle") {
    return {
      uid,
      kind: KIND.ARENA_BATTLE,
      amount: 10,
      meta: {
        tournamentId: currentTournamentId,
        source: "championship-arena",
      },
    };
  }

  if (arenaKind === "podium") {
    return {
      uid,
      kind: KIND.ARENA_PODIUM,
      amount: 5,
      meta: {
        tournamentId: currentTournamentId,
        source: "championship-arena",
      },
    };
  }

  if (arenaKind === "style") {
    const s = getCurrentStyle();
    if (!s) throw new Error("Pick a Match IQ style first.");

    return {
      uid,
      kind: KIND.ARENA_STYLEIQ,
      amount: 5,
      meta: {
        tournamentId: currentTournamentId,
        style: s,
        source: "championship-arena",
      },
    };
  }

  throw new Error("Unknown arena kind: " + arenaKind);
}

function buildPrestigePayload(uid, level) {
  if (!currentTournamentId) throw new Error("Tournament ID is required.");
  if (!prestigeArmed()) throw new Error("Prestige requires: Won event + type WIN.");

  const lvl = eventLevel();
  if (!lvl) throw new Error("Event level is required for Lion/Tiger/Bear.");

  const eventName = String(evEl?.value || "").trim() || null;

  const amounts = { lion: 25, tiger: 50, bear: 75 };
  const amount = amounts[level];
  if (!amount) throw new Error("Unknown prestige level: " + level);

  return {
    uid,
    kind: "PRESTIGE",
    amount,
    meta: {
      tournamentId: currentTournamentId,
      level: lvl,
      title: level.toUpperCase(),
      eventName,
      source: "championship-arena",
    },
  };
}

/* -----------------------------
   Award flows
----------------------------- */
async function giveToOne(id, kind) {
  const a = roster.find((x) => x.id === id);
  if (!a) return { ok: false, delta: 0 };

  const uid = a.uidCode || a.uid || a.id;
  const row = rowsEl?.querySelector?.(`tr[data-id="${id}"]`);

  const bodyData =
    (kind === "lion" || kind === "tiger" || kind === "bear")
      ? buildPrestigePayload(uid, kind)
      : buildArenaPayload(uid, kind);

  const before = Number(a.xp ?? 0);

  const optimisticCap = Number(a.xpCap ?? 1200);
  a.xp = Math.min(Math.max(1, optimisticCap), before + Number(bodyData.amount || 0));

  if (row) {
    const cap = a.xpCap ?? 1200;
    const tier = resolveRank(a);
    const line = row.querySelector(`[data-xpline="${id}"]`);
    if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;

    repaintMiniBarForRow({
      rowEl: row,
      athlete: a,
      xp: a.xp ?? 0,
      cap,
      tierName: tier,
    });
  }

  const res = await awardXP({
    uid,
    kind: bodyData.kind,
    amount: bodyData.amount,
    note: "",
    meta: bodyData.meta,
  });

  if (!res?.ok || res.blocked) {
    a.xp = before;

    if (row) {
      const cap = a.xpCap ?? 1200;
      const tier = resolveRank(a);
      const line = row.querySelector(`[data-xpline="${id}"]`);
      if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;

      repaintMiniBarForRow({
        rowEl: row,
        athlete: a,
        xp: a.xp ?? 0,
        cap,
        tierName: tier,
      });
    }

    return { ok: false, delta: 0, error: res?.reason || "Blocked" };
  }

  const afterFromServer =
    (typeof res.afterXp === "number") ? res.afterXp :
    (typeof res.afterXP === "number") ? res.afterXP :
    (typeof res.newXp === "number") ? res.newXp :
    null;

  if (typeof afterFromServer === "number") a.xp = afterFromServer;
  if (typeof res.afterCap === "number") a.xpCap = res.afterCap;
  if (res.afterRankName) a.rankName = res.afterRankName;
  if (res.afterTierName) a.tierName = res.afterTierName;

  if (row) {
    const cap = a.xpCap ?? 1200;
    const tier = resolveRank(a);
    const line = row.querySelector(`[data-xpline="${id}"]`);
    if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;

    repaintMiniBarForRow({
      rowEl: row,
      athlete: a,
      xp: a.xp ?? 0,
      cap,
      tierName: tier,
    });
  }

  return { ok: true, delta: Number(res.amount ?? bodyData.amount ?? 0) };
}

async function bulkGive(kind, label) {
  const ids = getSelectedIds();
  if (!ids.length) {
    setStatus("No athletes selected.", false);
    return;
  }

  try {
    updateButtons();

    if (!currentTournamentId) throw new Error("Tournament ID required.");
    if (kind === "style" && !getCurrentStyle()) throw new Error("Pick a Match IQ style first.");

    if (kind === "lion" || kind === "tiger" || kind === "bear") {
      if (!eventLevel()) throw new Error("Event level is required for prestige.");
      if (!prestigeArmed()) throw new Error("Prestige requires: Won event + type WIN.");
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
      } else if (r.error) {
        setStatus(r.error, false);
      }
    }

    awardedCount += ok;
    awardedXP += xp;
    updateSessionBar();

    if (kind === "style" && ok > 0) onStyleIqAwarded();

    await load();
    setStatus(`Saved ${label}. ok:${ok}/${ids.length} • XP:${xp}`, true);
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
["input", "change", "blur"].forEach((evt) => tourEl?.addEventListener(evt, updateButtons));
["input", "change"].forEach((evt) => wonEl?.addEventListener(evt, updateButtons));
["input", "change", "blur"].forEach((evt) => winArmEl?.addEventListener(evt, updateButtons));
["input", "change", "blur"].forEach((evt) => evEl?.addEventListener(evt, updateButtons));
["change", "blur"].forEach((evt) => levelEl?.addEventListener(evt, updateButtons));

searchEl?.addEventListener("input", () => load());
trackF8OnlyEl?.addEventListener("change", () => load());

pickAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => (c.checked = true));
  setStatus("All visible athletes selected.", true);
});

clearAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => (c.checked = false));
  setStatus("Selection cleared.", true);
});

bulkLionEl?.addEventListener("click", () => bulkGive("lion", "Lion +25"));
bulkTigerEl?.addEventListener("click", () => bulkGive("tiger", "Tiger +50"));
bulkBearEl?.addEventListener("click", () => bulkGive("bear", "Bear +75"));

bulkBattleEl?.addEventListener("click", () => bulkGive("battle", "+10 Battle"));
bulkPodiumEl?.addEventListener("click", () => bulkGive("podium", "+5 Podium"));
bulkStyleEl?.addEventListener("click", () => bulkGive("style", "+5 Bonus IQ"));

/* -----------------------------
   Init
----------------------------- */
initStyleIqUi({
  styleBtnId: "bulkStyle",
  iqBarId: "iqBar",
  onStateChanged: () => updateButtons(),
});

updateButtons();
await load();

console.log("championship-arena.js loaded");
window.__champ_loaded = true;