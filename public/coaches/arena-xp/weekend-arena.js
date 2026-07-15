// public/coaches/arena-xp/weekend-arena.js
import "/coaches/_ui/dev-boot.js";

import { db, collection, getDocs } from "/assets/js/firebase-init.js";
import { XP_URL } from "/assets/js/coach-endpoints.js";
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
bindDevToggle({ toggleId: "devModeToggle", onChange: () => location.reload() });

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

const fullAllEl = document.getElementById("fullAll");   // +15 Weekend Battle
const partAllEl = document.getElementById("partAll");   // +5 Podium
const styleAllEl = document.getElementById("styleAll"); // +5 Second Division
const sportsmanshipAllEl = document.getElementById("sportsmanshipAll");

const iqSelectEl = document.getElementById("iqSelect");

// Existing HTML ids remain for compatibility.
// Coach-facing meaning is now Weekend Battle / Second Division.
if (fullAllEl) {
  fullAllEl.textContent = "+15 Battle";
}

if (partAllEl) {
  partAllEl.textContent = "+5 Podium";
}

if (styleAllEl) {
  styleAllEl.textContent = "+5 Second Division";
}

const sessionBar = document.getElementById("sessionBar");
const sbLoaded = document.getElementById("sb-loaded");
const sbAwarded = document.getElementById("sb-awarded");
const sbXP = document.getElementById("sb-xp");
const sbReceipts = document.getElementById("sb-receipts");

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
function xpCapForAthlete(a = {}) {
  const base = trackBaseOf(a.id, a);
  const rankName = resolveRank(a);

  const ladder = base === "F8" ? LADDER_F8 : LADDER_F4;
  const tier = ladder.find(t => t.name === rankName);

  return Number(
    tier?.cap ??
    a.xpCap ??
    a.cap ??
    a.tierCap ??
    (baseFromAthlete(a) === "F8" ? 600 : 1000)
  );
} 

function setStatus(msg, ok = true) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = ok ? "#bef264" : "#fca5a5";
  setTimeout(() => {
    if (statusEl) statusEl.style.color = "";
  }, 1200);
}

function syncTournament() {
  currentTournamentId = (tourEl?.value || "").trim();
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
  // 🔥 ALWAYS trust live rank first
  if (a.rankName) return a.rankName;

  // fallback
  if (a.tierName) return a.tierName;

  const base = trackBaseOf(a.id, a);
  const t = String(a.tier || "").toUpperCase();

  if (base === "F8") {
    const map = {
      T0: "Shadow",
      T1: "Recruit",
      T2: "Contender",
      T3: "Competitor",
      T4: "Warrior",
      T5: "Champion",
      T6: "Commander",
      T7: "Hero"
    };
    return map[t] || "Shadow";
  }

  if (base === "F4") {
    const map = {
      T0: "Apprentice",
      T1: "Warrior",
      T2: "Champion",
      T3: "Veteran",
      T4: "Legend"
    };
    return map[t] || "Apprentice";
  }

  return "Apprentice";
}
function baseFromAthlete(a = {}) {
  return trackBaseOf(a.id, a) || "F4";
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


  rowsEl.innerHTML = list
    .map((a) => {
      const uid = a.uid || a.id;
      const name = a.publicName || a.fullName || uid;
      const track = a.track || a.trackCode || "—";
      const tier = resolveRank(a); 
      const xp = a.xp ?? 0;
      const cap = xpCapForAthlete(a);

      return `
      <tr data-id="${a.id}">
        <td><input type="checkbox" class="pick" data-id="${a.id}"></td>
        <td>
          <div class="ath-name">${name}</div>
          <div class="sub">${uid}</div>
        </td>
        <td>${tier} / ${track}</td>
<td>
  <div class="coach-xp-card">
    <div><strong>Combat:</strong> <span data-xpline="${a.id}">${xp} / ${cap}</span></div>
    <div><strong>Strength:</strong> ${a.xpStrength ?? a.strengthXP ?? 0} / 120</div>
    <div><strong>Honor:</strong> ${a.xpHonor ?? a.honorXP ?? 0} / 120</div>
    <div><strong>Stripes:</strong> ${"★".repeat(Number(a.stripeCount ?? a.stripes ?? 0))}${"☆".repeat(4 - Number(a.stripeCount ?? a.stripes ?? 0))}</div>
    <div><strong>Attendance:</strong> ${a.attendanceStatus ?? "Active"}</div>
  </div>
</td>
        </tr>
    `;
    })
    .join("");

  updateSessionBar();
}

