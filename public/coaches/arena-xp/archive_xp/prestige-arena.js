// public/coaches/arena/prestige-arena.js
// Prestige Arena XP — V1 (canonical)
// - Same 1/2/3 coach flow
// - Arena: Battle + Podium + Style/IQ (+5)
// - Prestige: Lion/Tiger/Bear (requires Won + type WIN)
// - Style/IQ selector stays hidden until +5 Style pressed (handled by prestige-styleiq.js)

import { db, collection, getDocs } from "/assets/js/firebase-init.js";
import { renderMiniXpBar } from "/assets/js/xp-bar-mini.js";
import { XP_URL } from "/assets/js/coach-endpoints.js";

import {
  isDevMode,
  patchDevLinks,
  paintDevUi,
  bindDevToggle,
} from "/assets/js/dev-mode.js";

import {
  getCurrentStyle,
  onStyleIqAwarded,
  initStyleIqUi,
} from "/assets/js/prestige-styleiq.js";

// -----------------------------
// DEV UI lens (toggle + carry ?dev=1)
// -----------------------------
document.body.classList.toggle("dev-on", isDevMode());
paintDevUi({ toggleId: "devModeToggle" });
patchDevLinks();
bindDevToggle({
  toggleId: "devModeToggle",
  onChange: () => location.reload(), // DEV is a reload toggle
});

// -----------------------------
// DOM
// -----------------------------
const rowsEl       = document.getElementById("rows");
const statusEl     = document.getElementById("status");
const pageStatusEl = document.getElementById("pageStatus");

const searchEl = document.getElementById("search");
const tourEl   = document.getElementById("tournamentId");
const evEl     = document.getElementById("eventName");
const wonEl    = document.getElementById("wonEvent");
const winArmEl = document.getElementById("winArm"); // input: type WIN to arm
const levelEl  = document.getElementById("eventLevel"); // DECLARED ONLY

const pickAllEl  = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

const bulkLionEl  = document.getElementById("bulkLion");
const bulkTigerEl = document.getElementById("bulkTiger");
const bulkBearEl  = document.getElementById("bulkBear");

const bulkBattleEl = document.getElementById("bulkBattle");
const bulkPodiumEl = document.getElementById("bulkPodium");
const bulkStyleEl  = document.getElementById("bulkStyle");

const stampBar = document.getElementById("stampBar");

const sessionBar = document.getElementById("sessionBar");
const sbLoaded   = document.getElementById("sb-loaded");
const sbAwarded  = document.getElementById("sb-awarded");
const sbXP       = document.getElementById("sb-xp");

// -----------------------------
// State
// -----------------------------
let roster = [];
let filtered = [];

let currentTournamentId = "";
let awardedCount = 0;
let awardedXP = 0;
let isSaving = false;

// -----------------------------
// Helpers
// -----------------------------
function setStatus(msg, ok = true){
  if (statusEl) statusEl.textContent = msg;
  if (pageStatusEl) pageStatusEl.textContent = msg;

  if (!statusEl) return;
  statusEl.style.color = ok ? "#bef264" : "#fca5a5";
  setTimeout(() => { if (statusEl) statusEl.style.color = ""; }, 1400);
}

function stamp(key, value, on){
  return `
    <span class="stamp ${on ? "on" : "off"}">
      <span class="k">${key}</span>
      <span>${value}</span>
    </span>
  `;
}

function syncTournament(){
  currentTournamentId = (tourEl ? (tourEl.value || "").trim() : "");
}

function prestigeArmed(){
  const won = !!(wonEl && wonEl.checked);
  const typed = (winArmEl ? (winArmEl.value || "").trim().toUpperCase() : "");
  return won && typed === "WIN";
}

