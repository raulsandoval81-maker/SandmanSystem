// /athletes/profile/profile.js
// ============================
// Athlete Profile JS (F4-only owner)
// - Full profile is now strictly teen/adult
// - F8 is redirected immediately to mini profile
// - Keeps: locks, drops, badge, belt bar, logs, strength/honor visuals
// ============================

import {
  db, auth, doc, getDoc, ensureSignedIn,
  collection, query, where, orderBy, limit, getDocs
} from "/assets/js/firebase-init.js";
import { renderDigitalBelt } from "/assets/js/digital-belt.js";

import { LADDER_F4 } from "/assets/js/ladder.service.js";


// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

function safeText(id, val, fallback = "—") {
  const el = $(id);
  if (!el) return;
  el.textContent = (val === undefined || val === null || val === "") ? fallback : String(val);
}

function safeHTML(id, html) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = html;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// =======================================
// Exported helper for lane pages
// =======================================
export async function getAthleteProfile(athleteUid) {
  const uid = String(athleteUid || "").trim();
  if (!uid) return null;

  const ref = doc(db, "athletes", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return { id: snap.id, ...snap.data() };
}

function getStoredTierNum(a) {
  if (typeof a?.tier === "number") return a.tier;
  if (typeof a?.tier === "string") {
    const m = String(a.tier).match(/T(\d+)/i);
    if (m) return Number(m[1]) || 0;
  }
  return 0;
}

function getStoredStripes(a) {
  return Number(a?.stripeCount ?? a?.stripes ?? 0);
}

function getStoredXpCap(a, ladder, tierNum) {
  const direct = Number(a?.xpCap ?? 0);
  if (direct > 0) return direct;

  const tier = ladder?.[tierNum];
  return Number(tier?.cap ?? tier?.xpCap ?? tier?.maxXP ?? 0);
}

function getEffectiveStripes({ xpNow, xpCap, storedStripes, stripeMax = 4 }) {
  const safeCap = Math.max(1, Number(xpCap || 0));
  const safeXp = Math.max(0, Number(xpNow || 0));
  const stored = Number(storedStripes || 0);

  const derived = Math.floor((safeXp / safeCap) * stripeMax);

  if (safeXp >= safeCap) return stripeMax;

  return Math.max(0, Math.min(stripeMax, Math.max(stored, derived)));
}

// ---------- params ----------
const params = new URLSearchParams(location.search);

function normalizeAthleteId(id) {
  if (!id) return id;
  const m = String(id).match(/^A(\d+)$/i);
  if (!m) return id;
  return "A" + m[1].padStart(6, "0");
}

const athleteIdRaw =
  params.get("id") ||
  params.get("uid") ||
  params.get("athleteId") ||
  localStorage.getItem("sandman_lastAthleteUid") ||
  localStorage.getItem("currentAthleteId");

const athleteId = normalizeAthleteId(athleteIdRaw);

// 🔥 HARD F8 GUARD — youth must use mini profile
if (String(athleteId || "").toUpperCase().startsWith("F8_")) {
  window.location.replace(`/athletes/profile/mini-profile.html?id=${encodeURIComponent(athleteId)}`);
  throw new Error("F8 redirected to mini profile");
}

// Keep URL canonical if needed
if (athleteIdRaw && athleteId && athleteId !== athleteIdRaw) {
  const u = new URL(location.href);
  if (u.searchParams.get("id")) u.searchParams.set("id", athleteId);
  else if (u.searchParams.get("uid")) u.searchParams.set("uid", athleteId);
  else u.searchParams.set("id", athleteId);
  history.replaceState({}, "", u.toString());
}

const mode = (params.get("mode") || "athlete").toLowerCase();
const viewMode = mode;

// guard
if (!athleteId) {
  document.body.innerHTML = "<main class='wrap'><p>Missing athlete id. Use ?id= or ?uid=</p></main>";
  throw new Error("Missing athlete id");
}

// ===============================
// DROPS + LOCKS
// ===============================

let reviewMode = localStorage.getItem("sm_review_mode") === "1";

function unlockRules({ tierName }) {
  const t = String(tierName || "").toLowerCase();
  const isTier0 = (t === "apprentice" || t === "foundation");
  return {
    combat: 0,
    strength: 2,
    honor: 3,
    performance: isTier0 ? 1 : 999,
  };
}

// ---------- drop helpers ----------
function syncDrop(section) {
  const body = section.querySelector(".drop-body");
  const btn = section.querySelector(".drop-head");
  const chev = section.querySelector(".chev");
  if (!btn || !body) return;
  const open = !body.classList.contains("collapsed");
  btn.setAttribute("aria-expanded", String(open));
  if (chev) chev.textContent = open ? "▴" : "▾";
}

function applyLaneLocks({ tierName, stripesEarned, athlete }) {
  if (viewMode === "coach" || viewMode === "full" || reviewMode) {
    setDropLocked("strength", false);
    setDropLocked("honor", false);
    return;
  }

  const req = unlockRules({ tierName });
  const s = Number(stripesEarned || 0);

  const strengthUnlocked =
    athlete?.unlocks?.strength === true ||
    s >= (req.strength ?? 999);

  const honorUnlocked =
    athlete?.unlocks?.honor === true ||
    s >= (req.honor ?? 999);

  setDropLocked("strength", !strengthUnlocked);
  setDropLocked("honor", !honorUnlocked);
}

// ===============================
// Strength/Honor visuals
// ===============================

const POWER_SMALL_SVG = `
<svg viewBox="0 0 64 64"
     class="lane-svg power-svg"
     aria-hidden="true"
     focusable="false">
  <defs>
    <radialGradient id="pr_base" cx="30%" cy="30%" r="75%">
      <stop offset="0%" stop-color="rgba(255,255,255,.40)"/>
      <stop offset="45%" stop-color="rgba(255,255,255,.14)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,.60)"/>
    </radialGradient>

    <linearGradient id="pr_rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"
            style="stop-color: var(--pow-steel, rgba(180,200,220,1)); stop-opacity:.55"/>
      <stop offset="45%"
            style="stop-color: var(--pow-yellow, rgba(255,210,60,1)); stop-opacity:.30"/>
      <stop offset="100%"
            style="stop-color: rgba(0,0,0,1); stop-opacity:.70"/>
    </linearGradient>
  </defs>

  <circle cx="32" cy="32" r="26"
          fill="none"
          stroke="url(#pr_rim)"
          stroke-width="6"/>

  <circle cx="32" cy="32" r="19"
          fill="none"
          stroke="rgba(0,0,0,.45)"
          stroke-width="2"/>

  <circle cx="26" cy="24" r="10"
          fill="url(#pr_base)"
          opacity=".55"/>
</svg>`;

const WISDOM_SMALL_SVG = `
<svg viewBox="0 0 64 64"
     class="lane-svg wisdom-svg"
     aria-hidden="true"
     focusable="false">

  <circle cx="32" cy="32" r="26"
          fill="rgba(0,0,0,.22)"
          style="stroke: var(--wis-bone, rgba(235,225,205,1)); stroke-opacity:.22"
          stroke-width="2"/>

  <circle cx="32" cy="32" r="20"
          fill="none"
          style="stroke: var(--wis-tan, rgba(205,170,120,1)); stroke-opacity:.45"
          stroke-width="2"/>

  <circle cx="32" cy="32" r="14"
          fill="none"
          style="stroke: var(--wis-wood2, rgba(140,95,55,1)); stroke-opacity:.40"
          stroke-width="2"/>

  <circle cx="32" cy="32" r="8"
          fill="none"
          style="stroke: var(--wis-wood1, rgba(90,60,30,1)); stroke-opacity:.35"
          stroke-width="2"/>

  <circle cx="30" cy="28" r="6"
          style="fill: var(--wis-bone, rgba(235,225,205,1)); fill-opacity:.10"
          opacity=".6"/>
</svg>`;

const POWER_PREMIUM_SVG = `
<svg viewBox="0 0 120 120"
     class="decal-svg power-premium"
     aria-hidden="true"
     focusable="false">
  <defs>
    <radialGradient id="pp_base" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="rgba(255,255,255,.22)"/>
      <stop offset="55%" stop-color="rgba(255,255,255,.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,.65)"/>
    </radialGradient>

    <linearGradient id="pp_rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,.30)"/>
      <stop offset="50%" stop-color="rgba(255,255,255,.10)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,.72)"/>
    </linearGradient>
  </defs>

  <circle cx="60" cy="60" r="46" fill="url(#pp_base)" opacity=".78"/>

  <circle cx="60" cy="60" r="44"
          fill="none" stroke="url(#pp_rim)"
          stroke-width="10" opacity=".75"/>

  <circle cx="60" cy="60" r="34"
          fill="none" stroke="rgba(0,0,0,.45)"
          stroke-width="2" opacity=".85"/>

  <circle class="prog-bg"
          cx="60" cy="60" r="44"
          fill="none"
          stroke="rgba(255,255,255,.10)"
          stroke-width="10"/>

  <circle class="prog-fg"
        cx="60" cy="60" r="44"
        fill="none"
        stroke="var(--powStroke, rgba(255,210,60,1))"
        stroke-width="10"
        stroke-linecap="round"
        transform="rotate(-90 60 60)"/>

  <circle cx="60" cy="60" r="20"
          fill="rgba(0,0,0,.22)"
          stroke="rgba(255,255,255,.12)"
          stroke-width="2"/>
</svg>`;

const WISDOM_PREMIUM_SVG = `
<svg viewBox="0 0 120 120"
     class="decal-svg wisdom-premium"
     aria-hidden="true"
     focusable="false">
  <defs>
    <radialGradient id="wp_base" cx="40%" cy="35%" r="85%">
      <stop offset="0%" stop-color="rgba(255,255,255,.14)"/>
      <stop offset="55%" stop-color="rgba(255,255,255,.05)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,.72)"/>
    </radialGradient>

    <linearGradient id="wp_rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,.22)"/>
      <stop offset="55%" stop-color="rgba(255,255,255,.06)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,.78)"/>
    </linearGradient>

    <filter id="wp_grain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise"
        baseFrequency="0.9"
        numOctaves="2"
        seed="7"
        result="noise"/>
      <feColorMatrix in="noise" type="matrix"
        values="
          1 0 0 0 0
          0 0.45 0 0 0
          0 0 0.15 0 0
          0 0 0 0.55 0"
        result="grain"/>
      <feGaussianBlur in="grain" stdDeviation="0.35"/>
    </filter>

    <mask id="wp_bandMask">
      <rect width="120" height="120" fill="black"/>
      <circle cx="60" cy="60" r="46" fill="white"/>
      <circle cx="60" cy="60" r="22" fill="black"/>
    </mask>
  </defs>

  <circle cx="60" cy="60" r="46" fill="url(#wp_base)" opacity=".88"/>
  <circle cx="60" cy="60" r="46" fill="none" stroke="url(#wp_rim)" stroke-width="4" opacity=".85"/>

  <g mask="url(#wp_bandMask)" filter="url(#wp_grain)" opacity=".12">
    <circle cx="60" cy="60" r="46" style="fill: var(--wis-tan, rgb(205,170,120)); fill-opacity:1"/>
  </g>

  <circle class="honor-grow-fill"
          cx="60" cy="60" r="0"
          style="fill: var(--wis-tan, rgb(205,170,120)); fill-opacity:.85"/>

  <g class="tracks" fill="none" stroke-width="6" opacity=".55">
    <circle class="track t0" cx="60" cy="60" r="46" stroke="rgba(255,255,255,.10)"/>
    <circle class="track t1" cx="60" cy="60" r="40" stroke="rgba(255,255,255,.10)"/>
    <circle class="track t2" cx="60" cy="60" r="34" stroke="rgba(255,255,255,.10)"/>
    <circle class="track t3" cx="60" cy="60" r="28" stroke="rgba(255,255,255,.10)"/>
  </g>

  <g class="bands" fill="none" stroke-width="4">
    <circle class="band b0" cx="60" cy="60" r="46" stroke="var(--wis1, #3b2a1a)"/>
    <circle class="band b1" cx="60" cy="60" r="40" stroke="var(--wis2, #6b4a2a)"/>
    <circle class="band b2" cx="60" cy="60" r="34" stroke="var(--wis3, #c2a476)"/>
    <circle class="band b3" cx="60" cy="60" r="28" stroke="var(--wis4, #f3e7cf)"/>
  </g>

  <circle cx="60" cy="60" r="20"
          fill="rgba(0,0,0,.22)"
          stroke="rgba(255,255,255,.12)"
          stroke-width="2"/>
  <circle cx="54" cy="52" r="10" fill="rgba(255,255,255,.08)" opacity=".70"/>
  <circle cx="56" cy="54" r="4" fill="rgba(0,0,0,.25)" opacity=".55"/>
</svg>`;
// ===============================
// SVG ID DE-DUPLICATION
// ===============================
function makeSuffix(kind, idx) {
  const safeKind = String(kind).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeIdx = String(idx).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeKind}-${safeIdx}`;
}

function uniquifySvg(svg, kind, idx) {
  const suffix = makeSuffix(kind, idx);

  const ids = [];
  svg.replace(/\bid="([^"]+)"/g, (_, id) => {
    ids.push(id);
    return _;
  });

  const map = new Map();
  for (const id of ids) {
    if (!map.has(id)) map.set(id, `${id}-${suffix}`);
  }

  let out = svg.replace(/\bid="([^"]+)"/g, (m, id) => `id="${map.get(id) || id}"`);

  out = out.replace(/url\(\s*(['"]?)#([^)'" ]+)\1\s*\)/g, (m, q, id) => {
    const next = map.get(id);
    return next ? `url(#${next})` : m;
  });

  out = out.replace(/\b(href|xlink:href)=["']#([^"']+)["']/g, (m, attr, id) => {
    const next = map.get(id);
    return next ? `${attr}="#${next}"` : m;
  });

  return out;
}

