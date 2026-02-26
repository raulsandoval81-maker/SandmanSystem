// public/coaches/daily-xp/daily-grind.js
import "/coaches/_ui/dev-boot.js";

import { db, collection, onSnapshot, ensureSignedIn } from "/assets/js/firebase-init.js";
import { XP_URL } from "/assets/js/coach-endpoints.js";
import { renderMiniXpBar } from "/assets/js/xp-bar-mini.js";

import {
  isDevMode,
  paintDevUi,
  bindDevToggle,
  patchDevLinks,
} from "/assets/js/dev-mode.js";
console.log("XP_URL =", XP_URL);

/* =========================
   DEV MODE BOOTSTRAP
========================= */
document.body.classList.toggle("dev-on", isDevMode());
paintDevUi({ toggleId: "devModeToggle" });
patchDevLinks();
bindDevToggle({ toggleId: "devModeToggle", onChange: () => location.reload() });
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

/* =========================
   DOM
========================= */
const rowsEl = document.getElementById("rows");
const pageStatusEl = document.getElementById("pageStatus");

const searchEl = document.getElementById("search");
const pickAllEl = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

// Track toggle (exclusive)
const trackF8OnlyEl = document.getElementById("trackF8Only");

const laneEl = document.getElementById("xpLane");
const modeEl = document.getElementById("xpMode");
const awardHintEl = document.getElementById("awardHint");

// Session pills
const sessionBar = document.getElementById("sessionBar");
const sbLoaded = document.getElementById("sb-loaded");
const sbAwarded = document.getElementById("sb-awarded");
const sbXP = document.getElementById("sb-xp");

// Refresh (optional)
const refreshBtn = document.getElementById("refreshBtn");

// Pills
const btnGrind10 = document.getElementById("btnGrind10");
const btnGrind5  = document.getElementById("btnGrind5");
const btnStr10   = document.getElementById("btnStr10");
const btnStr5    = document.getElementById("btnStr5");
const btnHon10   = document.getElementById("btnHon10");
const btnHon5    = document.getElementById("btnHon5");

const ALL_PILLS = [btnGrind10, btnGrind5, btnStr10, btnStr5, btnHon10, btnHon5].filter(Boolean);

/* =========================
   State
========================= */
let roster = [];
let filtered = [];
let awardedCount = 0;
let awardedXP = 0;
let unsub = null;
let isSaving = false;

/* =========================
   Helpers
========================= */
function setStatus(msg) {
  if (pageStatusEl) pageStatusEl.textContent = msg;
}

function setAllPicks(checked) {
  if (!rowsEl) return;
  rowsEl.querySelectorAll(".pick").forEach((cb) => (cb.checked = checked));
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

// Exclusive track selector (default F4)
function wantedTrackBase() {
  return trackF8OnlyEl && trackF8OnlyEl.checked ? "F8" : "F4";
}

// Canonical base inference
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
}

function repaintMiniBarForRow({ rowEl, xp, cap, tierName }) {
  const slot = rowEl?.querySelector?.(".xp-slot");
  if (!slot) return;

  const stripesTotal = 4;
  const safeCap = Math.max(1, Number(cap) || 1200);
  const safeXp  = Math.max(0, Number(xp) || 0);
  const stripesEarned = Math.max(
    0,
    Math.min(stripesTotal, Math.floor((safeXp / safeCap) * stripesTotal))
  );

  renderMiniXpBar({
    container: slot,
    xp: safeXp,
    cap: safeCap,
    tierName: tierName || "Apprentice",
    stripesEarned,
    stripesTotal,
  });
}

