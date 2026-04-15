// snapshot.js

import { db } from "./firebase-init.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const box = document.getElementById("snapshotOutput");

/* ================================
   LADDERS & RANK NAMES (labels)
=================================== */

// Youth (R0–8) – names for labels/colors (math comes from LADDERS below)
const YOUTH_TIERS = [
  "Shadow", "Recruit", "Combatant", "Competitor",
  "Warrior", "Champion", "Commander", "Sandman", "Legend"
];

// Foundry4 / Olders (R0–4)
const F4_TIERS = ["Apprentice", "Warrior", "Champion", "Veteran", "Legend"];

/* ================================
   BELT COLORS (Traditional)
=================================== */
const BELT_COLOR_MAP = {
  youth: {
    Shadow:     "#FFFFFF", // white
    Recruit:    "#FFFF00", // yellow (pure)
    Combatant:  "#FFA500", // orange
    Competitor: "#2ECC71", // green
    Warrior:    "#1E90FF", // blue
    Champion:   "#8B59B6", // purple
    Commander:  "#8B4513", // brown
    Sandman:    "#FFD700", // battle gold
    Legend:     "#000000"  // black
  },
  foundry4: {
    Apprentice: "#FFFFFF", // white
    Warrior:    "#1E90FF", // blue
    Champion:   "#8B59B6", // purple
    Veteran:    "#8B4513", // brown
    Legend:     "#000000"  // black
  }
};

/* ================================
   PER-TIER CAPS / STRIPE RULES (TRUTH)
=================================== */
const LADDERS = {
  youth: [
    { name:"Shadow",     cap: 600,  stripe: 200, stripes:3 },
    { name:"Recruit",    cap: 800,  stripe: 200, stripes:4 },
    { name:"Combatant",  cap: 1000, stripe: 250, stripes:4 },
    { name:"Competitor", cap: 1200, stripe: 300, stripes:4 },
    { name:"Warrior",    cap: 1400, stripe: 350, stripes:4 },
    { name:"Champion",   cap: 1600, stripe: 400, stripes:4 },
    { name:"Commander",  cap: 2000, stripe: 400, stripes:5 },
    { name:"Sandman",    cap: 2200, stripe: 550, stripes:4 },
    { name:"Legend",     cap: 2400, stripe: null, stripes:0 } // no stripes
  ],
  foundry4: [
    { name:"Apprentice", cap: 800,  stripe: 200, stripes:4 },
    { name:"Warrior",    cap: 1400, stripe: 350, stripes:4 },
    { name:"Champion",   cap: 1600, stripe: 400, stripes:4 },
    { name:"Veteran",    cap: 2200, stripe: 550, stripes:4 },
    { name:"Legend",     cap: 2400, stripe: null, stripes:0 } // no stripes
  ]
};

/* ================================
   LADDER RESOLVER
=================================== */
function resolveLadder(data) {
  // Explicit field wins
  if (data.ladder === "youth") return "youth";
  if (data.ladder === "foundry4") return "foundry4";
  // Fallback by program (tune as needed)
  return data.program === "wrestling" ? "foundry4" : "youth";
}
/* ================================
   DEBUG: per-tier rank simulator (real caps)
   — uses LADDERS to compute tier + stripes
=================================== */
function simulatePerTierRank(totalXP = 0, ladder = "youth") {
  const table = ladder === "youth" ? LADDERS.youth : LADDERS.foundry4;
  let xp = Number(totalXP) || 0;

  // Walk tiers until the remaining XP fits in the current tier
  for (let i = 0; i < table.length; i++) {
    const t = table[i];

    if (xp < t.cap) {
      const stripes = t.stripe ? Math.min(t.stripes, Math.floor(xp / t.stripe)) : 0;
      return {
        ladder,
        tierIndex: i,
        tierName: t.name,
        stripes,
        stripesMax: t.stripes,
        cap: t.cap
      };
    }
    xp -= t.cap; // spend XP to complete this tier and move to the next
  }

  // If XP exceeds the whole ladder, clamp to the last tier
  const last = table[table.length - 1];
  return {
    ladder,
    tierIndex: table.length - 1,
    tierName: last.name,
    stripes: 0,
    stripesMax: last.stripes,
    cap: last.cap
  };
}

/* Pretty debug line that shows both systems side-by-side */
function debugCompare(doc) {
  const d = doc.data();
  const name   = d.athlete || "Unknown";
  const xp     = Number(d.totalXP) || 0;
  const ladder = resolveLadder(d);

  const ui  = computeRank(xp, ladder);            // current uniform math
  const real = simulatePerTierRank(xp, ladder);   // per-tier caps

  console.log(
    `[RankCheck] ${name} | XP:${xp} | ladder:${ladder} | ` +
    `UI: ${ui.tierName} (${ui.stripes} stripes)  vs  ` +
    `REAL: ${real.tierName} (${real.stripes}/${real.stripesMax} stripes)`
  );
}