function smallSvgFor(kind, athleteKey) {
  const raw = kind === "strength" ? POWER_SMALL_SVG : WISDOM_SMALL_SVG;
  return uniquifySvg(raw, `${kind}-small`, athleteKey);
}

function premiumSvgFor(kind, athleteKey) {
  const raw = kind === "strength" ? POWER_PREMIUM_SVG : WISDOM_PREMIUM_SVG;
  return uniquifySvg(raw, `${kind}-premium`, athleteKey);
}

// ===============================
// Progress helpers
// ===============================
function setCircleProgress(circleEl, pct01, cx = 60, cy = 60) {
  if (!circleEl) return;
  const pct = clamp(Number(pct01 || 0), 0, 1);

  const r = Number(circleEl.getAttribute("r"));
  const c = 2 * Math.PI * r;

  circleEl.style.strokeDasharray = `${c}`;
  circleEl.style.strokeDashoffset = `${c * (1 - pct)}`;
  circleEl.style.transform = "rotate(-90deg)";
  circleEl.style.transformOrigin = `${cx}px ${cy}px`;
}

function setRingProgress(svgEl, pct01) {
  if (!svgEl) return;
  const fg = svgEl.querySelector(".prog-fg");
  if (!fg) return;
  setCircleProgress(fg, pct01, 60, 60);
}

