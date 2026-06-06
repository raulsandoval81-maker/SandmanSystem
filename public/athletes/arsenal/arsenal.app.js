import {
  db,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

function setLocked(card, title, desc) {
  if (!card) return;

  card.classList.add("locked");
  card.removeAttribute("href");
  card.setAttribute("aria-disabled", "true");

  const h2 = card.querySelector("h2");
  const p = card.querySelector("p");

  if (h2) h2.textContent = title;
  if (p) p.textContent = desc;
}

function setOpen(card, title, desc, href) {
  if (!card) return;

  card.classList.remove("locked");
  card.setAttribute("href", href);
  card.removeAttribute("aria-disabled");

  const h2 = card.querySelector("h2");
  const p = card.querySelector("p");

  if (h2) h2.textContent = title;
  if (p) p.textContent = desc;
}

function getStripeCount(athlete = {}) {
  return Number(
    athlete.stripeCount ??
    athlete.stripesEarned ??
    athlete.stripes ??
    0
  );
}

function getTierNumber(athlete = {}) {
  const raw =
    athlete.tier ??
    athlete.tierCode ??
    athlete.currentTier ??
    "T0";

  const match = String(raw).toUpperCase().match(/T(\d+)/);
  return match ? Number(match[1]) : Number(raw) || 0;
}

function getTrackCode(athleteId, athlete = {}) {
  const raw = String(
    athlete.trackCode ??
    athlete.track ??
    ""
  ).trim().toUpperCase();

  if (raw) return raw;
  if (athleteId.startsWith("F8_")) return "F8";
  if (athleteId.startsWith("F4_")) return "F4";
  return "";
}

function isF8Athlete(athleteId, athlete = {}) {
  return getTrackCode(athleteId, athlete).includes("F8");
}

function wireHomeLink(athleteId) {
  const homeLink = document.getElementById("homeLink");
  if (!homeLink || !athleteId) return;

  homeLink.href = `/athletes/hub/full-hub.html?id=${encodeURIComponent(athleteId)}`;
}

async function loadUnlocks() {
  const combatCard = document.getElementById("combat-card");
  const strengthCard = document.getElementById("strength-card");
  const honorCard = document.getElementById("honor-card");

  const params = new URLSearchParams(window.location.search);
  const athleteId = (params.get("id") || "").trim().toUpperCase();

  if (!athleteId) {
    console.error("Missing athlete id in Arsenal URL");
    return;
  }

  setLocked(
    combatCard,
    "Combat",
    "Primary lane · access expands through Combat progress"
  );

  setLocked(
    strengthCard,
    "Strength 🔒",
    "Unlocked lane · opens through Combat progress"
  );

  setLocked(
    honorCard,
    "Honor 🔒",
    "Unlocked lane · opens through Combat progress"
  );

  try {
    await ensureSignedIn();

    const athleteRef = doc(db, "athletes", athleteId);
    const athleteSnap = await getDoc(athleteRef);

    if (!athleteSnap.exists()) {
      console.error("Athlete not found:", athleteId);
      return;
    }

    const athlete = athleteSnap.data() || {};

    wireHomeLink(athleteId);

    const stripe = getStripeCount(athlete);
    const tier = getTierNumber(athlete);
    const isF8 = isF8Athlete(athleteId, athlete);

    const strengthUnlocked =
      athlete?.unlocks?.strength === true ||
      (isF8 ? tier >= 3 && stripe >= 1 : stripe >= 1);

    const honorUnlocked =
      athlete?.unlocks?.honor === true ||
      (isF8 ? tier >= 3 && stripe >= 2 : stripe >= 2);

    setOpen(
      combatCard,
      "Combat",
      "Primary lane · access expands through Combat progress",
      `/athletes/arsenal/combat/?id=${encodeURIComponent(athleteId)}`
    );

    if (strengthUnlocked) {
      setOpen(
        strengthCard,
        "Strength",
        "Strength Development Track",
        `/athletes/arsenal/strength/?id=${encodeURIComponent(athleteId)}`
      );
    } else if (isF8) {
      setLocked(
        strengthCard,
        "Strength 🔒",
        tier < 3
          ? "Unlocks at Competitor."
          : "Unlocks at Competitor Stripe 1."
      );
    } else {
      setLocked(
        strengthCard,
        "Strength 🔒",
        "Earn Stripe 1 to unlock Strength."
      );
    }

    if (honorUnlocked) {
      setOpen(
        honorCard,
        "Honor",
        "Honor Development Track",
        `/athletes/arsenal/honor/?id=${encodeURIComponent(athleteId)}`
      );
    } else if (isF8) {
      setLocked(
        honorCard,
        "Honor 🔒",
        tier < 3
          ? "Unlocks at Competitor."
          : "Unlocks at Competitor Stripe 2."
      );
    } else {
      setLocked(
        honorCard,
        "Honor 🔒",
        "Earn Stripe 2 to unlock Honor."
      );
    }

    const panel = document.getElementById("arsenalModePanel");
    const inner = document.getElementById("modePanelInner");
    if (panel) panel.hidden = true;
    if (inner) inner.innerHTML = "";

  } catch (err) {
    console.error("Failed to load Arsenal unlocks:", err);

    setOpen(
      combatCard,
      "Combat",
      "Primary lane · access expands through Combat progress",
      `/athletes/arsenal/combat/?id=${encodeURIComponent(athleteId)}`
    );

    const panel = document.getElementById("arsenalModePanel");
    const inner = document.getElementById("modePanelInner");
    if (panel) panel.hidden = true;
    if (inner) inner.innerHTML = "";
  }
}

await loadUnlocks();