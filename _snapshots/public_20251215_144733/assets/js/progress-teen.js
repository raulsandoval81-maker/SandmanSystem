/* ---------------------------------------------------------------------------
  Sandman Combat System™ — Foundry4 (Teen + Adult)
  4 stripes per tier (25/50/75/100)
  Adds: "Recent XP Adds" logging with timestamps (keeps last 5)
--------------------------------------------------------------------------- */

console.log("[f4] progress-teen.js loaded");

import { LADDER_F4, getStripeInfo, formatTierLine } from "./ladder.service.js";
import { BELT_F4 } from "./belt.palette.js";

/* Utils */
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
function darken(hex, amt = 15) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return hex || "#444";
  let [r,g,b] = m.slice(1).map(x => parseInt(x,16));
  const rr=r/255, gg=g/255, bb=b/255, mx=Math.max(rr,gg,bb), mn=Math.min(rr,gg,bb);
  let h,s,l=(mx+mn)/2;
  if (mx!==mn){ const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    switch(mx){case rr:h=(gg-bb)/d+(gg<bb?6:0);break;case gg:h=(bb-rr)/d+2;break;default:h=(rr-gg)/d+4;}
    h/=6;
  } else { h=s=0; }
  l = clamp(l - amt/100, 0, 1);
  const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3 - t)*6; return p; };
  const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
  const R=Math.round(hue2rgb(p,q,h+1/3)*255), G=Math.round(hue2rgb(p,q,h)*255), B=Math.round(hue2rgb(p,q,h-1/3)*255);
  return `#${[R,G,B].map(v=>v.toString(16)).map(s=>s.padStart(2,"0")).join("")}`;
}
const F4_THRESHOLDS = [25, 50, 75, 100];

/* Painter */
export function updateF4Bar(totalXP = 0) {
  const info = getStripeInfo(LADDER_F4, totalXP);
  if (!info || !info.tier) return;

  const curName   = info.tier.name || "—";
  const nextName  = info.nextTier ? info.nextTier.name : "(max)";
  const percent   = clamp(Number(info.percent) || 0);
  const stripesTotal  = Number(info.stripesTotal || 0);
  const stripesEarned = Number(info.stripesEarned || 0);
  const thresholds = nextName === "(max)" ? [] : F4_THRESHOLDS;

  // DOM refs
  const rankBar = document.getElementById("rankBar");
  const fillEl  = document.getElementById("rankFill");
  const ticksEl = document.getElementById("stripeTicks");
  const pctEl   = document.getElementById("progressPct");
  const curEl   = document.getElementById("curTier");
  const nextEl  = document.getElementById("nextTier");
  const lineEl  = document.getElementById("tierLine");
  const sLineEl = document.getElementById("stripeLine");
  const totalEl = document.getElementById("totalXp");
  if (!rankBar || !fillEl || !ticksEl) return;

  // labels
  curEl  && (curEl.textContent  = curName.toUpperCase());
  nextEl && (nextEl.textContent = nextName);
  pctEl  && (pctEl.textContent  = `${percent}%`);
  lineEl && (lineEl.textContent = formatTierLine(LADDER_F4, totalXP));
  totalEl&& (totalEl.textContent = String(totalXP));

  // state flags
  const isFinal  = !info.nextTier; // Legend loops
  const isReady  = !isFinal && percent >= 100 && stripesEarned >= stripesTotal;
  const isCapped = !isFinal && percent >= 100 && stripesEarned < stripesTotal;
  rankBar.classList.toggle("is-final",  isFinal);
  rankBar.classList.toggle("is-ready",  isReady);
  rankBar.classList.toggle("is-capped", isCapped);

  // status line
  if (sLineEl) {
    if (isFinal)      sLineEl.textContent = info.status || "MAXED — Legend";
    else if (isReady) sLineEl.textContent = "PROMOTION READY";
    else if (isCapped)sLineEl.textContent = "Max XP — stripes remaining";
    else              sLineEl.textContent = `Stripes ${stripesEarned}/${stripesTotal}`;
  }

  // ARIA / dataset
  rankBar.setAttribute("aria-valuenow", String(percent));
  rankBar.dataset.ladder = "f4";
  rankBar.dataset.tierKey = (curName || "").toLowerCase();
  rankBar.dataset.thresholds = thresholds.join(",");
  rankBar.dataset.stripesEarned = String(stripesEarned);
  rankBar.dataset.excessXp = "0";

  // palette
  const pal = BELT_F4[curName] || {};
  const startCol = pal.bandStart || "#FFD000";
  const endCol   = pal.bandEnd   || "#FFB700";
  const outline  = pal.outline   || "#2A2A36";

  // fill
  fillEl.style.width      = `${percent}%`;
  fillEl.style.background = `linear-gradient(90deg, ${startCol}, ${endCol})`;
  fillEl.style.boxShadow  = `inset 0 0 0 1px ${outline}`;

  // ticks
  ticksEl.innerHTML = "";
  thresholds.forEach((tPct, i) => {
    const tick = document.createElement("div");
    const earned = i < stripesEarned;
    tick.className = "tick" + (earned ? " earned" : "");
    tick.style.left = `calc(${tPct}% - 1px)`;
    if (earned) {
      const tint = darken(endCol, 15);
      tick.style.background = tint;
      tick.style.boxShadow  = `0 0 0 1px ${outline}22`;
    }
    ticksEl.appendChild(tick);
  });
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

  // keep only last 5
  while (log.children.length > 5) log.removeChild(log.lastChild);
}

/* ---------- Demo hooks (URL override + buttons) ---------- */
let demoXP = 0;
try {
  const qs = new URLSearchParams(location.search);
  if (qs.has("xp")) demoXP = parseInt(qs.get("xp"), 10) || 0;
} catch {}

if (typeof window !== "undefined") {
  window.updateF4Bar = updateF4Bar;

  document.addEventListener("DOMContentLoaded", () => {
    updateF4Bar(demoXP);

    const addBtn   = document.getElementById("addXpBtn");
    const loadBtn  = document.getElementById("loadTotalBtn");
    const xpInput  = document.getElementById("xp");
    const skillInput = document.getElementById("skill") || { value: "unspecified" };
    const totalEl  = document.getElementById("totalXp");
    const recentEl = document.getElementById("recentXp");

    totalEl && (totalEl.textContent = String(demoXP));

    // Add XP → update bar + recent log
    if (addBtn && xpInput) {
      addBtn.addEventListener("click", () => {
        const add = parseInt(xpInput.value, 10) || 0;
        if (!add) return;

        demoXP = Math.max(0, demoXP + add);
        totalEl && (totalEl.textContent = String(demoXP));
        updateF4Bar(demoXP);

        // log entry with time + skill
        addRecentXpEntry(add, skillInput.value || "unspecified");
      });
    }

    // Load Total (demo)
    if (loadBtn) {
      loadBtn.addEventListener("click", () => updateF4Bar(demoXP));
    }
  });
}