// ===============================
// Lane UI Spec
// ===============================
function normTrackCode(a) {
  return String(a?.trackCode || a?.track || a?.trackBase || "")
    .trim()
    .toLowerCase();
}

function getLaneUiSpec({ trackCode, lane }) {
  if (trackCode === "foundry4-combat") {
    if (lane === "strength" || lane === "honor") return { total: 1200, slots: 3 };
    return { total: null, slots: null };
  }

  if (trackCode === "sandman-strength") {
    if (lane === "strength") return { total: 2400, slots: 6 };
    return { blocked: true };
  }

  if (trackCode === "sandman-honor") {
    if (lane === "honor") return { total: 2400, slots: 6 };
    return { blocked: true };
  }

  if (lane === "strength" || lane === "honor") return { total: 1200, slots: 3 };
  return { total: null, slots: null };
}

// ===============================
// paintLane()
// ===============================
function paintLane({
  kind,
  xp = 0,
  rowEl,
  unitsLeftEl,
  metaRightEl,
  decalEl,
  athleteId,
  total = 2400,
  slots = 6,
}) {
  const athleteKey = String(athleteId || "").replace(/[^a-zA-Z0-9_-]/g, "_");

  const totalXP = Math.max(0, Number(xp || 0));
  const step = total / slots;

  const capXP = Math.min(totalXP, total);
  const isMax = capXP >= total;

  const effective = isMax ? total : Math.max(0, capXP - 1e-6);
  const earned = Math.min(slots, Math.floor(effective / step));

  const inStep = capXP - earned * step;

  const unitXP = isMax
    ? Math.round(step)
    : Math.max(0, Math.min(Math.round(step), Math.round(inStep)));

  if (rowEl) {
    rowEl.innerHTML = "";
    for (let i = 0; i < slots; i++) {
      const slot = document.createElement("span");
      slot.className = `lane-slot ${kind === "strength" ? "ring" : "feather"}`;
      if (i < earned) slot.classList.add("earned");
      if (i === earned && earned < slots) slot.classList.add("active");
      slot.innerHTML = smallSvgFor(kind, `${athleteKey}-s${i}`);
      rowEl.appendChild(slot);
    }
  }

  if (unitsLeftEl) unitsLeftEl.textContent = `${earned}/${slots}`;

  if (decalEl) {
    decalEl.classList.add("lane-decal");
    decalEl.classList.toggle("power", kind === "strength");
    decalEl.classList.toggle("wisdom", kind !== "strength");

    decalEl.innerHTML = premiumSvgFor(kind, athleteKey);

    if (kind === "strength") {
      const stage = unitXP < 100 ? 0 : unitXP < 200 ? 1 : unitXP < 300 ? 2 : 3;
      decalEl.classList.remove("stage-0", "stage-1", "stage-2", "stage-3");
      decalEl.classList.add(`stage-${stage}`);

      const svg = decalEl.querySelector("svg");
      setRingProgress(svg, clamp(unitXP / 400, 0, 1));
    } else {
      const svg = decalEl.querySelector("svg");
      if (!svg) return;

      const pct01 = clamp(unitXP / 400, 0, 1);
      const pct100 = pct01 * 100;

      // Honor fills from inside → outside
      const fill = svg.querySelector(".honor-grow-fill");
      if (fill) {
        fill.setAttribute("r", 20 + (26 * pct01));
      }

      // Honor rings unlock from inside → outside
      const bands = [
        svg.querySelector(".band.b3"), // inner
        svg.querySelector(".band.b2"),
        svg.querySelector(".band.b1"),
        svg.querySelector(".band.b0")  // outer
      ];

      bands.forEach((band, i) => {
        if (!band) return;
        const threshold = (i + 1) * 25;
        band.style.opacity = pct100 >= threshold ? "1" : "0.1";
      });
    }
  }

  const unitPct = Math.floor((unitXP / step) * 100);
  if (metaRightEl) metaRightEl.textContent = `Progress: ${unitPct}%`;
}
// ---------- drop lock helpers ----------
function setDropLocked(block, locked) {
  const section = document.querySelector(`.drop[data-block="${block}"]`);
  if (!section) return;

  section.classList.toggle("locked", !!locked);

  const icon = section.querySelector(".lock-icon");
  if (icon) icon.textContent = locked ? "🔒" : "🔓";

  const hint = section.querySelector(".unlock-hint");
  if (hint) hint.style.display = locked ? "inline" : "none";

  const head = section.querySelector(".drop-head");
  if (head) head.style.pointerEvents = locked ? "none" : "";

  const body = section.querySelector(".drop-body");
  if (body) body.classList.toggle("collapsed", !!locked);

  syncDrop(section);
}

