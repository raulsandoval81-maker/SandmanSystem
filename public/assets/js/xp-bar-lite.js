// /assets/js/xp-bar-lite.js
// Slim XP bar with tight-left, full-height stripe cuts (north/south)

const LITE_XP_CAP_DEFAULT = 1200;
const LITE_STRIPES_MAX = 4;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function renderLiteXpBar({
  container,
  xp = 0,
  cap = LITE_XP_CAP_DEFAULT,

  baseColor = "rgba(255,255,255,.14)",
  fillColor = "#ffffff",

  stripesTotal,
  stripesEarned,

  // "black" for white belt, "white" otherwise
  stripeTone = "white",

  // tight cluster tuning
  stripeWidth = 10,     // thickness of each stripe cut
  stripeGap = 6,        // gap between stripes
  stripeLeftPad = 16,    // left padding inside belt
}) {
  if (!container) return;

  const safeCap = cap > 0 ? cap : LITE_XP_CAP_DEFAULT;
  const pct = clamp(Math.round((Number(xp) / safeCap) * 100), 0, 100);

  const total = clamp(Number(stripesTotal ?? LITE_STRIPES_MAX), 0, 12);
  const earned =
    stripesEarned != null
      ? clamp(Number(stripesEarned), 0, total)
      : clamp(Math.floor((Number(xp) / safeCap) * total), 0, total);

  const stripeColor = (stripeTone === "black") ? "#000" : "#fff";

  container.innerHTML = `
    <div class="xp-lite">
      <div class="xp-lite-track" style="background:${baseColor}; --stripe:${stripeColor}">
        <div class="xp-lite-fill" style="width:${pct}%; background:${fillColor}"></div>

        <div class="xp-lite-stripes" aria-hidden="true"
             style="--sw:${stripeWidth}px; --sg:${stripeGap}px; --sl:${stripeLeftPad}px;">
          ${Array.from({ length: total }).map((_, i) => {
            const on = i < earned;
            return `<span class="xp-lite-stripe ${on ? "on" : "off"}" style="--i:${i}"></span>`;
          }).join("")}
        </div>
      </div>

      <div class="xp-lite-meta">${xp} / ${safeCap}</div>
    </div>
  `;
}
