import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import { LADDER_F8 } from "/assets/js/ladder.service.js";

const $ = (id) => document.getElementById(id);

function safeText(id, val, fallback = "—") {
  const el = $(id);
  if (!el) return;
  el.textContent =
    val === undefined || val === null || val === ""
      ? fallback
      : String(val);
}

function safeHTML(id, html, fallback = "—") {
  const el = $(id);
  if (!el) return;
  el.innerHTML = html || fallback;
}

function initials(name = "") {
  const clean = String(name || "").trim();
  if (!clean) return "A";

  const parts = clean.split(/\s+/);
  if (parts.length === 1) return (parts[0][0] || "A").toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function progressLabel(percent) {
  if (percent < 10) return "Just getting started";
  if (percent < 40) return "Building your base";
  if (percent < 70) return "Getting stronger";
  if (percent < 90) return "Almost there";
  return "Ready for testing";
}

function pct(xp = 0, cap = 1) {
  const safeXp = Number(xp || 0);
  const safeCap = Number(cap || 0);
  if (!safeCap) return 0;
  return Math.max(0, Math.min(100, Math.round((safeXp / safeCap) * 100)));
}

function getStoredTierNum(A) {
  if (typeof A?.tier === "number") return A.tier;
  if (typeof A?.tier === "string") {
    const m = String(A.tier).match(/T(\d+)/i);
    if (m) return Number(m[1]) || 0;
    const n = Number(String(A.tier).replace(/[^\d]/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return Number(A?.tierNum ?? A?.rankNum ?? 0) || 0;
}

function getStoredStripes(A) {
  return Number(A?.stripeCount ?? A?.stripes ?? 0);
}

function getStoredXpCap(A, ladder, tierNum) {
  const tier = ladder?.[tierNum];

  return Number(
    tier?.cap ??
    A?.xpCap ??
    A?.cap ??
    A?.tierCap ??
    0
  );
}

function getEffectiveStripes({ xpNow, xpCap, storedStripes, stripeMax = 4 }) {
  const safeCap = Math.max(1, Number(xpCap || 0));
  const safeXp = Math.max(0, Number(xpNow || 0));
  const stored = Number(storedStripes || 0);

  const derived = Math.floor((safeXp / safeCap) * stripeMax);

  if (safeXp >= safeCap) return stripeMax;

  return Math.max(0, Math.min(stripeMax, Math.max(stored, derived)));
}

async function load() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || params.get("uid") || "").trim().toUpperCase();

  if (!id) {
    document.body.innerHTML = "<main class='wrap'><p>Missing athlete ID</p></main>";
    return;
  }

  const snap = await getDoc(doc(db, "athletes", id));
  if (!snap.exists()) {
    document.body.innerHTML = "<main class='wrap'><p>Athlete not found</p></main>";
    return;
  }

  const A = snap.data() || {};

  // youth only
  if (!id.startsWith("F8_")) {
    window.location.replace(`/athletes/profile/athlete-profile.html?id=${encodeURIComponent(id)}`);
    return;
  }

  const ladder = LADDER_F8;
  const tierNum = getStoredTierNum(A);
  const tierInfo = ladder?.[tierNum] || {};

  const rankName =
    A.rankName ||
    tierInfo?.rank ||
    "Shadow";

  const rankColor =
    A.rankColor ||
    tierInfo?.color ||
    "#ffffff";

  // ===== Avatar =====
  const fullName =
    A.fullName ||
    A.publicName ||
    "Athlete";

  const avatar = $("ath-avatar");
  if (avatar) {
    if (A.photoUrl) {
      avatar.style.backgroundImage = `url(${A.photoUrl})`;
      avatar.textContent = "";
    } else {
      avatar.style.backgroundImage = "";
      avatar.textContent = initials(fullName);
    }
  }

  safeText("out-name", fullName);

  // ===== Team / Location =====
  const team =
    A.team ||
    A.academy ||
    "";

  const city = A.city || "";
  const state = A.state || "";

  const cityState =
    city && state ? `${city}, ${state}` :
    city || state || "—";

  safeText("out-team", team || "—");
  safeText("out-citystate", cityState);

  // ===== Rank =====
  safeHTML(
    "out-rank",
    `<span style="width:10px;height:10px;border-radius:50%;background:${rankColor};display:inline-block;margin-right:6px"></span>${rankName}`
  );

  // ===== XP / STRIPES =====
  const xpNow = Number(A.xp || 0);
  const xpCap = getStoredXpCap(A, ladder, tierNum) || 600;
  const storedStripes = getStoredStripes(A);
  const stripeMax = Number(ladder?.[tierNum]?.stripes || 4);

  const displayStripes = getEffectiveStripes({
    xpNow,
    xpCap,
    storedStripes,
    stripeMax
  });

  // ===== NEW BELT RENDER =====
  const colorMap = {
    Shadow: "belt-white",
    Recruit: "belt-yellow",
    Combatant: "belt-orange",
    Contender: "belt-green",
    Warrior: "belt-blue",
    Champion: "belt-purple",
    Commander: "belt-brown",
    Hero: "belt-black"
  };

  const mappedColor = colorMap[rankName] || "belt-white";

  safeHTML(
    "rankBar",
    renderDigitalBelt({
      colorClass: mappedColor,
      stripes: displayStripes,
      size: "small"
    })
  );

  const percent = pct(xpNow, xpCap);

  if ($("percentText")) $("percentText").textContent = `XP · ${percent}%`;
  if ($("progressLabel")) $("progressLabel").textContent = progressLabel(percent);

  const stripeEl = $("stripeText");
  if (stripeEl) {
    stripeEl.textContent = `Stripes: ${displayStripes}/${stripeMax}`;
  }
}

load().catch((err) => {
  console.error("mini-profile load failed:", err);
  document.body.innerHTML = "<main class='wrap'><p>Error loading mini profile</p></main>";
});