import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import { updateRankUI } from "/assets/js/belt-bar.js";
import { LADDER_F8, getStripeInfo } from "/assets/js/ladder.service.js";

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

function getStoredTierNum(a) {
  if (typeof a?.tier === "number") return a.tier;
  if (typeof a?.tier === "string") {
    const m = String(a.tier).match(/T(\d+)/i);
    if (m) return Number(m[1]) || 0;
    const n = Number(String(a.tier).replace(/[^\d]/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return Number(a?.tierNum ?? a?.rankNum ?? 0) || 0;
}

function getStoredStripes(a) {
  return Number(a?.stripeCount ?? a?.stripes ?? 0);
}

function getStoredXpCap(a, ladder, tierNum) {
  const direct = Number(a?.xpCap ?? a?.cap ?? a?.tierCap ?? 0);
  if (direct > 0) return direct;

  const tier = ladder?.[tierNum];
  return Number(tier?.cap ?? tier?.xpCap ?? tier?.maxXP ?? 0);
}

function getEffectiveStripes({ xpNow, xpCap, storedStripes, stripeMax = 4 }) {
  const safeCap = Math.max(1, Number(xpCap || 0));
  const safeXp = Math.max(0, Number(xpNow || 0));
  const stored = Number(storedStripes || 0);

  const derived = Math.floor((safeXp / safeCap) * stripeMax);

  if (safeXp >= safeCap) return stripeMax;

  return Math.max(0, Math.min(stripeMax, Math.max(stored, derived)));
}

function badgeForTier(tierNum = 0) {
  const MAP = [
    "/assets/images/logos/Shadow-badge.png",
    "/assets/images/logos/Recruit-badge.png",
    "/assets/images/logos/Combatant-badge.png",
    "/assets/images/logos/Competitor-badge.png",
    "/assets/images/logos/Warrior-badge.png",
    "/assets/images/logos/Champion-badge.png",
    "/assets/images/logos/Commander-badge.png",
    "/assets/images/logos/Hero-badge.png",
  ];

  const idx = Math.max(0, Math.min(MAP.length - 1, Number(tierNum || 0)));
  return MAP[idx];
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

  const fullName =
    A.fullName ||
    [A.firstName, A.lastName].filter(Boolean).join(" ").trim() ||
    A.name ||
    A.athleteName ||
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

  const rawTeam = String(A.team || A.teamName || A.team?.name || "").trim();
  const academy =
    String(A.academy || "").trim() ||
    (rawTeam && !rawTeam.toLowerCase().startsWith("sandman") ? rawTeam : "") ||
    "Academy of Wrestling";

  safeText("out-team", academy);

  const cityTxt =
    String(A.city || A.team?.city || A.location?.city || "").trim();
  const stateTxt =
    String(A.state || A.team?.state || A.location?.state || "").trim();

  let cityState = "";
  if (cityTxt && stateTxt) cityState = `${cityTxt}, ${stateTxt}`;
  else if (cityTxt || stateTxt) cityState = cityTxt || stateTxt;
  else {
    const hint = `${academy} ${rawTeam}`.toLowerCase();
    if (hint.includes("lompoc")) cityState = "Lompoc, CA";
  }

  safeText("out-citystate", cityState);

  const ladder = LADDER_F8;
  const tierNum = getStoredTierNum(A);
  const tierInfo = ladder?.[tierNum] || {};

  const rankName =
    A.rankName ||
    A.rankLabel ||
    A.tierName ||
    A.tierLabel ||
    A.rank ||
    tierInfo?.rank ||
    tierInfo?.name ||
    "Shadow";

  const rankColor =
    A.rankColor ||
    tierInfo?.color ||
    tierInfo?.rankColor ||
    "#ffffff";

  safeHTML(
    "out-rank",
    `
      <span style="
        display:inline-block;
        width:10px;
        height:10px;
        border-radius:999px;
        background:${rankColor};
        margin-right:6px;
        vertical-align:middle;
      "></span>
      ${rankName}
    `
  );

  const badgeSrc =
    A.badgeUrl ||
    A.badge ||
    A.badgeImage ||
    badgeForTier(tierNum);

  const badgeEl = $("ath-badge");
  if (badgeEl) {
    badgeEl.src = badgeSrc;
    badgeEl.alt = `${rankName} badge`;
    badgeEl.onerror = () => {
      badgeEl.onerror = null;
      badgeEl.src = badgeForTier(tierNum);
    };
  }

  const totalXP = Number(
    A.xp ??
    A.xpTotal ??
    A.xpCombat ??
    A.combatXp ??
    0
  );

  const xpCap = Math.max(0, Math.round(getStoredXpCap(A, ladder, tierNum) || 800));
  const storedStripes = getStoredStripes(A);

const stripeMax = Number(ladder?.[tierNum]?.stripes || 4);
  const xpNow = Math.max(0, Math.round(totalXP));
  const displayStripes = getEffectiveStripes({
    xpNow,
    xpCap,
    storedStripes,
    stripeMax
  });

  updateRankUI({
    ladder,
    totalXP: Math.min(xpNow, xpCap || xpNow),
    rankNameOverride: rankName,
    stripeCountOverride: displayStripes,
    el: {
      barId: "rankBar",
      fillId: "rankFill",
      textId: "stripeText"
    }
  });

  const percent = pct(xpNow, xpCap);

  if ($("percentText")) $("percentText").textContent = `${percent}%`;
  if ($("progressLabel")) $("progressLabel").textContent = progressLabel(percent);

  // optional: make sure stripe text stays youth-safe if helper prints weird text
  const stripeEl = $("stripeText");
  if (stripeEl) {
    stripeEl.textContent = `Stripes: ${displayStripes}/${stripeMax}`;
  }
}

load().catch((err) => {
  console.error("mini-profile load failed:", err);
  document.body.innerHTML = "<main class='wrap'><p>Error loading mini profile</p></main>";
});