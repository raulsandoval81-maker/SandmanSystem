// athlete-xp-page.js
import { db } from "../js/firebase-init.js";
import {
  collection, query, where, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// --- minimal rank helpers (same as snapshot.js) ---
const YOUTH_TIERS = ["Shadow","Recruit","Combatant","Competitor","Warrior","Champion","Commander","Sandman","Legend"];
const F4_TIERS    = ["Apprentice","Warrior","Champion","Veteran","Legend"];
const TIER_XP = 1000, STRIPE_XP = 250;

const BELT_COLOR_MAP = {
  youth:   { Shadow:"#FFFFFF", Recruit:"#FFFF00", Combatant:"#FFA500", Competitor:"#2ECC71", Warrior:"#1E90FF", Champion:"#8B59B6", Commander:"#8B4513", Sandman:"#FFD700", Legend:"#000000" },
  foundry4:{ Apprentice:"#FFFFFF", Warrior:"#1E90FF", Champion:"#8B59B6", Veteran:"#8B4513", Legend:"#000000" }
};

function resolveLadder(data){
  if (data.ladder === "youth" || data.ladder === "foundry4") return data.ladder;
  return data.program === "wrestling" ? "foundry4" : "youth";
}
function computeRank(totalXP=0, ladder="youth"){
  const tiers = ladder === "youth" ? YOUTH_TIERS : F4_TIERS;
  const tierIndex = Math.floor((Number(totalXP)||0) / TIER_XP);
  const stripes   = Math.floor(((Number(totalXP)||0) % TIER_XP) / STRIPE_XP);
  const tierName  = tiers[Math.min(tierIndex, tiers.length-1)];
  return { tierName, stripes, tierIndex, ladder };
}
function isLightColor(hex="#FFFFFF"){
  const h = hex.replace("#",""); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  const lum = 0.2126*(r/255)+0.7152*(g/255)+0.0722*(b/255);
  return lum > 0.6;
}
function stripeBars(count=0, beltHex="#FFFFFF"){
  if (!count) return "";
  const stripeColor = isLightColor(beltHex) ? "#000" : "#FFF";
  const bars = Array.from({length:count},()=>`<span class="stripe" style="background:${stripeColor}"></span>`).join("");
  return `<div class="stripes">${bars}</div>`;
}
function rankLabel(xp, ladder){
  const { tierName, stripes } = computeRank(xp, ladder);
  const color = BELT_COLOR_MAP[ladder]?.[tierName] || "#FFFFFF";
  const shadow = (color === "#FFFFFF" || color === "#FFFF00") ? "text-shadow:0 0 4px rgba(0,0,0,.55);" : "";
  return `<span style="color:${color};font-weight:bold;${shadow}">${tierName}</span>${stripeBars(stripes, color)}`;
}

// --- page wiring ---
const box = document.getElementById("athleteXpBox");

// Option A: read query param ?ath=richie (lowercased name)
// Option B: hardcode for now (change later to auth UID)
const params = new URLSearchParams(location.search);
const athleteLower = (params.get("ath") || "").toLowerCase() || "richie";

const q = query(
  collection(db, "athletesXP"),
  where("athleteLower", "==", athleteLower),
  limit(1)
);

onSnapshot(q, (snap) => {
  if (snap.empty) {
    box.innerHTML = `<div class="card">No athlete found.</div>`;
    return;
  }
  const doc = snap.docs[0];
  const d = doc.data();
  const ladder = resolveLadder(d);
  const xp     = d.totalXP || 0;

  box.innerHTML = `
    <div class="card">
      <h2 style="color:gold;margin:0 0 .25rem 0;">${d.athlete}</h2>
      <div style="color:#fff;">XP: ${xp}</div>
      <div>Rank: ${rankLabel(xp, ladder)}</div>
      <div style="color:skyblue;">Ladder: ${ladder === "youth" ? "Youth (R0–8)" : "Foundry4 / Olders (R0–4)"}</div>
      <div style="color:orange;">Program: ${d.program || "unknown"}</div>
      <div style="color:gray;">Updated: ${new Date(d.updatedAT || d.updatedAt || 0).toLocaleString()}</div>
    </div>
  `;
});
