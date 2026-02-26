// progress-f4.js
// Foundry4 (Teen+Adult) progress bar — unified

import { LADDER_F4, getStripeInfo, formatTierLine } from "./ladder.service.js";
import { BELT_F4 } from "./belt.palette.js";
import { calcProgress } from "./progress.service.js";

export function updateF4Bar(totalXP = 0) {
  const info = getStripeInfo(LADDER_F4, totalXP);
  const curName  = info.tier?.name || "—";
  const nextName = info.nextTier?.name || "(max)";

  // 0–4 system -> not youth
  const result = calcProgress(
    totalXP,
    info.tier?.start ?? 0,
    info.tier?.cap ?? 1,
    curName.toLowerCase(),
    /* isYouth */ false
  );

  // DOM hooks (shared IDs)
  const fillEl  = document.getElementById("rankFill");
  const ticksEl = document.getElementById("stripeTicks");
  const curEl   = document.getElementById("curTier");
  const nextEl  = document.getElementById("nextTier");
  const lineEl  = document.getElementById("tierLine");
  const sLineEl = document.getElementById("stripeLine");
  const totalEl = document.getElementById("totalXp");

  if (!fillEl || !ticksEl) return;

  // Labels
  if (curEl)  curEl.textContent  = curName.toUpperCase();
  if (nextEl) nextEl.textContent = nextName;
  if (lineEl) lineEl.textContent = formatTierLine(LADDER_F4, totalXP);
  if (sLineEl) sLineEl.textContent = result.status;
  if (totalEl) totalEl.textContent = String(totalXP);

  // Fill (cap at 100 handled by service -> clamp)
  const pal = BELT_F4[curName] || {};
  const start   = pal.bandStart || "#FFD000";
  const end     = pal.bandEnd   || "#FFB700";
  const outline = pal.outline   || "#2A2A36";
  fillEl.style.width      = `${result.pct}%`;
  fillEl.style.background = `linear-gradient(90deg, ${start}, ${end})`;
  fillEl.style.boxShadow  = `inset 0 0 0 1px ${outline}`;

  // Stripes (F4 = 4 by default from service)
  ticksEl.innerHTML = "";
  const total = result.stripesTotal;
  for (let i = 0; i < total; i++) {
    const tick = document.createElement("div");
    tick.className = "tick" + (i < result.stripesEarned ? " earned" : "");
    tick.style.left = `calc(${((i + 1) / total) * 100}% - 1px)`;
    if (i < result.stripesEarned) {
      // stealth-darken earned ticks toward belt color
      const darken = (hex, amt = 15) => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
        if (!m) return hex || "#444";
        let [r,g,b] = m.slice(1).map(x => parseInt(x,16));
        const rr=r/255, gg=g/255, bb=b/255;
        const max=Math.max(rr,gg,bb), min=Math.min(rr,gg,bb);
        let h,s,l=(max+min)/2;
        if(max===min){ h=s=0; } else {
          const d=max-min;
          s = l>0.5 ? d/(2-max-min) : d/(max+min);
          switch(max){ case rr:h=(gg-bb)/d+(gg<bb?6:0); break;
            case gg:h=(bb-rr)/d+2; break; default:h=(rr-gg)/d+4; }
          h/=6;
        }
        l = Math.max(0, Math.min(1, l - amt/100));
        const hue2rgb=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1;
          if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q;
          if(t<2/3)return p+(q-p)*(2/3 - t)*6; return p; };
        const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l - q;
        const R = Math.round(hue2rgb(p,q,h+1/3)*255);
        const G = Math.round(hue2rgb(p,q,h)*255);
        const B = Math.round(hue2rgb(p,q,h-1/3)*255);
        return `#${[R,G,B].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
      };
      const tint = darken(end, 15);
      tick.style.background = tint;
      tick.style.boxShadow  = `0 0 0 1px ${outline}22`;
    }
    ticksEl.appendChild(tick);
  }
}
