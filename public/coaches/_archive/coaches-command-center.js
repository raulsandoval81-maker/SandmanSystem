/* =========================================================================
   DAILY GRIND • XP COMMAND CENTER (PILL-BASED)
   V1 SAFE — no dropdowns, no awardAll button
=========================================================================== */

import "/coaches/_ui/dev-boot.js";
import { db, collection, onSnapshot, query, where } from "/assets/js/firebase-init.js";
import { awardXP, KIND } from "/assets/js/xp-api.js";
import { applyXpResultToAthleteRow } from "/assets/js/xp-ui.js";
import { ensureSignedIn } from "/assets/js/firebase-init.js";

import {
  isDevMode,
  paintDevUi,
  bindDevToggle,
  patchDevLinks,
} from "/assets/js/dev-mode.js";


/* =========================
   DOM
========================= */
const rowsEl = document.getElementById("rows");
const pageStatusEl = document.getElementById("pageStatus");

const searchEl = document.getElementById("search");
const pickAllEl = document.getElementById("pickAll");
const clearAllEl = document.getElementById("clearAll");

const laneEl = document.getElementById("xpLane");
const modeEl = document.getElementById("xpMode");

const awardPillsEl = document.getElementById("awardPills");

const sessionBar = document.getElementById("sessionBar");
const sbLoaded = document.getElementById("sb-loaded");
const sbAwarded = document.getElementById("sb-awarded");
const sbXP = document.getElementById("sb-xp");

/* =========================
   STATE
========================= */
let roster = [];
let filtered = [];
let awardedCount = 0;
let awardedXP = 0;

/* =========================
   HELPERS
========================= */
function setAllPicks(checked) {
  rowsEl?.querySelectorAll(".pick").forEach(cb => cb.checked = checked);
}

function selectedAthleteIds() {
  return Array.from(rowsEl.querySelectorAll(".pick:checked"))
    .map(el => el.dataset.id)
    .filter(Boolean);
}

pickAllEl?.addEventListener("click", () => setAllPicks(true));
clearAllEl?.addEventListener("click", () => setAllPicks(false));

function athleteById(id) {
  return roster.find(a => a.id === id);
}

function baseFromAthlete(a) {
  const raw = String(a?.trackBase || a?.track || "").toUpperCase();
  return raw.startsWith("F8") ? "F8" : "F4";
}

/* =========================
   SESSION BAR
========================= */
function updateSessionBar() {
  if (!filtered.length) {
    sessionBar.style.display = "none";
    return;
  }
  sessionBar.style.display = "flex";
  sbLoaded.textContent = `Loaded: ${filtered.length}`;
  sbAwarded.textContent = `Awarded: ${awardedCount}`;
  sbXP.textContent = `XP issued: ${awardedXP}`;
}

/* =========================
   RENDER
========================= */
function render(list) {
  if (!list.length) {
    rowsEl.innerHTML = `<tr><td colspan="4" class="muted">No athletes.</td></tr>`;
    updateSessionBar();
    return;
  }

  rowsEl.innerHTML = list.map(a => {
    const uid = a.uid || a.id;
    const name = a.publicName || a.fullName || uid;
    const xp = a.xp ?? 0;
    const cap = xpCapForAthlete(a);

    return `
      <tr>
        <td><input type="checkbox" class="pick" data-id="${a.id}"/></td>
        <td>
          <div class="ath-name">${name}</div>
          <div class="sub">${uid}</div>
        </td>
        <td>${a.rankName || a.tierName || "—"}</td>
        <td>${xp} / ${cap}</td>
      </tr>
    `;
  }).join("");

  updateSessionBar();
}

/* =========================
   LOAD ATHLETES
========================= */
function subscribe() {
  const dev = isDevMode();
  const colRef = collection(db, "athletes");

  const ref = dev
    ? query(colRef, where("devMode", "==", true))
    : colRef;

  onSnapshot(ref, snap => {
    roster = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!dev) roster = roster.filter(a => !a.devMode);

    applyFilter();
  });
}

function applyFilter() {
  const q = (searchEl.value || "").toLowerCase().trim();

  filtered = !q
    ? roster
    : roster.filter(a =>
        (a.publicName || "").toLowerCase().includes(q) ||
        (a.uid || "").toLowerCase().includes(q)
      );

  render(filtered);
}

searchEl?.addEventListener("input", applyFilter);
subscribe();

/* =========================
   AWARD VIA PILLS (CORE)
========================= */
awardPillsEl?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-award]");
  if (!btn) return;

  const ids = selectedAthleteIds();
  if (!ids.length) {
    pageStatusEl.textContent = "Pick athletes first.";
    return;
  }

  const awardKey = btn.dataset.award;
  const lane = laneEl.value;
  const mode = modeEl.value;

  let kind, baseAmount;

  if (awardKey === "GRIND_10") { kind = KIND.ATTENDANCE; baseAmount = 10; }
  if (awardKey === "GRIND_5")  { kind = KIND.ATTENDANCE; baseAmount = 5; }
  if (awardKey === "STR_10")   { kind = KIND.STRENGTH;   baseAmount = 10; }
  if (awardKey === "STR_5")    { kind = KIND.STRENGTH;   baseAmount = 5; }
  if (awardKey === "HON_10")   { kind = KIND.HONOR;      baseAmount = 10; }
  if (awardKey === "HON_5")    { kind = KIND.HONOR;      baseAmount = 5; }

  let ok = 0;
  let xpSum = 0;

  for (const id of ids) {
    const a = athleteById(id);
    if (!a) continue;

    let amount = baseAmount;

    // Youth auto-rule
    if (baseFromAthlete(a) === "F8" && kind !== KIND.ATTENDANCE) {
      amount = 5;
    }

    try {
      const res = await awardXP({
        uid: a.uid || a.id,
        kind,
        amount,
        note: "",
        meta: { source: "daily-grind" }
      });

      if (res?.ok && !res.blocked) {
        ok++;
        xpSum += amount;
      }

      applyXpResultToAthleteRow(a, res);
    } catch (err) {
      console.error(err);
    }
  }

  awardedCount += ok;
  awardedXP += xpSum;
  updateSessionBar();

  pageStatusEl.textContent = `Done: ${ok}/${ids.length} · XP ${xpSum}`;
});
