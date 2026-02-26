// public/assets/js/xp.js
// Minimal page driver that loads the correct XP module (youth/teen)
// Usage: /athletes/xp.html?mode=teen  (default = youth)

const box = document.getElementById("athleteXpBox");

// Decide mode from query (?mode=youth|teen), default youth
const params = new URLSearchParams(location.search);
const mode = (params.get("mode") || "youth").toLowerCase();

// Dynamic import (paths are SAME FOLDER as this file)
const loaders = {
  youth: () => import("./xp-youth.js"),
  teen:  () => import("./xp-teen.js"),
};

async function boot() {
  try {
    // pick loader or fall back to youth
    const load = loaders[mode] || loaders.youth;
    const mod = await load();

    // expected exports: initYouthXP() / initTeenXP() OR generic init()
    if (mode === "teen" && typeof mod.initTeenXP === "function") {
      await mod.initTeenXP({ box });
    } else if (mode === "youth" && typeof mod.initYouthXP === "function") {
      await mod.initYouthXP({ box });
    } else if (typeof mod.init === "function") {
      await mod.init({ box, mode });
    } else {
      box.textContent = "Module loaded but no init() found.";
    }
  } catch (err) {
    console.error("[xp.js] boot failed:", err);
    box.innerHTML = `
      <div style="color:#ff6b81">
        Failed to load XP module (<code>${mode}</code>).
        Check file paths: <code>/public/assets/js/xp-${mode}.js</code>
      </div>`;
  }
}

boot();