/* -----------------------------
   Load roster
----------------------------- */
async function load() {
  syncTournament();

  setStatus("Loading athletes…", true);

  const snap = await getDocs(collection(db, "athletes"));
  roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
  const locked = isSaving;

  if (fullAllEl) fullAllEl.disabled = !hasT || locked;
  if (partAllEl) partAllEl.disabled = !hasT || locked;
  if (styleAllEl) styleAllEl.disabled = !hasT || locked;
  if (sportsmanshipAllEl) sportsmanshipAllEl.disabled = !hasT || locked;
}

/* -----------------------------
   Payload builders
----------------------------- */
function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}

function buildPayload(uid, kind) {
  if (!currentTournamentId) {
    throw new Error("Tournament ID is required.");
  }

  const baseMeta = {
    tournamentId: currentTournamentId,
    eventId: currentTournamentId,
    eventType: "weekend-tournament",
    track: trackWanted(),
    source: "weekend-arena",
  };

  if (kind === "battle") {
    return {
      uid,
      kind: "ARENA/WEEKEND_BATTLE",
      amount: 15,
      meta: {
        ...baseMeta,
        weekendComponent: "BATTLE",
      },
    };
  }

  if (kind === "podium") {
    return {
      uid,
      kind: "ARENA/PODIUM",
      amount: 5,
      meta: {
        ...baseMeta,
        weekendComponent: "PODIUM",
      },
    };
  }

  if (kind === "secondDivision") {
    return {
      uid,
      kind: "ARENA/SECOND_DIVISION",
      amount: 5,
      meta: {
        ...baseMeta,
        weekendComponent: "SECOND_DIVISION",
        sameDay: true,
        divisionNumber: 2,
      },
    };
  }

  if (kind === "sportsmanship") {
    return {
      uid,
      kind: "ARENA/SPORTSMANSHIP",
      amount: -5,
      meta: {
        ...baseMeta,
        weekendComponent: "SPORTSMANSHIP",
      },
    };
  }

  throw new Error("Unknown Weekend Arena kind: " + kind);
}

/* -----------------------------
   Award flows
----------------------------- */
async function giveToOne(id, kind) {
  const a = roster.find((x) => x.id === id);
  if (!a) return { ok: false, delta: 0, error: "Athlete not found" };

  const row = document.querySelector(`tr[data-id="${id}"]`);

  const coachUid =
    window.COACH_UID ||
    localStorage.getItem("coachUid") ||
    "DEV_COACH";


  const payload = buildPayload(
    a.uidCode || a.uid || a.id,
    kind
  );

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
    return { ok: false, delta: 0, error: `HTTP ${res.status}${text ? " · " + text : ""}` };
  }

  console.log("XP OK:", res.status, text);

  let raw = null;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {}

  const data = parseFunctionJson(raw) || {};
  if (!data.ok) return { ok: false, delta: 0, error: data.error || "Blocked" };

  const delta = Number(data.delta ?? payload.amount ?? 0);

  const afterFromServer =
    (typeof data.afterXp === "number") ? data.afterXp :
    (typeof data.afterXP === "number") ? data.afterXP :
    null;

  if (typeof afterFromServer === "number") a.xp = afterFromServer;
  if (typeof data.afterCap === "number") a.xpCap = data.afterCap;
  if (data.afterRankName) a.rankName = data.afterRankName;
  if (data.afterTierName) a.tierName = data.afterTierName;

  if (row) {
    const cap = xpCapForAthlete(a);
    const line = row.querySelector(`[data-xpline="${id}"]`);
    if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;
  }

  return { ok: true, delta };
}

async function bulkGive(kind, label) {
  const ids = getSelectedIds();
  if (!ids.length) {
    setStatus("No athletes selected.", false);
    return;
  }

  try {
    updateButtons();

    if (!String(currentTournamentId || "").trim()) {
      throw new Error("Tournament ID required.");
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
["input"].forEach((evt) => searchEl?.addEventListener(evt, load));

refreshBtn?.addEventListener("click", () => load());

pickAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => (c.checked = true));
  setStatus("All visible athletes selected.", true);
});

clearAllEl?.addEventListener("click", () => {
  document.querySelectorAll(".pick").forEach((c) => (c.checked = false));
  setStatus("Selection cleared.", true);
});

fullAllEl?.addEventListener("click", () => {
  bulkGive("battle", "+15 Battle");
});

partAllEl?.addEventListener("click", () => {
  bulkGive("podium", "+5 Podium");
});

styleAllEl?.addEventListener("click", () => {
  bulkGive("secondDivision", "+5 Second Division");
});

sportsmanshipAllEl?.addEventListener("click", () => {
  bulkGive("sportsmanship", "-5 Sportsmanship");
});


/* -----------------------------
   Init
----------------------------- */
updateButtons();
await load();