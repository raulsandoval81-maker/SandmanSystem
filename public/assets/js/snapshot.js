// snapshot.js
// System Snapshot — reads live athletesXP and uses ladder.service.js as truth.

import { db } from "./firebase-init.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import {
  LADDER_F8,
  LADDER_F4,
  getStripeInfo,
  colorKeyFor,
  COLORS
} from "./ladder.service.js";

const box = document.getElementById("snapshotOutput");

const LADDERS = {
  youth: LADDER_F8,
  foundry4: LADDER_F4
};

function resolveLadder(data = {}) {
  const id = String(data.uid || data.uidCode || data.id || "").toUpperCase();
  const track = String(
    data.programTrack ||
    data.track ||
    data.trackCode ||
    data.ladder ||
    ""
  ).toLowerCase();

  const rank = String(data.rankName || data.tierName || "").toLowerCase();

  if (
    id.startsWith("F8_") ||
    track.includes("youth") ||
    track.includes("foundry8") ||
    rank === "shadow" ||
    rank === "recruit" ||
    rank === "combatant" ||
    rank === "competitor" ||
    rank === "commander" ||
    rank === "hero"
  ) {
    return "youth";
  }

  return "foundry4";
}

function getBeltColor(tierName = "") {
  const key = colorKeyFor(tierName);
  return COLORS[key]?.start || "#FFFFFF";
}

function isLightColor(hex = "#FFFFFF") {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  const lum =
    0.2126 * (r / 255) +
    0.7152 * (g / 255) +
    0.0722 * (b / 255);

  return lum > 0.6;
}

function stripeBars(count = 0, beltHex = "#FFFFFF") {
  if (!count) return "";

  const stripeColor = isLightColor(beltHex) ? "#000000" : "#FFFFFF";

  const bars = Array.from({ length: count }, () =>
    `<span class="stripe" style="background:${stripeColor}"></span>`
  ).join("");

  return `
    <div class="stripes" aria-label="${count} stripe${count > 1 ? "s" : ""}">
      ${bars}
    </div>
  `;
}

function rankLabel(totalXP = 0, ladderKey = "youth") {
  const ladder = LADDERS[ladderKey] || LADDER_F4;
  const info = getStripeInfo(ladder, totalXP);

  const tierName = info?.tier?.name || "Unknown";
  const stripes = info?.stripesEarned || 0;
  const stripesTotal = info?.stripesTotal || 0;
  const color = getBeltColor(tierName);

  const shadow =
    color === "#FFFFFF" || color === "#FFFF00"
      ? "text-shadow:0 0 4px rgba(0,0,0,.55);"
      : "";

  return `
    <div class="rank">
      <span style="color:${color}; font-weight:bold; ${shadow}">
        ${tierName}
      </span>
      ${stripeBars(stripes, color)}
      <small style="color:#aaa;">
        ${stripes}/${stripesTotal} stripes
      </small>
    </div>
  `;
}

function formatDate(ms) {
  if (!ms) return "N/A";

  const d = new Date(ms);

  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function render(rows) {
  if (!box) return;

  if (!rows.length) {
    box.textContent = "No data found in athletesXP.";
    return;
  }

  box.innerHTML = rows.map(doc => {
    const data = doc.data();

    const name = data.athlete || data.name || "Unknown";
    const xp = Number(data.totalXP ?? data.xp ?? 0);
    const program = data.program || data.programTrack || "unknown";
    const updatedAt = data.updatedAT || data.updatedAt || 0;
    const ladderKey = resolveLadder(data);

    return `
      <div class="card">
        <strong style="color:gold; font-size:1.2em;">
          ${name}
        </strong><br>

        <span style="color:white;">
          XP: ${xp}
        </span><br>

        Rank:
        ${rankLabel(xp, ladderKey)}

        <span style="color:skyblue;">
          Ladder: ${ladderKey === "youth" ? "Youth / Hero Ladder" : "Teen / Legend Ladder"}
        </span><br>

        <span style="color:orange;">
          Program: ${program}
        </span><br>

        <span style="color:gray;">
          Updated: ${formatDate(updatedAt)}
        </span>
      </div>
    `;
  }).join("");
}

const q = query(
  collection(db, "athletesXP"),
  orderBy("updatedAT", "desc")
);

onSnapshot(q, snapshot => {
  console.log("[Snapshot] Listening for updates...");
  render(snapshot.docs);
});