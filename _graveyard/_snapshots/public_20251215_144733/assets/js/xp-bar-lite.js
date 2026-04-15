// /assets/js/xp-bar-lite.js
// draws a slim XP bar with stripe boxes on the right

const LITE_XP_CAP_DEFAULT = 1200;
const LITE_STRIPES_MAX = 4;

function parseColor(col) {
  // just return the input, but you could map tier names here
  return col || "rgba(15,23,42,1)"; // slate-ish default
}

export function renderLiteXpBar({
  container,
  xp = 0,
  cap = LITE_XP_CAP_DEFAULT,
  baseColor,       // background track
  fillColor,       // progress color
  stripesColor,    // dot color
}) {
  if (!container) return;

  const pct = Math.min(100, Math.round((xp / cap) * 100));
  const earned = Math.min(LITE_STRIPES_MAX, Math.floor((xp / cap) * LITE_STRIPES_MAX));

  const track = parseColor(baseColor);
  const fill  = fillColor || "#ffffff";
  const stripeCol = stripesColor || "#facc15";

  container.innerHTML = `
    <div class="xp-lite">
      <div class="xp-lite-track" style="background:${track}">
        <div class="xp-lite-fill" style="width:${pct}%;background:${fill}"></div>
        <div class="xp-lite-stripes">
          ${Array.from({length:LITE_STRIPES_MAX}).map((_,i)=>`
            <span class="xp-lite-stripe ${i < earned ? "on" : ""}" style="background:${stripeCol}"></span>
          `).join("")}
        </div>
      </div>
      <div class="xp-lite-meta">${xp} / ${cap}</div>
    </div>
  `;
}
