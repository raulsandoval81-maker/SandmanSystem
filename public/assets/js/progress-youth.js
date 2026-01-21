/* ---------------------------------------------------------------------------
  Sandman Combat System™ — Youth
  STATUS: CURRENT IN-USE SCRIPT
  Shadow = 3 stripes (33/66/100); others = 4 (25/50/75/100)
--------------------------------------------------------------------------- */

console.log("[youth] xp-youth.js loaded");

import { LADDER_YOUTH, getStripeInfo, formatTierLine } from "./ladder.service.js";
import { BELT_YOUTH } from "./belt.palette.js";

/* Utils */
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
function darken(hex, amt = 15) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return hex || "#444";
  let [r,g,b] = m.slice(1).map(x => parseInt(x,16));
  const rr=r/255, gg=g/255, bb=b/255, max=Math.max(rr,gg,bb), min=Math.min(rr,gg,bb);
  let h,s,l=(max+min)/2;
  if (max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){ case rr:h=(gg-bb)/d+(gg<bb?6:0);break; case gg:h=(bb-rr)/d+2;break; default:h=(rr-gg)/d+4; }
    h/=6;
  } else { h=s=0; }
  l = clamp(l - amt/100, 0, 1);
  const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3 - t)*6; return p; };
  const q = l<.5 ? l*(1+s) : l + s - l*s, p = 2*l - q;
  const R=Math.round(hue2rgb(p,q,h+1/3)*255), G=Math.round(hue2rgb(p,q,h)*255), B=Math.round(hue2rgb(p,q,h-1/3)*255);
  return `#${[R,G,B].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}

const thresholdsFor = (tierKey) =>
  (tierKey === "shadow") ? [33,66,100] : [25,50,75,100];

/* Painter */
export function updateYouthBar(totalXP = 0) {
  const info = getStripeInfo(LADDER_YOUTH, totalXP);
  const curName  = info.tier?.name || "—";
  const nextName = info.nextTier?.name || "(max)";
  const tierKey  = (curName || "").toLowerCase();

  // % within current tier (visual cap 100)
  const start = info.tier?.start ?? 0;
  const cap   = info.tier?.cap ?? (start + 1);
  const span  = Math.max(1, cap - start);
  const pct   = clamp(((totalXP - start) / span) * 100);

  // DOM
  const rankBar = document.getElementById("rankBar");
  const fillEl  = document.getElementById("rankFill");
  const ticksEl = document.getElementById("stripeTicks");
  const pctEl   = document.getElementById("progressPct");
  const curEl   = document.getElementById("curTier");
  const nextEl  = document.getElementById("nextTier");
  const lineEl  = document.getElementById("tierLine");
  const sLineEl = document.getElementById("stripeLine");
  const totalEl = document.getElementById("totalXp");

  if (!rankBar || !fillEl || !ticksEl) {
    console.warn("[youth] Missing #rankBar/#rankFill/#stripeTicks in DOM");
    return;
  }

  // labels
  if (curEl)  curEl.textContent  = curName.toUpperCase();
  if (nextEl) nextEl.textContent = nextName;
  if (pctEl)  pctEl.textContent  = `${Math.round(pct)}%`;
  if (lineEl) lineEl.textContent = formatTierLine(LADDER_YOUTH, totalXP);
  if (totalEl) totalEl.textContent = String(totalXP);

  // stripes (final tier → none)
  const thresholds   = (nextName === "(max)") ? [] : thresholdsFor(tierKey);
  const stripesTotal = thresholds.length;
  const stripesEarned = thresholds.reduce((n, t) => n + (pct >= t ? 1 : 0), 0);

  // aria + dataset
  rankBar.setAttribute("aria-valuenow", String(Math.round(pct)));
  rankBar.dataset.ladder = "youth";
  rankBar.dataset.tierKey = tierKey;
  rankBar.dataset.thresholds = thresholds.join(",");
  rankBar.dataset.stripesEarned = String(stripesEarned);
  rankBar.dataset.excessXp = String(Math.max(0, totalXP - cap));

  // state classes
  const isReady  = pct >= 100 && stripesEarned >= stripesTotal && nextName !== "(max)";
  const isCapped = pct >= 100 && !isReady && nextName !== "(max)";
  const isFinal  = nextName === "(max)" && pct >= 100;
  rankBar.classList.toggle("is-ready", isReady);
  rankBar.classList.toggle("is-capped", isCapped);
  rankBar.classList.toggle("is-final", isFinal);

  // fill + palette
  const pal = BELT_YOUTH[curName] || {};
  const startCol = pal.bandStart || "#e5e7eb";
  const endCol   = pal.bandEnd   || "#9ca3af";
  const outline  = pal.outline   || "#2A2A36";
  fillEl.style.width      = `${pct}%`;
  fillEl.style.background = `linear-gradient(90deg, ${startCol}, ${endCol})`;
  fillEl.style.boxShadow  = `inset 0 0 0 1px ${outline}`;

  // ticks
  ticksEl.innerHTML = "";
  thresholds.forEach((t, i) => {
    const tick = document.createElement("div");
    const earned = i < stripesEarned;
    tick.className = "tick" + (earned ? " earned" : "");
    tick.style.left = `calc(${t}% - 1px)`;
    if (earned) {
      const tint = darken(endCol, 15);
      tick.style.background = tint;
      tick.style.boxShadow  = `0 0 0 1px ${outline}22`;
    }
    ticksEl.appendChild(tick);
  });

  // status line
  if (sLineEl) {
    if (isFinal) sLineEl.textContent = "MAXED — Junior Legend";
    else if (isReady) sLineEl.textContent = "PROMOTION READY";
    else if (isCapped) sLineEl.textContent = "Max XP — stripes remaining";
    else sLineEl.textContent = `Stripes ${stripesEarned}/${stripesTotal}`;
  }
}

/* -------- Recent XP Log with Timestamp -------- */
function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addRecentXpEntry(points, skill) {
  const log = document.getElementById("recentXp");
  if (!log) return;

  const div = document.createElement("div");
  div.className = "recent-entry";
  const time = formatTime();

  div.innerHTML = `<strong>+${points} XP</strong> — ${skill} <span>${time}</span>`;
  log.prepend(div);

  while (log.children.length > 5) log.removeChild(log.lastChild);
}

/* ---- Demo wiring so you can SEE movement without Firebase ---- */
let demoXP = 0;
try {
  const qs = new URLSearchParams(location.search);
  if (qs.has("xp")) demoXP = parseInt(qs.get("xp"), 10) || 0;
} catch { /* ignore */ }

window.updateYouthBar = updateYouthBar;

document.addEventListener("DOMContentLoaded", () => {
  console.log("[youth] DOM ready → demo paint", demoXP);
  updateYouthBar(demoXP);

  const addBtn  = document.getElementById("addXpBtn");
  const loadBtn = document.getElementById("loadTotalBtn");
  const xpInput = document.getElementById("xp");
  const skillInput = document.getElementById("skill") || { value: "unspecified" };
  const totalEl = document.getElementById("totalXp");

  if (totalEl) totalEl.textContent = String(demoXP);

  if (addBtn && xpInput) {
    addBtn.addEventListener("click", () => {
      const add = parseInt(xpInput.value, 10) || 0;
      demoXP = Math.max(0, demoXP + add);
      if (totalEl) totalEl.textContent = String(demoXP);
      updateYouthBar(demoXP);

      // NEW: log entry with time + skill
      addRecentXpEntry(add, skillInput.value || "unspecified");
    });
  }
  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      updateYouthBar(demoXP);
    });
  }
});
