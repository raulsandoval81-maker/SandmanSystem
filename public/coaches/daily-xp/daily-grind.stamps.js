// public/coaches/daily-xp/daily-grind-stamps.js

const STAMP_BAR_ID = "stampBar";
const MODE_ID = "xpMode";
const LANE_ID = "xpLane";
const TRACK_ID = "trackF8Only";

function $(id) {
  return document.getElementById(id);
}

function stamp(key, value, on = true) {
  return `
    <span class="stamp ${on ? "on" : "off"}">
      <span class="k">${key}</span>
      <span>${value}</span>
    </span>
  `;
}

function selectText(id) {
  const el = $(id);
  if (!el) return "—";

  const text = el.options?.[el.selectedIndex]?.textContent;
  return (text || el.value || "—").trim();
}

function pickedCount() {
  return document.querySelectorAll(".pick:checked").length;
}

function paintStamps() {
  const bar = $(STAMP_BAR_ID);
  if (!bar) return;

  const mode = selectText(MODE_ID);
  const lane = selectText(LANE_ID);
  const picked = pickedCount();

  bar.innerHTML = [
    stamp("MODE", mode, true),
    stamp("TRACK", trackWanted(), true),
    stamp("LANE", lane, true),
    stamp("PICKED", String(picked), picked > 0)
  ].join("");
}

function wire() {
  $(MODE_ID)?.addEventListener("change", paintStamps);
  $(LANE_ID)?.addEventListener("change", paintStamps);

  $(TRACK_ID)?.addEventListener("change", () => {
    setTimeout(paintStamps, 0);
  });

  document.addEventListener("change", (e) => {
    if (e.target?.classList?.contains("pick")) {
      paintStamps();
    }
  });

  document.addEventListener("click", (e) => {
    const id = e.target?.id || "";

    if (id === "pickAll" || id === "clearAll") {
      setTimeout(paintStamps, 0);
    }
  });

  document.addEventListener("sandman:roster-rendered", paintStamps);
}

wire();
paintStamps();