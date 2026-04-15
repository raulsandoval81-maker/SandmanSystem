console.log("Strength lane loaded");

const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const preseasonBtn = document.getElementById("strength-preseason");
const inseasonBtn = document.getElementById("strength-inseason");
const postseasonBtn = document.getElementById("strength-postseason");

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

  if (!athleteId) {
    console.warn("Missing athlete id on Strength menu page.");
    return;
  }

  try {
    const status = await fetchJson("/vault/system-status.json");
    const strength = status?.strength || {};

    const activePhase = String(strength.seasonPhase || "preseason")
      .trim()
      .toLowerCase();

    console.log("Strength phase:", activePhase, "| teen:", isTeen, "| youth:", isYouth);

    const preseasonHref = `/athletes/arsenal/strength/preseason.html?id=${encodeURIComponent(athleteId)}`;
    const inseasonHref = `/athletes/arsenal/strength/inseason.html?id=${encodeURIComponent(athleteId)}`;
const postseasonHref = `/athletes/arsenal/strength/postseason.html?id=${encodeURIComponent(athleteId)}`;
    // Youth = one shared XP bar, but still only coach-open phase should open
    // Teens = separate Strength XP bar, same coach-open phase rule
    if (activePhase === "preseason") {
      openTile(preseasonBtn, preseasonHref, "Preseason");
    } else if (activePhase === "inseason") {
      openTile(inseasonBtn, inseasonHref, "In-Season");
    } else if (activePhase === "postseason") {
      openTile(postseasonBtn, postseasonHref, "Postseason");
    } else {
      openTile(preseasonBtn, preseasonHref, "Preseason");
    }

  } catch (err) {
    console.error("Strength menu init failed:", err);

    openTile(
      preseasonBtn,
      `/athletes/arsenal/strength/preseason.html?id=${encodeURIComponent(athleteId)}`,
      "Preseason"
    );
  }
}

initStrengthMenu();