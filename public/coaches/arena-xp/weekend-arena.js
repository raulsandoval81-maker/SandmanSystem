// public/coaches/arena-xp/weekend-arena.js
import "/coaches/_ui/dev-boot.js";

import { db, collection, getDocs } from "/assets/js/firebase-init.js";
import { XP_URL } from "/assets/js/coach-endpoints.js";

import {
  isDevMode,
  paintDevUi,
  bindDevToggle,
  patchDevLinks,
} from "/assets/js/dev-mode.js";

import { renderMiniXpBar } from "/assets/js/xp-bar-mini.js";

/* -----------------------------
   DEV UI
----------------------------- */
document.body.classList.toggle("dev-on", isDevMode());
paintDevUi({ toggleId: "devModeToggle" });
patchDevLinks();
bindDevToggle({ toggleId: "devModeToggle", onChange: () => location.reload() });

/* -----------------------------
   DOM
----------------------------- */
const rowsEl   = document.getElementById("rows");
const statusEl = document.getElementById("status");

const tourEl   = document.getElementById("tournamentId");
const searchEl = document.getElementById("search");

const refreshBtn = document.getElementById("refreshBtn");

const pickAllEl  = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

const fullAllEl  = document.getElementById("fullAll");   // +10 Battle
const partAllEl  = document.getElementById("partAll");   // +5 Podium
const styleAllEl = document.getElementById("styleAll");  // +5 Style/IQ

const iqSelectEl = document.getElementById("iqSelect");

const sessionBar = document.getElementById("sessionBar");
const sbLoaded   = document.getElementById("sb-loaded");
const sbAwarded  = document.getElementById("sb-awarded");
const sbXP       = document.getElementById("sb-xp");
const sbReceipts = document.getElementById("sb-receipts");

// Foundry toggle (exclusive F4 vs F8)
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
  setTimeout(() => { if (statusEl) statusEl.style.color = ""; }, 1200);
}

function syncTournament() {
  currentTournamentId = (tourEl?.value || "").trim();
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

function updateSessionBar() {
  if (!sessionBar) return;

  if (!filtered.length) {
    sessionBar.style.display = "none";
    return;
  }

  sessionBar.style.display = "flex";
  if (sbLoaded)  sbLoaded.textContent  = `Loaded: ${filtered.length}`;
  if (sbAwarded) sbAwarded.textContent = `Awarded this session: ${awardedCount}`;
  if (sbXP)      sbXP.textContent      = `XP issued: ${awardedXP}`;
  if (sbReceipts) sbReceipts.textContent = receipts ? `Receipts: ${receipts}` : "";
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll(".pick:checked"))
    .map((c) => c.dataset.id)
    .filter(Boolean);
}

function repaintMiniBarForRow({ rowEl, xp, cap, tierName }) {
  const slot = rowEl?.querySelector?.(".xp-slot");
  if (!slot) return;

  const stripesTotal = 4;
  const stripesEarned = Math.max(
    0,
    Math.min(stripesTotal, Math.floor((Number(xp) / Math.max(1, Number(cap))) * stripesTotal))
  );

  renderMiniXpBar({
    container: slot,
    xp: Number(xp) || 0,
    cap: Number(cap) || 1200,
    tierName: tierName || "Apprentice",
    stripesEarned,
    stripesTotal,
  });
}