/* ================================
   RANK COMPUTATION (per-tier caps)
=================================== */
function computeRank(totalXP = 0, ladder = "youth") {
  const tXP = Math.max(0, Number(totalXP) || 0);
  const ladderDef = ladder === "foundry4" ? LADDERS.foundry4 : LADDERS.youth;

  let cum = 0; // cumulative XP consumed by prior tiers
  for (let i = 0; i < ladderDef.length; i++) {
    const tier = ladderDef[i];
    const span = tier.cap ?? Infinity;         // Legend cap included for completeness
    const nextCum = cum + span;

    if (tXP < nextCum) {
      const within = tXP - cum;                // XP inside current tier window
      let stripes = 0;
      if (tier.stripe && tier.stripes) {
        stripes = Math.min(Math.floor(within / tier.stripe), tier.stripes);
      }
      return { tierName: tier.name, stripes, tierIndex: i, ladder };
    }
    cum = nextCum;
  }

  // At or beyond final cap → clamp to Legend, no stripes
  const last = ladderDef[ladderDef.length - 1];
  return { tierName: last.name, stripes: 0, tierIndex: ladderDef.length - 1, ladder };
}

/* ================================
   STRIPE VISUALS (black/white bars)
=================================== */
function isLightColor(hex = "#FFFFFF") {
  const h = hex.replace("#","");
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  const lum = 0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255);
  return lum > 0.6;
}

function stripeBars(count = 0, beltHex = "#FFFFFF") {
  if (!count) return "";
  const stripeColor = isLightColor(beltHex) ? "#000000" : "#FFFFFF";
  const bars = Array.from({ length: count }, () =>
    `<span class="stripe" style="background:${stripeColor}"></span>`
  ).join("");
  return `<div class="stripes" aria-label="${count} stripe${count>1?"s":""}">${bars}</div>`;
}

/* ================================
   RANK LABEL (belt color + stripes)
=================================== */
function rankLabel(totalXP, ladder) {
  const { tierName, stripes } = computeRank(totalXP, ladder);
  const color =
    (BELT_COLOR_MAP[ladder] && BELT_COLOR_MAP[ladder][tierName]) || "#FFFFFF";

  const shadow =
    color === "#FFFFFF" || color === "#FFFF00"
      ? " text-shadow:0 0 4px rgba(0,0,0,.55);"
      : "";

  // Add console.log to verify stripe counts
  console.log("rankLabel:", tierName, "stripes:", stripes);

  // Rank name in belt color + visual stripe bars below it
  const stripeHTML = stripeBars(stripes, color);
  return `
    <div class="rank">
      <span style="color:${color}; font-weight:bold;${shadow}">${tierName}</span>
      ${stripeHTML}
    </div>
  `;
}

/* ================================
   FORMAT HELPERS
=================================== */
function formatDate(ms) {
  if (!ms) return "N/A";
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit"
  });
}

/* ================================
   RENDER
=================================== */
function render(rows) {
  if (!rows.length) {
    box.textContent = "No data found in athletesXP.";
    return;
  }

  box.innerHTML = rows.map(doc => {
    const data = doc.data();
    const name = data.athlete || "Unknown";
    const xp = data.totalXP || 0;
    const program = data.program || "unknown";
    const updatedAt = data.updatedAT || data.updatedAt || 0;
    const ladder = resolveLadder(data);

    return `
      <div class="card">
        <strong style="color: gold; font-size: 1.2em;">${name}</strong><br>
        <span style="color: white;">XP: ${xp}</span><br>
        Rank: ${rankLabel(xp, ladder)}<br>
        <span style="color: skyblue;">Ladder: ${ladder === "youth" ? "Youth (R0–8)" : "Foundry4 / Olders (R0–4)"}</span><br>
        <span style="color: orange;">Program: ${program}</span><br>
        <span style="color: gray;">Updated: ${formatDate(updatedAt)}</span>
      </div>
    `;
  }).join("");
}

/* ================================
   LIVE FIRESTORE SNAPSHOT
=================================== */
const q = query(collection(db, "athletesXP"), orderBy("updatedAT", "desc"));
onSnapshot(q, (snapshot) => {
  console.log("[Snapshot] Listening for updates...");
  render(snapshot.docs);
    // NEW: compare uniform vs per-tier math for each doc
  snapshot.docs.forEach(debugCompare);
});
