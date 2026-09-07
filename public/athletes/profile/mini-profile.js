import {
  db,
  doc,
  getDoc,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import { renderDigitalBelt } from "/assets/js/digital-belt.js";
import {
  LADDER_F8
} from "/assets/js/ladder.service.js";

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

function normalizeDiscipline(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (raw.includes("kickbox")) return "kickboxing";
  if (raw.includes("wrest")) return "wrestling";
  if (raw.includes("box")) return "boxing";

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  return raw;
}

function getStoredTierNum(A) {
  const source =
    A?.progressionTier ??
    A?.tier ??
    A?.tierNum ??
    A?.rankNum ??
    0;

  if (typeof source === "number") return source;

  const m = String(source).match(/T(\d+)/i);
  if (m) return Number(m[1]) || 0;

  const n = Number(String(source).replace(/[^\d]/g, ""));
  return Number.isNaN(n) ? 0 : n;
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

  await ensureSignedIn();

  const snap = await getDoc(doc(db, "athletes", id));
  if (!snap.exists()) {
    document.body.innerHTML = "<main class='wrap'><p>Athlete not found</p></main>";
    return;
  }

  const A = snap.data() || {};

  // Multi-discipline Combat resolver.
  // Identity stays on A. Combat progression comes from combat.
  const disciplineIds = Array.from(
    new Set(
      [
        ...(Array.isArray(A.disciplineIds)
          ? A.disciplineIds
          : []),

        ...Object.keys(A.disciplines || {}),

        A.activeDiscipline,
        A.primaryDiscipline,
        A.discipline,
        A.art,
        A.sport
      ]
        .map(normalizeDiscipline)
        .filter(Boolean)
    )
  );

  const urlDiscipline =
    normalizeDiscipline(
      params.get("discipline") || ""
    );

  const storedDiscipline =
    normalizeDiscipline(
      localStorage.getItem(
        `sandman_active_discipline_${id}`
      ) || ""
    );

  const preferredDiscipline =
    normalizeDiscipline(
      A.activeDiscipline ||
      A.primaryDiscipline ||
      A.discipline ||
      A.art ||
      A.sport ||
      ""
    );

  let activeDiscipline = "";

  if (disciplineIds.length === 1) {
    activeDiscipline =
      disciplineIds[0];
  } else if (
    urlDiscipline &&
    disciplineIds.includes(urlDiscipline)
  ) {
    activeDiscipline =
      urlDiscipline;
  } else if (
    preferredDiscipline &&
    disciplineIds.includes(
      preferredDiscipline
    )
  ) {
    activeDiscipline =
      preferredDiscipline;
  } else if (
    storedDiscipline &&
    disciplineIds.includes(
      storedDiscipline
    )
  ) {
    activeDiscipline =
      storedDiscipline;
  } else {
    activeDiscipline =
      disciplineIds[0] ||
      "wrestling";
  }

  localStorage.setItem(
    "currentAthleteId",
    id
  );

  localStorage.setItem(
    `sandman_active_discipline_${id}`,
    activeDiscipline
  );

  console.log(
    "Mini profile discipline resolved:",
    {
      athleteId: id,
      urlDiscipline,
      storedDiscipline,
      preferredDiscipline,
      disciplineIds,
      activeDiscipline
    }
  );

  const combat =
    A.disciplines?.[activeDiscipline] || A;

  const art = String(
    combat.art ||
    combat.primaryDiscipline ||
    combat.discipline ||
    activeDiscipline ||
    "wrestling"
  )
    .trim()
    .toLowerCase();

  function formatDisciplineLabel(value) {
    const labels = {
      wrestling: "Wrestling",
      kickboxing: "Kickboxing",
      boxing: "Boxing",
      mma: "MMA",
      "submission-grappling": "Submission Grappling"
    };

    return labels[value] ||
      String(value || "")
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }

  function renderDisciplineSelector() {
    const wrap = $("disciplineSelectorWrap");
    const selector = $("disciplineSelector");

    if (!wrap || !selector) return;

    if (disciplineIds.length <= 1) {
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "";
    selector.innerHTML = "";

    disciplineIds.forEach((discipline) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "discipline-btn";
      button.textContent = formatDisciplineLabel(discipline);

      const isActive = discipline === activeDiscipline;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));

      button.addEventListener("click", () => {
        if (discipline === activeDiscipline) return;

        localStorage.setItem(
          `sandman_active_discipline_${id}`,
          discipline
        );

        const url = new URL(window.location.href);
        url.searchParams.set("discipline", discipline);

        window.location.replace(url.toString());
      });

      selector.appendChild(button);
    });
  }

  renderDisciplineSelector();

  // Road2Champion youth only
  const journey = String(
    A.journey ||
    A.programTrack ||
    A.program ||
    A.track ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const isRoad2Champion =
    journey === "road2champion" ||
    journey === "r2c" ||
    id.startsWith("F8_");

  if (!isRoad2Champion) {
    window.location.replace(
      `/athletes/profile/athlete-profile.html?id=${encodeURIComponent(id)}`
    );
    return;
  }

  let combatArcLabel = "🤼 Wrestling · Road2Champion";

  if (art === "kickboxing") {
    combatArcLabel = "🥊 Kickboxing · Road2Champion";
  } else if (art === "boxing") {
    combatArcLabel = "🥊 Boxing · Road2Champion";
  }

  safeText("combatArcTitle", combatArcLabel);

  const ladder = LADDER_F8;
  const tierNum = getStoredTierNum(combat);
  const tierInfo = ladder?.[tierNum] || {};

  const rankName =
    tierInfo?.name ||
    combat.rankName ||
    "Shadow";

  const rankColor =
    combat.rankColor ||
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

  safeText("out-team", team || "Unassigned");
  safeText("out-citystate", cityState);

  // ===== Rank =====
  safeHTML(
    "out-rank",
    `<span style="width:10px;height:10px;border-radius:50%;background:${rankColor};display:inline-block;margin-right:6px"></span>${rankName}`
  );

  // ===== CURRENT FOUNDRY 8 BONSAI BADGE =====
  const badgeRow = $("ath-badge-history");

  if (badgeRow) {
    badgeRow.innerHTML = "";

    const ROAD2CHAMPION_V3_BADGES = {
      Shadow: "shadow-white-v3.png",
      Prospect: "prospect-yellow-v3.png",
      Competitor: "competitor-orange-v3.png",
      Contender: "contender-green-v3.png",
      Champion: "champion-black-v3.png"
    };

    const bonsaiFile = ROAD2CHAMPION_V3_BADGES[rankName];

    if (bonsaiFile) {
      const img = document.createElement("img");
      img.src = `/assets/images/badges/ranks-v2/${bonsaiFile}`;
      img.className = "tier-badge";
      img.alt = `${rankName} bonsai rank badge`;
      badgeRow.appendChild(img);
    }
  }

  // ===== XP / STRIPES =====
  const xpNow = Number(combat.xp || 0);
  const xpCap = getStoredXpCap(combat, ladder, tierNum) || 800;
  const storedStripes = getStoredStripes(combat);
  const stripeMax = Number(ladder?.[tierNum]?.stripes || 4);

  const displayStripes = getEffectiveStripes({
    xpNow,
    xpCap,
    storedStripes,
    stripeMax
  });

  // ===== NEW BELT RENDER =====

  const colorMap = {
  Shadow: "belt-z2h-shadow",
  Prospect: "belt-z2h-recruit",
  Competitor: "belt-z2h-competitor",
  Contender: "belt-z2h-contender",
  Hero: "belt-z2h-hero"
};

  const mappedColor = colorMap[rankName] || "belt-z2h-shadow";

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