function setAllDrops(open) {
  document.querySelectorAll(".card.drop").forEach((section) => {
    const body = section.querySelector(".drop-body");
    if (!body) return;
    body.classList.toggle("collapsed", !open);
    syncDrop(section);
  });
}

function bindDrops() {
  document.querySelectorAll(".card.drop").forEach((section) => {
    const btn = section.querySelector(".drop-head");
    const body = section.querySelector(".drop-body");
    if (!btn || !body) return;

    syncDrop(section);

    btn.addEventListener("click", () => {
      const locked = section.classList.contains("locked");
      if (locked && !reviewMode && viewMode !== "coach" && viewMode !== "full") return;
      body.classList.toggle("collapsed");
      syncDrop(section);
    });
  });
}

function bindReviewControls() {
  const review = document.getElementById("toggle-review");
  const openAll = document.getElementById("btn-open-all");
  const closeAll = document.getElementById("btn-close-all");

  if (openAll) openAll.addEventListener("click", () => setAllDrops(true));
  if (closeAll) closeAll.addEventListener("click", () => setAllDrops(false));

  if (review) {
    review.checked = reviewMode;
    if (reviewMode) setAllDrops(true);

    review.addEventListener("change", () => {
      reviewMode = !!review.checked;
      localStorage.setItem("sm_review_mode", reviewMode ? "1" : "0");
      if (reviewMode) setAllDrops(true);
    });
  }
}

