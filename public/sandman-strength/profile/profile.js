// /sandman-strength/profile/profile.js
// Strength-only profile surface (standalone)
// - NO combat bar, NO stripes, NO locks
// - Uses xpStrength only
// - Always 2400 total, 6 segments (400 each)

import {
  db, doc, getDoc,
  collection, query, orderBy, limit, getDocs
} from "/assets/js/firebase-init.js";

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

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// ---------- params ----------
const params = new URLSearchParams(location.search);
const athleteId =
  params.get("id") ||
  params.get("uid") ||
  params.get("athleteId") ||
  localStorage.getItem("currentAthleteId");

if (!athleteId) {
  document.body.innerHTML = "<main class='wrap'><p>Missing athlete id. Use ?id=</p></main>";
  throw new Error("Missing athlete id");
}

// ===============================
// Strength/Honor visuals (VISUAL ONLY)
// (Keep as-is; we only use Strength in this page)
// ===============================

// Strength — Rings of Power (SMALL)
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

// Honor SVGs kept (unused here) — safe to remove later if you want
const WISDOM_SMALL_SVG = ``;

// Strength — Rings of Power (PREMIUM)
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

// Honor premium kept (unused) — safe to remove later
const WISDOM_PREMIUM_SVG = ``;

// ===============================
// SVG ID DE-DUPLICATION (REQUIRED)
// ===============================
function makeSuffix(kind, idx) {
  const safeKind = String(kind).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeIdx  = String(idx).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeKind}-${safeIdx}`;
}

function uniquifySvg(svg, kind, idx) {
  const suffix = makeSuffix(kind, idx);

  const ids = [];
  svg.replace(/\bid="([^"]+)"/g, (_, id) => { ids.push(id); return _; });

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
  const raw = (kind === "strength") ? POWER_SMALL_SVG : WISDOM_SMALL_SVG;
  return uniquifySvg(raw, `${kind}-small`, athleteKey);
}

function premiumSvgFor(kind, athleteKey) {
  const raw = (kind === "strength") ? POWER_PREMIUM_SVG : WISDOM_PREMIUM_SVG;
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
// paintLane() (your exact logic)
// ===============================
function paintLane({
  kind,              // "strength"
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
  const step = total / slots; // 400

  const capXP = Math.min(totalXP, total);
  const isMax = capXP >= total;

  const effective = isMax ? total : Math.max(0, capXP - 1e-6);
  const earned = Math.min(slots, Math.floor(effective / step)); // 0..6

  const inStep = capXP - earned * step;

  const unitXP = isMax
    ? Math.round(step)
    : Math.max(0, Math.min(Math.round(step), Math.round(inStep)));

  // LEFT ROW
  if (rowEl) {
    rowEl.innerHTML = "";
    for (let i = 0; i < slots; i++) {
      const slot = document.createElement("span");
      slot.className = "lane-slot ring";
      if (i < earned) slot.classList.add("earned");
      if (i === earned && earned < slots) slot.classList.add("active");
      slot.innerHTML = smallSvgFor("strength", `${athleteKey}-s${i}`);
      rowEl.appendChild(slot);
    }
  }

  if (unitsLeftEl) unitsLeftEl.textContent = `${earned}/${slots}`;

  // RIGHT premium decal
  if (decalEl) {
    decalEl.classList.add("lane-decal", "power");
    decalEl.innerHTML = premiumSvgFor("strength", athleteKey);

    const stage = unitXP < 100 ? 0 : unitXP < 200 ? 1 : unitXP < 300 ? 2 : 3;
    decalEl.classList.remove("stage-0","stage-1","stage-2","stage-3");
    decalEl.classList.add(`stage-${stage}`);

    const svg = decalEl.querySelector("svg");
    setRingProgress(svg, clamp(unitXP / 400, 0, 1));
  }

if (metaRightEl) {
  const pct = Math.round((capXP / total) * 100);
  metaRightEl.textContent = `Progress: ${pct}%`;
}}

// ===============================
// MAIN
// ===============================
(async () => {
  
  const ref = doc(db, "athletes", athleteId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    document.body.innerHTML = "<main class='wrap'><p>Unknown athlete.</p></main>";
    return;
  }

  const a = snap.data();

  // Identity
  const fullName =
    a.fullName ||
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim() ||
    a.publicName ||
    athleteId;

  safeText("out-name", fullName);

  const avatar = $("ath-avatar");
  if (avatar) {
    if (a.photoUrl) {
      avatar.style.backgroundImage = `url(${a.photoUrl})`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.textContent = "";
    } else {
      avatar.style.backgroundImage = "";
      avatar.textContent = (fullName || "?").slice(0, 1);
    }
  }

  const academy = (a.academy || a.team || "—").trim() || "—";
  safeText("out-team", academy);

  const city = (a.city || "").trim();
  const state = (a.state || "").trim();
  safeText("out-citystate", (city && state) ? `${city}, ${state}` : (city || state || "—"));

  const mintTag = String(a?.mintVirtueTag || a?.mintTag || "").trim();
  safeHTML("out-uid", `<div>${mintTag || athleteId}</div>`);

  // Strength-only (always 2400/6)
  const strengthXP = Number(a.xpStrength ?? a.strengthXP ?? 0);

  paintLane({
    kind: "strength",
    athleteId,
    xp: strengthXP,
    rowEl: $("strengthRings"),
    unitsLeftEl: $("strengthUnitsLeft"),
    metaRightEl: $("strengthMetaRight"),
    decalEl: $("strengthDecal"),
    total: 2400,
    slots: 6,
  });

  // Logs (best-effort, filter to strength)
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
      } catch {}
    }
    return null;
  }

  try {
    const logsSnap = await loadLogs();
    const items = [];

    if (logsSnap) {
      logsSnap.forEach(l => {
        const d = l.data();
        const label = String(d.event || d.kind || "log");
        const kind = label.toUpperCase();

        // Keep only Strength-ish logs (adjust to your real naming)
        if (!kind.includes("STRENGTH") && !kind.includes("POWER") && !kind.includes("RING")) return;

        const delta = Number(d.delta ?? d.amount ?? 0);
        const sign = delta > 0 ? "+" : "";
        items.push(`<li>${sign}${delta} <span class="muted">(${label})</span></li>`);
      });
    }

    const feed = $("feed");
    if (feed) feed.innerHTML = items.length ? items.join("") : "<li class='muted'>No entries yet.</li>";
  } catch {
    const feed = $("feed");
    if (feed) feed.innerHTML = "<li class='muted'>Logs unavailable.</li>";
  }
})();