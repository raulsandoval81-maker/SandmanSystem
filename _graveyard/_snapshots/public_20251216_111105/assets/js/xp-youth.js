/* ---------------------------------------------------------------------------
  Sandman Combat System™ — Youth (Shadow=3 stripes; others=4)
  STATUS: CURRENT — exceptions + recent UI wired through xp.ui.bundle.js
--------------------------------------------------------------------------- */

console.log("[youth] xp-youth.js");

import { LADDER_YOUTH, getStripeInfo, formatTierLine } from "./ladder.service.js";
import { BELT_YOUTH } from "./belt.palette.js";
import { wireXpTools } from "./xp.ui.bundle.js";

/* ---------- utils ---------- */
const clamp = (v, lo=0, hi=100) => Math.max(lo, Math.min(hi, v));
const thresholdsFor = (tierKey) => (tierKey === "shadow" ? [33,66,100] : [25,50,75,100]);

function darken(hex, amt = 15) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return hex || "#444";
  let [r,g,b] = m.slice(1).map(x=>parseInt(x,16));
  const rr=r/255, gg=g/255, bb=b/255, max=Math.max(rr,gg,bb), min=Math.min(rr,gg,bb);
  let h,s,l=(max+min)/2;
  if (max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){case rr:h=(gg-bb)/d+(gg<bb?6:0);break;case gg:h=(bb-rr)/d+2;break;default:h=(rr-gg)/d+4;}
    h/=6;
  } else { h=s=0; }
  l = Math.max(0, Math.min(1, l - amt/100));
  const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3 - t)*6; return p; };
  const q = l<.5 ? l*(1+s) : l + s - l*s, p = 2*l - q;
  const R=Math.round(hue2rgb(p,q,h+1/3)*255), G=Math.round(hue2rgb(p,q,h)*255), B=Math.round(hue2rgb(p,q,h-1/3)*255);
  return `#${[R,G,B].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}

/* ---------- painter ---------- */
export function updateYouthBar(totalXP = 0) {
  const info = getStripeInfo(LADDER_YOUTH, totalXP);
  const curName  = info.tier?.name || "—";
  const nextName = info.nextTier?.name || "(max)";
  const tierKey  = (curName || "").toLowerCase();

  const start = info.tier?.start ?? 0;
  const cap   = info.tier?.cap ?? (start + 1);
  const span  = Math.max(1, cap - start);
  const pct   = clamp(((totalXP - start) / span) * 100);

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
  curEl && (curEl.textContent = curName.toUpperCase());
  nextEl && (nextEl.textContent = nextName);
  pctEl  && (pctEl.textContent  = `${Math.round(pct)}%`);
  lineEl && (lineEl.textContent = formatTierLine(LADDER_YOUTH, totalXP));
  totalEl&& (totalEl.textContent = String(totalXP));

  // stripes (none on final)
  const thresholds   = (nextName === "(max)") ? [] : thresholdsFor(tierKey);
  const stripesTotal = thresholds.length;
  const stripesEarned = thresholds.reduce((n,t)=> n + (pct >= t ? 1 : 0), 0);

  // aria/state
  rankBar.setAttribute("aria-valuenow", String(Math.round(pct)));
  rankBar.dataset.ladder = "youth";
  rankBar.dataset.tierKey = tierKey;
  rankBar.dataset.thresholds = thresholds.join(",");
  rankBar.dataset.stripesEarned = String(stripesEarned);
  rankBar.dataset.excessXp = String(Math.max(0, totalXP - cap));

  const isReady  = pct >= 100 && stripesEarned >= stripesTotal && nextName !== "(max)";
  const isCapped = pct >= 100 && !isReady && nextName !== "(max)";
  const isFinal  = nextName === "(max)" && pct >= 100;
  rankBar.classList.toggle("is-ready", isReady);
  rankBar.classList.toggle("is-capped", isCapped);
  rankBar.classList.toggle("is-final", isFinal);

  // colors
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
    const node = document.createElement("div");
    const earned = i < stripesEarned;
    node.className = "tick" + (earned ? " earned" : "");
    node.style.left = `calc(${t}% - 1px)`;
    if (earned) {
      node.style.background = darken(endCol, 15);
      node.style.boxShadow  = `0 0 0 1px ${outline}22`;
    }
    ticksEl.appendChild(node);
  });

  // status
  if (sLineEl) {
    if (isFinal) sLineEl.textContent = "MAXED — Junior Legend";
    else if (isReady) sLineEl.textContent = "PROMOTION READY";
    else if (isCapped) sLineEl.textContent = "Max XP — stripes remaining";
    else sLineEl.textContent = `Stripes ${stripesEarned}/${stripesTotal}`;
  }
}

/* ---------- page wiring ---------- */
let demoXP = 0;
try { const qs = new URLSearchParams(location.search); if (qs.has("xp")) demoXP = parseInt(qs.get("xp"),10) || 0; } catch {}

if (typeof window !== "undefined") {
  window.updateYouthBar = updateYouthBar;

  document.addEventListener("DOMContentLoaded", () => {
    // initial paint
    updateYouthBar(demoXP);
    const totalEl = document.getElementById("totalXp");
    totalEl && (totalEl.textContent = String(demoXP));

    // one-call wiring: applies exceptions + logs recents + repaints
    wireXpTools({
      repaint: (total) => updateYouthBar(total),
      getTotal: () => demoXP,
      setTotal: (v) => { demoXP = v; const t = document.getElementById("totalXp"); t && (t.textContent = String(v)); }
    });
  });
}