/* -----------------------------
   Render
----------------------------- */
function render(list) {
  if (!rowsEl) return;

  if (!list.length) {
    rowsEl.innerHTML = `<tr><td colspan="4" class="muted">No athletes match.</td></tr>`;
    updateSessionBar();
    return;
  }

  const byId = new Map(list.map((a) => [a.id, a]));

  rowsEl.innerHTML = list.map((a) => {
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
          <div class="sub">${xp} / ${cap}</div>
        </td>
      </tr>
    `;
  }).join("");

  rowsEl.querySelectorAll("tr[data-id]").forEach((tr) => {
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

/* -----------------------------
   Load roster (simple + matches your earlier arena pages)
----------------------------- */
async function load() {
  syncTournament();

  setStatus("Loading athletes…", true);

  const snap = await getDocs(collection(db, "athletes"));
  roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const dev = isDevMode();
  const wanted = trackWanted();

  // DEV/LIVE gates
  roster = roster.filter((a) => {
    if (dev) return a.devMode === true && a.isTest === true;
    return !(a.devMode === true || a.isTest === true);
  });

  // Exclusive track filter (never mix)
  roster = roster.filter((a) => trackBaseOf(a.id, a) === wanted);

  const q = (searchEl?.value || "").toLowerCase().trim();
  filtered = roster
    .filter((a) => {
      if (!q) return true;
      const name = (a.publicName || a.fullName || "").toLowerCase();
      const uid = (a.uid || a.id || "").toLowerCase();
      return name.includes(q) || uid.includes(q);
    })
    .sort((a, b) => {
      const an = String(a.publicName || a.fullName || a.uid || a.id || "");
      const bn = String(b.publicName || b.fullName || b.uid || b.id || "");
      return an.localeCompare(bn);
    });

  render(filtered);
  updateButtons();
  setStatus(`${filtered.length} athletes loaded. (${dev ? "DEV" : "LIVE"} · ${wanted})`, true);
}

/* -----------------------------
   Button gating
----------------------------- */
function updateButtons() {
  syncTournament();

  const hasT = !!currentTournamentId;
  const hasIQ = !!String(iqSelectEl?.value || "").trim();
  const locked = isSaving;

  if (fullAllEl)  fullAllEl.disabled  = !hasT || locked;
  if (partAllEl)  partAllEl.disabled  = !hasT || locked;

  // Style requires tournamentId + iq selection
  if (styleAllEl) styleAllEl.disabled = !(hasT && hasIQ) || locked;
}

/* -----------------------------
   Payload builders
----------------------------- */
function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}

function buildPayload(uid, kind) {
  if (!currentTournamentId) throw new Error("Tournament ID is required.");

  if (kind === "battle") {
    return {
      uid,
      kind: "ARENA/BATTLE",
      amount: 10,
      meta: {
        tournamentId: currentTournamentId,
        track: trackWanted(),
        source: "weekend-arena",
      },
    };
  }

  if (kind === "podium") {
    return {
      uid,
      kind: "ARENA/PODIUM",
      amount: 5,
      meta: {
        tournamentId: currentTournamentId,
        track: trackWanted(),
        source: "weekend-arena",
      },
    };
  }

  if (kind === "style") {
    const style = String(iqSelectEl?.value || "").trim();
    if (!style) throw new Error("Pick a Match IQ style first.");

    return {
      uid,
      kind: "ARENA/STYLEIQ",
      amount: 5,
      meta: {
        tournamentId: currentTournamentId,
        style,
        track: trackWanted(),
        source: "weekend-arena",
      },
    };
  }

  throw new Error("Unknown kind: " + kind);
}

/* -----------------------------
   Award flows
----------------------------- */
async function giveToOne(id, kind) {
  const a = roster.find((x) => x.id === id);
  if (!a) return { ok: false, delta: 0, error: "Athlete not found" };

  // find the row (so UI repaint doesn't crash)
  const row = document.querySelector(`tr[data-id="${id}"]`);

  const coachUid =
    window.COACH_UID ||
    localStorage.getItem("coachUid") ||
    "DEV_COACH";

  // Map UI kind -> server kind + amount rules
  // (adjust if your buttons already pass server kind strings)
  const serverKind =
    kind === "battle" ? "ARENA/BATTLE" :
    kind === "podium" ? "ARENA/PODIUM" :
    kind === "style"  ? "ARENA/STYLEIQ" :
    kind; // fallback if caller already passes "ARENA/..."

  const amount =
    serverKind === "ARENA/BATTLE" ? 10 :
    serverKind === "ARENA/PODIUM" ? 5 :
    serverKind === "ARENA/STYLEIQ" ? 5 :
    0;

  // Build payload (THIS replaces bodyData)
  const payload = {
    uid: a.uidCode || a.uid || a.id,
    kind: serverKind,
    amount,
    meta: {
      tournamentId: String(currentTournamentId || "").trim(),
      source: "arena",
      // Match IQ required for STYLEIQ
      ...(serverKind === "ARENA/STYLEIQ"
        ? { matchIq: String(iqSelectEl?.value || "").trim() }
        : {}),
    },
  };

  const res = await fetch(XP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-coach-uid": String(coachUid).trim(),
    },
    // ✅ IMPORTANT: send { data: payload } (same as Daily Grind)
    body: JSON.stringify({ data: payload }),
  });

  // Read text once (best debug)
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.log("XP ERR:", res.status, text);
    return { ok: false, delta: 0, error: `HTTP ${res.status}${text ? " · " + text : ""}` };
  }

  console.log("XP OK:", res.status, text);

  // Parse from text
  let raw = null;
  try { raw = text ? JSON.parse(text) : null; } catch {}
  const data = parseFunctionJson(raw) || {};

  if (!data.ok) return { ok: false, delta: 0, error: data.error || "Blocked" };

  const delta = Number(data.delta ?? payload.amount ?? 0);

  // Your server returns afterXp/afterXP
  const afterFromServer =
    (typeof data.afterXp === "number") ? data.afterXp :
    (typeof data.afterXP === "number") ? data.afterXP :
    null;

  if (typeof afterFromServer === "number") a.xp = afterFromServer;

  // repaint UI safely
  if (row) {
    const cap = a.xpCap ?? 1200;
    const tier = a.tierName || a.rankName || a.tier || "Apprentice";
    const line = row.querySelector(".sub");
    if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;
    repaintMiniBarForRow({ rowEl: row, xp: a.xp ?? 0, cap, tierName: tier });
  }

  return { ok: true, delta };
}

async function bulkGive(kind, label) {
  const ids = getSelectedIds();
  if (!ids.length) { setStatus("No athletes selected.", false); return; }

  try {
    updateButtons();

    if (!String(currentTournamentId || "").trim()) throw new Error("Tournament ID required.");
    if (kind === "style" && !String(iqSelectEl?.value || "").trim()) {
      throw new Error("Pick Match IQ first.");
    }

    isSaving = true;
    updateButtons();
    setStatus(`Saving ${label} for ${ids.length}…`, true);

    let ok = 0;
    let xp = 0;

    for (const id of ids) {
      const r = await giveToOne(id, kind);
      if (r.ok) { ok++; xp += r.delta; receipts++; }
    }

    awardedCount += ok;
    awardedXP += xp;
    updateSessionBar();

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
["input","change","blur"].forEach((evt) => tourEl?.addEventListener(evt, updateButtons));
["input"].forEach((evt) => searchEl?.addEventListener(evt, load));
["change"].forEach((evt) => iqSelectEl?.addEventListener(evt, updateButtons));

refreshBtn?.addEventListener("click", () => load());

pickAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => (c.checked = true));
  setStatus("All visible athletes selected.", true);
});
clearAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => (c.checked = false));
  setStatus("Selection cleared.", true);
});

fullAllEl?.addEventListener("click", () => bulkGive("battle", "+10 Battle"));
partAllEl?.addEventListener("click", () => bulkGive("podium", "+5 Podium"));
styleAllEl?.addEventListener("click", () => bulkGive("style", "+5 Style/IQ"));

trackF8OnlyEl?.addEventListener("change", () => load());

/* -----------------------------
   Init
----------------------------- */
updateButtons();
await load();