function updateStamps(){
  if (!stampBar) return;

  const hasT  = !!currentTournamentId;
  const style = getCurrentStyle();
  const hasIQ = !!style;
  const armed = prestigeArmed();

  stampBar.innerHTML = [
    stamp("MODE", isDevMode() ? "DEV" : "LIVE", true),
    stamp("TOURNAMENT", hasT ? "Set" : "Required", hasT),
    stamp("BONUS IQ", hasIQ ? `${style}` : "Hidden (press +5)", hasIQ),
    stamp("PRESTIGE", armed ? "Armed" : "Locked (Won + WIN)", armed),
  ].join("");
}

function updateButtons(){
  syncTournament();

  const hasT  = !!currentTournamentId;
  const hasIQ = !!getCurrentStyle();
  const armed = prestigeArmed();

  // Arena requires tournamentId
  if (bulkBattleEl) bulkBattleEl.disabled = !hasT || isSaving;
  if (bulkPodiumEl) bulkPodiumEl.disabled = !hasT || isSaving;

  // Style requires tournamentId + IQ selection
  if (bulkStyleEl)  bulkStyleEl.disabled  = !(hasT && hasIQ) || isSaving;

  // Prestige requires tournamentId + armed
  if (bulkLionEl)  bulkLionEl.disabled  = !(hasT && armed) || isSaving;
  if (bulkTigerEl) bulkTigerEl.disabled = !(hasT && armed) || isSaving;
  if (bulkBearEl)  bulkBearEl.disabled  = !(hasT && armed) || isSaving;

  updateStamps();

  if (!hasT){
    if (pageStatusEl) pageStatusEl.textContent = "Step 1: enter Tournament ID.";
    return;
  }

  const style = getCurrentStyle();
  const parts = [
    `Tournament: ${currentTournamentId}`,
    style ? `Bonus IQ: ${style}` : "Bonus IQ: (press +5 to pick)",
    armed ? "Prestige: ARMED" : "Prestige: locked (Won + WIN)",
  ];
  if (pageStatusEl) pageStatusEl.textContent = parts.join(" • ");
}

function updateSessionBar(){
  if (!sessionBar) return;
  if (!filtered.length){
    sessionBar.style.display = "none";
    return;
  }
  sessionBar.style.display = "flex";
  if (sbLoaded)  sbLoaded.textContent  = `Loaded: ${filtered.length}`;
  if (sbAwarded) sbAwarded.textContent = `Awarded this session: ${awardedCount}`;
  if (sbXP)      sbXP.textContent      = `XP issued: ${awardedXP}`;
}

function getSelectedIds(){
  return Array.from(document.querySelectorAll(".pick:checked")).map(c => c.dataset.id);
}

function repaintMiniBarForRow({ rowEl, xp, cap, tierName }){
  const slot = rowEl?.querySelector?.(".xp-slot");
  if (!slot) return;

  const stripesTotal  = 4;
  const stripesEarned = Math.floor((xp / Math.max(1, cap)) * stripesTotal);
  renderMiniXpBar({ container: slot, xp, cap, tierName, stripesEarned, stripesTotal });
}