// ---------- init bindings ----------
bindDrops();
bindReviewControls();

if (viewMode === "full") setAllDrops(true);
if (reviewMode) setAllDrops(true);

// ===============================
// MAIN
// ===============================
(async () => {
  await ensureSignedIn();
  const ref = doc(db, "athletes", athleteId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    document.body.innerHTML = "<main class='wrap'><p>Unknown athlete.</p></main>";
    return;
  }

  const a = snap.data();
  const trackCode = normTrackCode(a) || "foundry4-combat";


  // -----------------------------
  // Identity
  // -----------------------------
  const fullName =
    a.fullName ||
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim() ||
    a.publicName ||
    athleteId;

  safeText("out-name", fullName);
  safeText("out-public", a.publicName || fullName);

  const avatar = $("ath-avatar");
  if (avatar) {
    if (a.photoUrl) {
      avatar.style.backgroundImage = `url(${a.photoUrl})`;
      avatar.textContent = "";
    } else {
      avatar.style.backgroundImage = "";
      avatar.textContent = (fullName || "?").slice(0, 1);
    }
  }

  // -----------------------------
  // Team / location
  // -----------------------------
  const rawTeam = (a.team || "").trim();
  const cityTxt = (a.city || "").trim();
  const stateTxt = (a.state || "").trim();

  const academy =
    (a.academy || "").trim() ||
    (rawTeam && !rawTeam.toLowerCase().startsWith("sandman") ? rawTeam : "") ||
    "Academy of Wrestling";

  safeText("out-team", academy);

  let cityState = "";
  if (cityTxt && stateTxt) cityState = `${cityTxt}, ${stateTxt}`;
  else if (cityTxt || stateTxt) cityState = cityTxt || stateTxt;
  else {
    const hint = `${academy} ${rawTeam}`.toLowerCase();
    if (hint.includes("lompoc")) cityState = "Lompoc, CA";
  }
  safeText("out-citystate", cityState);

  // -----------------------------
  // Mint / UID
  // -----------------------------
  const mintTag = String(a?.mintVirtueTag || a?.mintTag || "").trim() || "";

  function deriveMintTagFromUid(a, fallbackId) {
    const uid = String(a?.uid || a?.uidCode || fallbackId || "").trim();
    const prefix = uid.startsWith("F4_") ? "F4" : "F4";
    const num = uid.match(/(\d{4})/)?.[1] || "0000";
    const lane = "CB";
    const virtueRaw = String(a?.virtueName || a?.virtue || a?.virtueCode || "UNK").toUpperCase();
    return `${prefix}_${lane}${num}_${virtueRaw}`;
  }

  const displayMintTag = mintTag || deriveMintTagFromUid(a, athleteId);
  safeHTML("out-uid", `<div>${displayMintTag}</div>`);

  // -----------------------------
  // Ladder + tierNum
  // -----------------------------
  const ladder = LADDER_F4;

  safeText("combatArcTitle", "⚔️ Combat · Path 2 Legend");

  let tierNum = 0;
  if (typeof a.tier === "number") tierNum = a.tier;
  else if (typeof a.tier === "string") tierNum = Number(a.tier.replace(/[^\d]/g, "")) || 0;
  else if (typeof a.rank === "string") tierNum = Number(a.rank.replace(/[^\d]/g, "")) || 0;


  // -----------------------------
  // Combat XP buckets
  // -----------------------------
  const xpDaily = Number(a.xpDaily ?? 0);
  const xpArena = Number(a.xpArena ?? 0);
  const xpFightIQ = Number(a.xpFightIQ ?? 0);

  const combatXp = Number(
    a.xp ??
    a.xpTotal ??
    a.xpCombat ??
    (xpDaily + xpArena + xpFightIQ) ??
    0
  );

  if (viewMode === "coach" || viewMode === "full") {
    safeText("xp-daily", xpDaily, "0");
    safeText("xp-arena", xpArena, "0");
    safeText("xp-fightiq", xpFightIQ, "0");
    safeText("xp-total", combatXp, "0");
  }

  // -----------------------------
  // Stripe info
  // -----------------------------
  const storedTierNum = getStoredTierNum(a);
  const storedStripes = getStoredStripes(a);
  const storedXpCap = getStoredXpCap(a, ladder, storedTierNum);

  const tierInfo = ladder?.[storedTierNum] || {};
  const req = unlockRules({ tierName: a?.rankName || a?.tierName || tierInfo?.name });

  // -----------------------------
  // Rank / Color display
  // -----------------------------
  const rankName =
    a.rankName ||
    a.tierName ||
    a.rank ||
    tierInfo?.rank ||
    tierInfo?.name ||
    "Apprentice";

  const rankColor =
    a.rankColor ||
    tierInfo?.color ||
    tierInfo?.rankColor ||
    "#ffffff";

  safeHTML(
    "out-rank",
    `
    <span style="
      display:inline-block;
      width:10px;
      height:10px;
      border-radius:999px;
      background:${rankColor};
      margin-right:6px;
      vertical-align:middle;
    "></span>
    ${rankName}
    `
  );

const badgeRow = $("ath-badge-history");

if (badgeRow) {
  badgeRow.innerHTML = "";

  const F4_BADGES = {
    t0: "t0-apprentice.png",
    t1: "t1-warrior.png",
    t2: "t2-champion.png",
    t3: "t3-veteran.png",
    t4: "t4-legend.png",
  };

  const currentTier = String(a.tier || "T0").toUpperCase();

  const badges = Array.isArray(a.badges) && a.badges.length
    ? a.badges
    : [{ tier: a.tier || "T0", rankName }];

  // Past badges only
  const pastBadges = badges.filter(
    (b) => String(b.tier || "").toUpperCase() !== currentTier
  );

  // Render past badges small
  pastBadges.forEach((b) => {
    const histTierNum = Number(String(b.tier || "T0").replace("T", "")) || 0;
    const file = F4_BADGES[`t${histTierNum}`];
    if (!file) return;

    const img = document.createElement("img");
    img.src = `/assets/img/f4/${file}`;
    img.className = "badge-history-small";
    img.alt = `${b.rankName || "Badge"} badge`;

    badgeRow.appendChild(img);
  });

  // Render current badge big
  const currentTierNum = Number(String(a.tier || "T0").replace("T", "")) || 0;
  const currentFile = F4_BADGES[`t${currentTierNum}`] || F4_BADGES.t0;

  const currentImg = document.createElement("img");
  currentImg.src = `/assets/img/f4/${currentFile}`;
  currentImg.className = "badge-current-big";
  currentImg.alt = `${rankName} current badge`;

  badgeRow.appendChild(currentImg);
}  

  // -----------------------------
  // Belt bar UI
  // -----------------------------
  const stripeMax = 4;
  const xpNow = Math.max(0, Math.round(Number(combatXp || 0)));
  const xpCap = Math.max(0, Math.round(Number(storedXpCap || 0)));
  const isAtCap = xpCap && xpNow >= xpCap;

  const displayStripes = getEffectiveStripes({
    xpNow,
    xpCap,
    storedStripes,
    stripeMax
  });

// ===== NEW BELT RENDER =====

const colorMap = {
  Apprentice: "belt-white",
  Warrior: "belt-blue",
  Champion: "belt-purple",
  Veteran: "belt-brown",
  Legend: "belt-black"
};

const mappedColor = colorMap[rankName] || "belt-white";

safeHTML(
  "rankBar",
  renderDigitalBelt({
    colorClass: mappedColor,
    stripes: displayStripes,
    size: "medium"
  })
);
  const xpEl = document.getElementById("xpText");
  if (xpEl) {
    if (xpCap) {
      xpEl.textContent = isAtCap
        ? `XP: ${xpCap}/${xpCap}`
        : `XP: ${xpNow}/${xpCap}`;
    } else {
      xpEl.textContent = `XP: ${xpNow}`;
    }
  }

  // LANE LOCKS
applyLaneLocks({
  tierName: rankName,
  stripesEarned: displayStripes,
  athlete: a,
});
  // -----------------------------
  // Strength / Honor
  // -----------------------------
  const strengthXP = Number(a.xpStrength ?? a.strengthXP ?? 0);
  const honorXP = Number(a.xpHonor ?? a.honorXP ?? 0);

  const strengthSpec = getLaneUiSpec({ trackCode, lane: "strength" });
  const honorSpec = getLaneUiSpec({ trackCode, lane: "honor" });

  const strengthBlocked = !!strengthSpec?.blocked;
  const honorBlocked = !!honorSpec?.blocked;
const strengthUnlocked =
  a.unlocks?.strength === true ||
  displayStripes >= (req.strength ?? 999);

const honorUnlocked =
  a.unlocks?.honor === true ||
  displayStripes >= (req.honor ?? 999);
const canSeeStrength =
  !strengthBlocked &&
  ((viewMode === "coach" || viewMode === "full" || reviewMode) || strengthUnlocked);

const canSeeHonor =
  !honorBlocked &&
  ((viewMode === "coach" || viewMode === "full" || reviewMode) || honorUnlocked);
  if (canSeeStrength) {
    paintLane({
      kind: "strength",
      athleteId,
      xp: strengthXP,
      rowEl: $("strengthRings"),
      unitsLeftEl: $("strengthUnitsLeft"),
      metaRightEl: $("strengthMetaRight"),
      decalEl: $("strengthDecal"),
      total: strengthSpec.total,
      slots: strengthSpec.slots,
    });
  } else {
    const s = $("strengthLane");
    if (s) s.style.display = "none";
  }

  if (canSeeHonor) {
    paintLane({
      kind: "honor",
      athleteId,
      xp: honorXP,
      rowEl: $("honorRings"),
      unitsLeftEl: $("honorUnitsLeft"),
      metaRightEl: $("honorMetaRight"),
      decalEl: $("honorDecal"),
      total: honorSpec.total,
      slots: honorSpec.slots,
    });
  } else {
    const h = $("honorLane");
    if (h) h.style.display = "none";
  }

  // -----------------------------
  // Skills
  // -----------------------------
  safeText("skill-neutral", a.skillNeutral);
  safeText("skill-top", a.skillTop);
  safeText("skill-bottom", a.skillBottom);
  safeText("skill-next", a.skillNext);
  safeText("coach-notes", a.coachNotes);

  // -----------------------------
  // XP logs
  // -----------------------------
  async function loadLogs() {
    const candidates = ["xpLogs", "xp_logs"];
    for (const sub of candidates) {
      try {
        const q1 = query(
          collection(db, "athletes", athleteId, sub),
          orderBy("ts", "desc"),
          limit(15)
        );
        const logs = await getDocs(q1);
        if (!logs.empty) return logs;
      } catch (e) {}
    }
    return null;
  }

  try {
    const logsSnap = await loadLogs();
    const items = [];
    let lastStyle = null;

    if (logsSnap) {
      logsSnap.forEach((l) => {
        const d = l.data();
        const delta = Number(d.delta ?? d.amount ?? 0);
        const sign = delta > 0 ? "+" : "";
        const label = d.event || d.kind || "log";
        items.push(`<li>${sign}${delta} <span class="muted">(${label})</span></li>`);
        if (!lastStyle && (String(label).includes("STYLE") || d.meta?.style)) lastStyle = d.meta?.style;
      });
    }

    const feed = $("feed");
    if (feed) feed.innerHTML = items.length ? items.join("") : "<li class='muted'>No entries yet.</li>";
    safeText("last-style", lastStyle || "—");
  } catch (err) {
    const feed = $("feed");
    if (feed) feed.innerHTML = "<li class='muted'>Logs unavailable.</li>";
  }

  // -----------------------------
  // Season
  // -----------------------------
  try {
    const tq = query(
      collection(db, "tournaments"),
      where("athleteUid", "==", athleteId),
      orderBy("date", "desc"),
      limit(6)
    );

    const tSnap = await getDocs(tq);
    const rows = [];

    tSnap.forEach((docSnap) => {
      const t = docSnap.data();
      const date =
        t.dateStr ||
        (t.date && t.date.toDate?.().toLocaleDateString()) ||
        "—";
      const name = t.name || t.eventName || "Event";
      const wt = t.weightClass || t.weight || "—";
      const rec = `${t.wins ?? 0}-${t.losses ?? 0}`;
      const plc = t.place || "—";
      const pts = t.teamPoints ?? 0;

      rows.push(`
        <tr>
          <td style="padding:4px 2px">${date}</td>
          <td style="padding:4px 2px">${name}</td>
          <td style="padding:4px 2px;text-align:center">${wt}</td>
          <td style="padding:4px 2px;text-align:center">${rec}</td>
          <td style="padding:4px 2px;text-align:center">${plc}</td>
          <td style="padding:4px 2px;text-align:center">${pts}</td>
        </tr>
      `);
    });

    const tbody = $("tour-body");
    if (tbody) {
      tbody.innerHTML = rows.length
        ? rows.join("")
        : `<tr><td colspan="6" class="muted" style="padding:6px 2px;text-align:center">No tournaments yet.</td></tr>`;
    }
  } catch (err) {
    const tbody = $("tour-body");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="muted" style="padding:6px 2px;text-align:center">
            Tournament data unavailable.
          </td>
        </tr>`;
    }
  }
})();