/* =========================
   Render
========================= */
function render(list) {
  if (!rowsEl) return;

  if (!list.length) {
    rowsEl.innerHTML = `<tr><td colspan="4" class="muted">No athletes match.</td></tr>`;
    updateSessionBar();
    return;
  }

  const byId = new Map(list.map((a) => [a.id, a]));

  rowsEl.innerHTML = list.map((a) => {
    const uid   = a.uidCode || a.uid || a.id;
    const name  = a.publicName || a.fullName || uid;
    const track = a.trackCode || a.track || "—";
    const tier  = a.rankName || a.tierName || a.tier || "Apprentice";
    const xp    = a.xp ?? 0;
    const cap   = a.xpCap ?? 1200;

    return `
      <tr data-id="${a.id}">
        <td><input type="checkbox" class="pick" data-id="${a.id}"/></td>
        <td>
          <div class="ath-name">${name}</div>
          <div class="sub">${uid}</div>
        </td>
        <td>${tier} / ${track}</td>
        <td>
          <div class="xp-slot"></div>
          <div class="row-xp-meta" data-xpline="${a.id}">${xp} / ${cap}</div>
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
      tierName: a.rankName || a.tierName || a.tier || "Apprentice",
    });
  });

  updateSessionBar();
}

/* =========================
   Filter
========================= */
function applyFilterAndRender() {
  const q = String(searchEl?.value || "").toLowerCase().trim();
  const wantedBase = wantedTrackBase();

  filtered = !q
    ? roster.slice()
    : roster.filter((a) => {
        const n  = String(a.publicName || a.fullName || "").toLowerCase();
        const u  = String(a.uidCode || a.uid || a.id || "").toLowerCase();
        const id = String(a.id || "").toLowerCase();
        return n.includes(q) || u.includes(q) || id.includes(q);
      });

  // Exclusive track filter (never mix)
  filtered = filtered.filter((a) => baseFromAthlete(a) === wantedBase);

  filtered.sort((a, b) => {
    const an = String(a.publicName || a.fullName || a.uidCode || a.uid || a.id || "");
    const bn = String(b.publicName || b.fullName || b.uidCode || b.uid || b.id || "");
    return an.localeCompare(bn);
  });

  render(filtered);
  setStatus(`Ready · ${wantedBase}`);
}

/* =========================
   Live subscribe (root athletes + DEV/LIVE gate)
========================= */
function subscribe() {
  if (unsub) { unsub(); unsub = null; }

  const dev = isDevMode();
  const wantedBase = wantedTrackBase();

  setStatus(`Loading athletes… ${dev ? "(DEV)" : "(LIVE)"} · ${wantedBase}`);

  // ✅ Single source of truth (matches weekend/declared)
  const colRef = collection(db, "athletes");

  unsub = onSnapshot(
    colRef,
    (snap) => {
      roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // DEV/LIVE gates (single truth)
      roster = roster.filter((a) => {
        if (dev) return a.devMode === true && a.isTest === true;
        return !(a.devMode === true || a.isTest === true);
      });

      applyFilterAndRender();
      setStatus(`Ready · ${wantedBase}`);
    },
    (err) => {
      console.error(err);
      setStatus(`${dev ? "DEV" : "LIVE"} load failed (see console).`);
    }
  );
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

subscribe();

/* =========================
   Lane → show ONLY 2 pills
========================= */
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

laneEl?.addEventListener("change", syncPillsToLane);
syncPillsToLane();

/* =========================
   Award mapping (string kinds = backend truth)
========================= */
const AWARDS = Object.freeze({
GRIND_10: { label: "+10 Full-Time Grind", kind: "ATTENDANCE", amount: 10 },
GRIND_5:  { label: "+5 Half-Time Grind",  kind: "ATTENDANCE", amount: 5  },

  STR_10:   { label: "+10 Strength", kind: "STRENGTH", amount: 10 },
  STR_5:    { label: "+5 Strength",  kind: "STRENGTH", amount: 5  },

  HON_10:   { label: "+10 Honor", kind: "HONOR", amount: 10 },
  HON_5:    { label: "+5 Honor",  kind: "HONOR", amount: 5  },
});

function autoAmountForAthlete(a, chosenAmount, awardKind) {
  const base = baseFromAthlete(a);

  // Youth rule: Strength/Honor always +5 (server enforces too)
  if (base === "F8" && (awardKind === "STRENGTH" || awardKind === "HONOR")) {
    return 5;
  }
  return chosenAmount;
}

function parseFunctionJson(raw) {
  return raw?.result ?? raw?.data ?? raw;
}
/* =========================
   Core award runner
========================= */
async function issueAwardForSelection(award) {
  const ids = selectedAthleteIds();
  if (!ids.length) {
    setStatus("Step 2: pick at least one athlete.");
    return;
  }

  if (isSaving) return;
  isSaving = true;

  const mode = String(modeEl?.value || "auto").toLowerCase();

  ALL_PILLS.forEach((b) => (b.disabled = true));
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

    // ✅ single, server-friendly shape
    const payload = {
      uid,
      kind: award.kind,
      amount: amt,
      lane, // top-level lane
      meta: { lane, source: "daily-grind" }, // keep meta for logging
    };

    console.log("XP SEND →", { uid, kind: award.kind, amount: amt, lane });

    try {
      const coachUid =
        window.COACH_UID ||
        localStorage.getItem("coachUid") ||
        "DEV_COACH";

      const res = await fetch(XP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-coach-uid": String(coachUid).trim(),
        },
        // ✅ IMPORTANT: keep { data: payload } (matches your xpHttp wrapper)
        body: JSON.stringify({ data: payload }),
      });

      // ✅ Read body ONCE (text), then parse
      const text = await res.text().catch(() => "");

      if (!res.ok) {
        console.log("XP ERR:", res.status, text);
        setStatus(`HTTP ${res.status}${text ? " · " + text : ""}`);
        continue;
      }

      console.log("XP OK:", res.status, text);

      let raw = null;
      try { raw = text ? JSON.parse(text) : null; } catch {}
      const data = parseFunctionJson(raw) || {};

      if (data.ok) {
        okCount += 1;
        const delta = Number(data.delta ?? amt);
        xpTotal += delta;

        const after =
          (typeof data.afterXp === "number") ? data.afterXp :
          (typeof data.afterXP === "number") ? data.afterXP :
          null;

        if (typeof after === "number") a.xp = after;

        const row = rowsEl?.querySelector?.(`tr[data-id="${id}"]`);
        if (row) {
          const cap = a.xpCap ?? 1200;
          const line = row.querySelector(`[data-xpline="${id}"]`);
          if (line) line.textContent = `${a.xp ?? 0} / ${cap}`;

          repaintMiniBarForRow({
            rowEl: row,
            xp: a.xp ?? 0,
            cap,
            tierName: a.rankName || a.tierName || a.tier || "Apprentice",
          });
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Call failed (see console).");
    }
  }

  awardedCount += okCount;
  awardedXP += xpTotal;
  updateSessionBar();

  setStatus(`Done. Success: ${okCount}/${ids.length} · XP issued: ${xpTotal}`);

  ALL_PILLS.forEach((b) => (b.disabled = false));
  isSaving = false;
}

/* =========================
   Bind pills
========================= */
function bindPill(btn) {
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const key = btn.getAttribute("data-award");
    const award = AWARDS[key];

    if (!award) {
      setStatus("Invalid award button (missing mapping).");
      return;
    }

    await issueAwardForSelection(award);
    setStatus(`Ready · ${wantedTrackBase()}`);
  });
}

bindPill(btnGrind10);
bindPill(btnGrind5);
bindPill(btnStr10);
bindPill(btnStr5);
bindPill(btnHon10);
bindPill(btnHon5);

console.log("daily-grind.js loaded");
window.__daily_loaded = true;