function render(list){
  if (!rowsEl) return;

  if (!list.length){
    rowsEl.innerHTML = `<tr><td colspan="4" class="muted">No athletes match.</td></tr>`;
    updateSessionBar();
    return;
  }

  const byId = new Map(list.map(a => [a.id, a]));

  rowsEl.innerHTML = list.map(a => {
    const uid   = a.uid || a.id;
    const name  = a.publicName || a.fullName || uid;
    const track = a.track || a.trackCode || "—";
    const tier  = a.tierName || a.rankName || a.tier || "Apprentice";
    const xp    = a.xp ?? 0;
    const cap   = a.xpCap ?? 1200;

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

  rowsEl.querySelectorAll("tr[data-id]").forEach(tr => {
    const a = byId.get(tr.dataset.id);
    if (!a) return;
    repaintMiniBarForRow({
      rowEl: tr,
      xp: a.xp ?? 0,
      cap: a.xpCap ?? 1200,
      tierName: a.tierName || a.rankName || a.tier || "Apprentice",
    });
  });

  updateSessionBar();
}

// ✅ DEV gate helpers
function isTestGhost(a){
  const uid = String(a?.uid || "").toUpperCase();
  const id  = String(a?.id  || "").toUpperCase();
  return uid.includes("_TEST_") || id.includes("_TEST_");
}

async function load(){
  setStatus("Loading athletes…", true);

  const snap = await getDocs(collection(db, "athletes"));
  roster = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ✅ DEV gate: NEVER show real athletes in DEV.
  // If your ghost docs don’t have isDev yet, allow the safe UID/ID pattern *_TEST_*.
  const dev = isDevMode();
  roster = roster.filter(a => {
    if (dev) return (a.isDev === true) || isTestGhost(a);
    return a.isDev !== true; // live hides test docs
  });

  const q = (searchEl?.value || "").toLowerCase().trim();
  filtered = roster.slice().filter(a => {
    if (!q) return true;
    const name = (a.publicName || a.fullName || "").toLowerCase();
    const uid  = (a.uid || "").toLowerCase();
    const id   = (a.id || "").toLowerCase();
    return name.includes(q) || uid.includes(q) || id.includes(q);
  }).sort((a,b) => {
    const an = (a.publicName || a.fullName || a.uid || a.id || "").toString();
    const bn = (b.publicName || b.fullName || b.uid || b.id || "").toString();
    return an.localeCompare(bn);
  });

  render(filtered);
  updateButtons();
  setStatus(`${filtered.length} athletes loaded. (${dev ? "DEV" : "LIVE"})`, true);
}

function parseFunctionJson(raw){
  return raw?.result ?? raw?.data ?? raw;
}

// -----------------------------
// Payload builders
// -----------------------------
function buildArenaPayload(uid, arenaKind){
  if (!currentTournamentId) throw new Error("Tournament ID is required.");

  if (arenaKind === "battle"){
    return { uid, kind: "ARENA/BATTLE", amount: 10, meta: { tournamentId: currentTournamentId, source: "prestige-arena" } };
  }

  if (arenaKind === "podium"){
    return { uid, kind: "ARENA/PODIUM", amount: 5, meta: { tournamentId: currentTournamentId, source: "prestige-arena" } };
  }

  if (arenaKind === "style"){
    const s = getCurrentStyle();
    if (!s) throw new Error("Pick a Match IQ style first.");
    return { uid, kind: "ARENA/STYLEIQ", amount: 5, meta: { tournamentId: currentTournamentId, style: s, source: "prestige-arena" } };
  }

  throw new Error("Unknown arena kind: " + arenaKind);
}

function buildPrestigePayload(uid, level){
  if (!currentTournamentId) throw new Error("Tournament ID is required.");
  if (!prestigeArmed()) throw new Error("Prestige requires: Won event + type WIN.");

  const eventName = (evEl ? (evEl.value || "").trim() : "") || null;

  const map = {
    lion:  { amount:25, level:"state" },
    tiger: { amount:50, level:"regional" },
    bear:  { amount:75, level:"national" },
  };
  const cfg = map[level];
  if (!cfg) throw new Error("Unknown prestige level: " + level);

  return {
    uid,
    kind: "PRESTIGE",
    amount: cfg.amount,
    meta: {
      tournamentId: currentTournamentId,
      level: cfg.level,
      title: level.toUpperCase(),
      eventName,
      source: "prestige-arena",
    },
  };
}

// -----------------------------
// Award flows
// -----------------------------
async function giveToOne(id, kind){
  const a = roster.find(x => x.id === id);
  if (!a) return { ok:false, delta:0 };

  const uid = a.uid || a.id;
  const row = rowsEl?.querySelector?.(`tr[data-id="${id}"]`);

  const bodyData =
    (kind === "lion" || kind === "tiger" || kind === "bear")
      ? buildPrestigePayload(uid, kind)
      : buildArenaPayload(uid, kind);

  const res = await fetch(XP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: bodyData }),
  });

  if (!res.ok) return { ok:false, delta:0, error:`HTTP ${res.status}` };

  let raw = null;
  try { raw = await res.json(); } catch {}
  const data = parseFunctionJson(raw) || {};

  if (!data.ok) return { ok:false, delta:0, error: data.error || "Blocked" };

  const delta = Number(data.delta ?? bodyData.amount ?? 0);

  const afterFromServer =
    (typeof data.afterXp === "number") ? data.afterXp :
    (typeof data.afterXP === "number") ? data.afterXP :
    null;

  if (typeof afterFromServer === "number") a.xp = afterFromServer;

  if (row){
    const cap  = a.xpCap ?? 1200;
    const tier = a.tierName || a.rankName || a.tier || "Apprentice";
    const line = row.querySelector(`[data-xpline="${id}"]`);
    if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;
    repaintMiniBarForRow({ rowEl: row, xp: a.xp ?? 0, cap, tierName: tier });
  }

  return { ok:true, delta };
}

