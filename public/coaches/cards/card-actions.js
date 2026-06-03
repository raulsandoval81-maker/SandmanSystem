(function () {
  const KEY = "sandman_clipboard_v1";
  const SESSION_FILTER_KEY = "sandman_clipboard_filter_v1";

  function getActiveClipboardFilter() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_FILTER_KEY) || "{}");
    } catch {
      return {};
    }
  }

function cardAllowedForSession(card) {
  const filter = getActiveClipboardFilter();

  if (
    filter.discipline &&
    card.discipline &&
    card.discipline !== filter.discipline
  ) {
    return false;
  }

  // Journey controls which card hub opens.
  // Do not block adds by journey until every card has clean data-journey.

  if (
    filter.tier &&
    card.tier &&
    String(card.tier).toLowerCase() !== String(filter.tier).toLowerCase()
  ) {
    return false;
  }

  return true;
}
  function getSkillFromPath() {
    const match = window.location.pathname.match(/skill-(\d+)/i);
    return match ? match[1].padStart(2, "0") : "";
  }

  function getTierFromPage(root = document) {
    const tierLine = Array.from(root.querySelectorAll("p"))
      .find(p => p.textContent.includes("Tier:"));

    if (!tierLine) return "";

    const match = tierLine.textContent.match(/\bT\d+\b/i);
    return match ? match[0].toLowerCase() : "";
  }

  function getFirstCueFromPage(root = document) {
    const headings = Array.from(root.querySelectorAll("h3"));
    const cueHeading = headings.find(
      h => h.textContent.trim().toLowerCase() === "coaching cues"
    );

    if (!cueHeading) return "";

    let next = cueHeading.nextElementSibling;

    while (next) {
      if (next.tagName === "UL") {
        const li = next.querySelector("li");
        return li ? li.textContent.replace(/[“”"]/g, "").trim() : "";
      }
      if (/^H[1-6]$/.test(next.tagName)) break;
      next = next.nextElementSibling;
    }

    return "";
  }

  function normalizeCategory(value) {
    switch ((value || "").toLowerCase()) {
      case "technique":
        return "technique";
      case "drill":
      case "drills":
        return "drill";
      case "live":
        return "live";
      case "conditioning":
      case "cond":
        return "conditioning";
      default:
        return "technique";
    }
  }

  function normalizeLane(value) {
    switch ((value || "").toLowerCase()) {
      case "technique":
        return "technique";
      case "drill":
      case "drills":
        return "drill";
      case "live":
        return "live";
      case "conditioning":
      case "cond":
        return "conditioning";
      default:
        return "technique";
    }
  }

  function getSlotLimit(card) {
    const lane = (card.lane || "").toLowerCase().trim();

    if (lane === "onmat" || lane === "offmat") return 1;

    return 4;
  }

  function getJourney(btn) {
    return btn?.dataset?.journey || "";
  }

  function getDiscipline(btn) {
    return btn?.dataset?.discipline || "";
  }

  function getTier(btn, root = document) {
    return btn?.dataset?.tier || getTierFromPage(root);
  }

  function getCardFromButton(btn, lane = null) {
    const root = btn.closest(".coach-card") || document;

    return {
      id: btn.dataset.id || window.location.pathname,
      title: btn.dataset.title || "Untitled Skill",
      category: normalizeCategory(btn.dataset.category || "technique"),
      minutes: Number(btn.dataset.minutes || 10),
      timer: btn.dataset.timer || "tech_partner_2",
      skill: getSkillFromPath(),
      tier: getTier(btn, root),
      discipline: getDiscipline(btn),
      journey: getJourney(btn),
      cue: getFirstCueFromPage(root),
      href: window.location.pathname,
      lane: normalizeLane(lane || btn.dataset.category || "technique")
    };
  }

  function loadClipboard() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveClipboard(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function feedback(btn, type = "success", originalText = "") {
    if (!btn) return;

    const fallback = originalText || btn.dataset.originalText || btn.textContent;
    btn.dataset.originalText = fallback;

    if (type === "success") {
      btn.textContent = "✓ Added";
      btn.classList.add("success");
    }

    if (type === "duplicate") {
      btn.textContent = "Already added";
      btn.classList.add("error");
    }

    if (type === "max") {
      btn.textContent = "Max reached";
      btn.classList.add("error");
    }

    if (type === "wrong-discipline") {
      btn.textContent = "Wrong discipline";
      btn.classList.add("error");
    }

    setTimeout(() => {
      btn.textContent = fallback;
      btn.classList.remove("success", "error");
    }, 1000);
  }

  function findCardRoot(el) {
    return el.closest(".coach-card");
  }



 function replaceSaveToBankWithClipboardLink() {

  const addBtn =
    document.querySelector("[data-add-card]");

  if (!addBtn) return;

  if (
    document.querySelector(".back-to-clipboard")
  ) return;

  const returnUrl =
    localStorage.getItem("sandman_return_to") ||
    "/coaches/execution/clipboard-2.0/";

  const link =
    document.createElement("a");

  link.href = returnUrl;

  link.className =
    addBtn.className || "pill-btn";

  link.classList.add("back-to-clipboard");

  link.textContent =
    returnUrl.includes("all-in-one")
      ? "Back to All-In-One"
      : "Back to Clipboard 2.0";

  addBtn.replaceWith(link);
}
 
  document.addEventListener("DOMContentLoaded", () => {
    replaceSaveToBankWithClipboardLink();
  });

  const activeFilter = getActiveClipboardFilter();

document.querySelectorAll("[data-assign]").forEach(btn => {

  const previewCard = getCardFromButton(
    document.querySelector("[data-add-card]"),
    btn.dataset.assign
  );

  const allowed =
    cardAllowedForSession(previewCard);

  const schema =
    localStorage.getItem("sandman_clipboard_schema");

  const session =
    JSON.parse(
      localStorage.getItem("sandman_session_builder_v1") || "{}"
    );

  const isYouthZ2H =
    session.program === "youth-z2h-wrestling";

  const cleanLane =
    String(btn.dataset.assign || "")
      .toLowerCase()
      .trim();

  const isGame =
    previewCard.category === "game" ||
    previewCard.category === "games";

  const allowedGame =
    (
      ["elite-90", "extended-120"].includes(schema) &&
      (cleanLane === "water" || cleanLane === "games")
    ) ||
    (
      isYouthZ2H &&
      (
        cleanLane === "cond" ||
        cleanLane === "conditioning"
      )
    );

  if (!allowed || (isGame && !allowedGame)) {

    btn.disabled = true;

    btn.classList.add(
      "disabled-discipline"
    );

    btn.textContent = "Not allowed";
  }
});

  document.addEventListener("click", (e) => {
    const assignBtn = e.target.closest("[data-assign]");
    if (!assignBtn) return;



const pendingLane =
  localStorage.getItem("sandman_pending_add_lane");

const lane =
  pendingLane || assignBtn.dataset.assign;

const cardRoot = findCardRoot(assignBtn);
const addButton = cardRoot?.querySelector("[data-add-card]");

const sourceButton = addButton || {
  dataset: {
    id: document.querySelector("[data-add-card]")?.dataset.id || window.location.pathname,
    title: document.querySelector("[data-add-card]")?.dataset.title || document.querySelector("h1,h2")?.textContent?.trim() || "Untitled Skill",
    category: document.querySelector("[data-add-card]")?.dataset.category || "technique",
    discipline: document.querySelector("[data-add-card]")?.dataset.discipline || "",
    journey: document.querySelector("[data-add-card]")?.dataset.journey || "",
    tier: document.querySelector("[data-add-card]")?.dataset.tier || "",
    minutes: document.querySelector("[data-add-card]")?.dataset.minutes || 10,
    timer: document.querySelector("[data-add-card]")?.dataset.timer || "tech_partner_2"
  },
  closest: () => cardRoot
};

const card = getCardFromButton(sourceButton, lane);
const current = loadClipboard();

if (!cardAllowedForSession(card)) {
  feedback(assignBtn, "wrong-discipline", assignBtn.dataset.originalText || assignBtn.textContent);
  console.warn("🚫 Wrong card for active clipboard session:", card);
  return;
}

const cleanLane =
  String(card.lane || "").toLowerCase().trim();

const existsInLane = current.some(c =>
  String(c.id || "") === String(card.id || "") &&
  String(c.lane || "").toLowerCase().trim() === cleanLane
);

if (existsInLane) {
  feedback(assignBtn, "duplicate", assignBtn.dataset.originalText || assignBtn.textContent);
  return;
}

const count = current.filter(c =>
  String(c.lane || "").toLowerCase().trim() === cleanLane
).length;

const limit = getSlotLimit(card);

if (count >= limit) {
  feedback(assignBtn, "max", assignBtn.dataset.originalText || assignBtn.textContent);
  return;
}

const schema =
  localStorage.getItem("sandman_clipboard_schema");

const session =
  JSON.parse(localStorage.getItem("sandman_session_builder_v1") || "{}");

const isYouthZ2H =
  session.program === "youth-z2h-wrestling";

const isGame =
  card.category === "game" ||
  card.category === "games";

const allowedGame =
  (
    ["elite-90", "extended-120"].includes(schema) &&
    (cleanLane === "water" || cleanLane === "games")
  ) ||
  (
    isYouthZ2H &&
    (cleanLane === "cond" || cleanLane === "conditioning")
  );

if (isGame && !allowedGame) {
  alert("Games are only allowed in 90/120 water breaks or Youth Z2H conditioning.");
  return;
}

current.push(card);
saveClipboard(current);

localStorage.removeItem("sandman_pending_add_lane");

feedback(
  assignBtn,
  "success",
  assignBtn.dataset.originalText || assignBtn.textContent
); 
  });
})();