// /assets/js/ui-belt.js  (v2 – glow + shared)

const BELT_COLORS = {
  F4: ['#ffffff','#2563eb','#7c3aed','#8b4513','#111827'],
  F8: ['#ffffff','#facc15','#b14e07','#10b981','#2563eb','#7c3aed','#8b4513','#ffd700','#111827']
};

const XP_CAP = 1200;
const STRIPES_MAX = 4;
const XP_PER_STRIPE = XP_CAP / STRIPES_MAX;

function tierIndex(t){const n=parseInt(String(t||'0').replace(/\D/g,''),10);return Number.isFinite(n)?n:0;}
function normalizeTrack(raw=""){const r=raw.toLowerCase();return r.startsWith("foundry8")||r.startsWith("f8")?"F8":"F4";}
function beltColorFor(track,tier){
  const arr = BELT_COLORS[track] || BELT_COLORS.F4;
  return arr[Math.min(arr.length-1, Math.max(0,tierIndex(tier)))];
}
function stripeToneFor(hex){return (hex?.toLowerCase()==="#ffffff")?"black":"white";}

/** Paint XP belt + stripes */
export function renderBeltBar({ container, xp = 0, trackCode = "F4", tier = "T0" }) {
  if (!container) return;

  const track = normalizeTrack(trackCode);
  const belt  = beltColorFor(track, tier);
  const tone  = stripeToneFor(belt);
  const pct   = Math.min(100, Math.round((xp / XP_CAP) * 100));
  const earned = Math.min(STRIPES_MAX, Math.floor(xp / XP_PER_STRIPE));
  const glow   = xp >= XP_CAP; // promotion glow

  // 👉 decide the fill color
  const isT0 = (tier || "").toUpperCase() === "T0";
  const fillColor = isT0 ? "#ffffff" : belt; // white for T0, real belt for others

  container.innerHTML = `
    <div class="belt-bar${glow ? " glow" : ""}">
      <div class="belt-fill" style="width:${pct}%;background:${fillColor}"></div>
      <div class="stripe-boxes">
        ${Array.from({ length: STRIPES_MAX }).map((_, i) => `
          <div class="stripe-box ${tone} ${i < earned ? "filled" : ""}"></div>
        `).join("")}
      </div>
    </div>
    <div class="muted" style="font-size:.7rem;margin-top:3px">${xp} / ${XP_CAP}</div>
  `;
}