async function bulkGive(kind, label){
  const ids = getSelectedIds();
  if (!ids.length){ setStatus("No athletes selected.", false); return; }

  try{
    updateButtons();

    if (!currentTournamentId) throw new Error("Tournament ID required.");
    if (kind === "style" && !getCurrentStyle()) throw new Error("Pick a Match IQ style first.");
    if ((kind === "lion" || kind === "tiger" || kind === "bear") && !prestigeArmed()){
      throw new Error("Prestige requires: Won event + type WIN.");
    }

    isSaving = true;
    updateButtons();
    setStatus(`Saving ${label} for ${ids.length}…`, true);

    let ok = 0;
    let xp = 0;

    for (const id of ids){
      const r = await giveToOne(id, kind);
      if (r.ok){ ok++; xp += r.delta; }
    }

    awardedCount += ok;
    awardedXP += xp;
    updateSessionBar();

    if (kind === "style" && ok > 0) onStyleIqAwarded();

    await load();
    setStatus(`Saved ${label}. ok:${ok}/${ids.length} • XP:${xp}`, true);
  } catch (e){
    setStatus(e?.message || "Save failed", false);
  } finally {
    isSaving = false;
    updateButtons();
  }
}

// -----------------------------
// Events
// -----------------------------
["input","change","blur"].forEach(evt => tourEl?.addEventListener(evt, updateButtons));
["input","change"].forEach(evt => wonEl?.addEventListener(evt, updateButtons));
["input","change","blur"].forEach(evt => winArmEl?.addEventListener(evt, updateButtons));
["input","change","blur"].forEach(evt => evEl?.addEventListener(evt, updateButtons));

searchEl?.addEventListener("input", () => load());

pickAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach(c => c.checked = true);
  setStatus("All visible athletes selected.", true);
});

clearAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach(c => c.checked = false);
  setStatus("Selection cleared.", true);
});

bulkLionEl?.addEventListener("click",  () => bulkGive("lion",  "Lion +25"));
bulkTigerEl?.addEventListener("click", () => bulkGive("tiger", "Tiger +50"));
bulkBearEl?.addEventListener("click",  () => bulkGive("bear",  "Bear +75"));

bulkBattleEl?.addEventListener("click", () => bulkGive("battle", "+10 Battle"));
bulkPodiumEl?.addEventListener("click", () => bulkGive("podium", "+5 Podium"));
bulkStyleEl?.addEventListener("click",  () => bulkGive("style",  "+5 Bonus IQ"));

// -----------------------------
// Init (Style IQ hide/unhide lives in prestige-styleiq.js)
// -----------------------------
initStyleIqUi({
  styleBtnId: "bulkStyle",
  iqBarId: "iqBar",
  onStateChanged: () => updateButtons(),
});

updateButtons();
await load();
