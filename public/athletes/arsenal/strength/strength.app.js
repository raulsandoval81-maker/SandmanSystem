console.log("Strength lane loaded");

import { db, doc, getDoc } from "/assets/js/firebase-init.js";
import { resolveF8RemoteAccess } from "/assets/js/f8-strength-honor-access.js";

const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const preseasonBtn = document.getElementById("strength-preseason");
const inseasonBtn = document.getElementById("strength-inseason");
const postseasonBtn = document.getElementById("strength-postseason");
const conditioningBtn = document.getElementById("strength-conditioning");

const isTeen = athleteId.startsWith("F4");
const isYouth = athleteId.startsWith("F8");

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return await res.json();
}

function lockTile(el, label) {
  if (!el) return;

  el.removeAttribute("href");
  el.classList.add("locked");
  el.setAttribute("aria-disabled", "true");

  const title = el.querySelector(".chapter-title");
  if (title && label) title.textContent = label;
}

function openTile(el, href, label) {
  if (!el) return;

  el.classList.remove("locked");
  el.removeAttribute("aria-disabled");
  el.href = href;

  const title = el.querySelector(".chapter-title");
  if (title && label) title.textContent = label;
}

async function initStrengthMenu() {
  lockTile(preseasonBtn, "Preseason 🔒");
  lockTile(inseasonBtn, "In-Season 🔒");
  lockTile(postseasonBtn, "Postseason 🔒");
  lockTile(conditioningBtn, "Conditioning 🔒");

  if (!athleteId) {
    console.warn("Missing athlete id on Strength menu page.");
    return;
  }

  try {
    const [status, athleteSnap] = await Promise.all([
      fetchJson("/vault/system-status.json"),
      getDoc(doc(db, "athletes", athleteId)),
    ]);
    if (isYouth && (
      !athleteSnap.exists() ||
      !resolveF8RemoteAccess(athleteSnap.data() || {}).strength
    )) {
      return;
    }
    const strength = status?.strength || {};

    const activePhase = String(
      strength.seasonPhase || "preseason"
    )
      .trim()
      .toLowerCase();

    console.log(
      "Strength phase:",
      activePhase,
      "| teen:",
      isTeen,
      "| youth:",
      isYouth
    );

    const preseasonHref =
      `/athletes/arsenal/strength/preseason.html?id=${encodeURIComponent(athleteId)}`;

    const inseasonHref =
      `/athletes/arsenal/strength/inseason.html?id=${encodeURIComponent(athleteId)}`;

    const postseasonHref =
      `/athletes/arsenal/strength/postseason.html?id=${encodeURIComponent(athleteId)}`;

    // F4 only
    if (isTeen) {
      const conditioningHref =
        `/athletes/lanes/f4-conditioning/?id=${encodeURIComponent(athleteId)}`;

      openTile(
        conditioningBtn,
        conditioningHref,
        "Conditioning"
      );
    }

    // Coach-controlled seasonal access
    if (activePhase === "preseason") {
      openTile(
        preseasonBtn,
        preseasonHref,
        "Preseason"
      );
    } else if (activePhase === "inseason") {
      openTile(
        inseasonBtn,
        inseasonHref,
        "In-Season"
      );
    } else if (activePhase === "postseason") {
      openTile(
        postseasonBtn,
        postseasonHref,
        "Postseason"
      );
    } else {
      openTile(
        preseasonBtn,
        preseasonHref,
        "Preseason"
      );
    }

  } catch (err) {
    console.error("Strength menu init failed:", err);

    if (!isYouth) {
      openTile(
        preseasonBtn,
        `/athletes/arsenal/strength/preseason.html?id=${encodeURIComponent(athleteId)}`,
        "Preseason"
      );
    }

    // Still expose Conditioning for F4 even if status.json fails
    if (isTeen) {
      openTile(
        conditioningBtn,
        `/athletes/lanes/f4-conditioning/?id=${encodeURIComponent(athleteId)}`,
        "Conditioning"
      );
    }
  }
}

initStrengthMenu();
