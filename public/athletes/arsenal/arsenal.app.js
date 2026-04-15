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

  // Safety guard:
  // Full Arsenal should not handle youth athletes anymore.
  if (athleteId.startsWith("F8_")) {
    window.location.replace(
      `/athletes/arsenal/mini-arsenal.html?id=${encodeURIComponent(athleteId)}`
    );
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

    // Second guard in case trackCode says F8 even if id formatting changes later
    if (isF8Athlete(athleteId, athlete)) {
      window.location.replace(
        `/athletes/arsenal/mini-arsenal.html?id=${encodeURIComponent(athleteId)}`
      );
      return;
    }

    wireHomeLink(athleteId);

    const stripe = getStripeCount(athlete);

    const strengthUnlocked =
      athlete?.unlocks?.strength === true || stripe >= 2;

    const honorUnlocked =
      athlete?.unlocks?.honor === true || stripe >= 3;

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
    }

    if (honorUnlocked) {
      setOpen(
        honorCard,
        "Honor",
        "Honor Development Track",
        `/athletes/arsenal/honor/?id=${encodeURIComponent(athleteId)}`
      );
    }

    // Full Arsenal no longer uses the mixed-mode panel.
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