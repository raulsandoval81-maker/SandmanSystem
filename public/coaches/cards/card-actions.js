(function () {
  const KEY = "sandman_clipboard_v1";

  function getSkillFromPath() {
    const match = window.location.pathname.match(/skill-(\d+)/i);
    return match ? match[1].padStart(2, "0") : "";
  }

  function getTierFromPage(root = document) {
    const tierLine = Array.from(root.querySelectorAll("p"))
      .find(p => p.textContent.includes("Tier:"));

    if (!tierLine) return "";

    const match = tierLine.textContent.match(/\bT\d+\b/i);
    return match ? match[0].toUpperCase() : "";
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

  function getCardFromButton(btn, lane = null) {
    const root = btn.closest(".coach-card") || document;

    return {
      id: btn.dataset.id || window.location.pathname,
      title: btn.dataset.title || "Untitled Skill",
      category: normalizeCategory(btn.dataset.category || "technique"),
      minutes: Number(btn.dataset.minutes || 10),
      timer: btn.dataset.timer || "tech_partner_2",
      skill: getSkillFromPath(),
      tier: getTierFromPage(root),
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

    setTimeout(() => {
      btn.textContent = fallback;
      btn.classList.remove("success", "error");
    }, 800);
  }

  function findCardRoot(el) {
    return el.closest(".coach-card");
  }

  function replaceSaveToBankWithClipboardLink() {
    const addBtn = document.querySelector("[data-add-card]");
    if (!addBtn) return;
    if (document.querySelector(".back-to-clipboard")) return;

    const link = document.createElement("a");
    link.href = "/coaches/execution/daily-clipboard/";
    link.className = addBtn.className || "pill-btn";
    link.classList.add("back-to-clipboard");
    link.textContent = "Back to Clipboard";

    addBtn.replaceWith(link);
  }

  document.addEventListener("DOMContentLoaded", () => {
    replaceSaveToBankWithClipboardLink();
  });

  document.addEventListener("click", (e) => {
    const assignBtn = e.target.closest("[data-assign]");
    if (assignBtn) {
      const lane = assignBtn.dataset.assign;
      const cardRoot = findCardRoot(assignBtn);
      const addButton = cardRoot?.querySelector("[data-add-card]");

      // if original add button was replaced, find card data from page-level fallback
      const sourceButton = addButton || {
        dataset: {
          id: document.querySelector("[data-add-card]")?.dataset.id || window.location.pathname,
          title: document.querySelector("[data-add-card]")?.dataset.title || document.querySelector("h1,h2")?.textContent?.trim() || "Untitled Skill",
          category: document.querySelector("[data-add-card]")?.dataset.category || "technique",
          minutes: document.querySelector("[data-add-card]")?.dataset.minutes || 10,
          timer: document.querySelector("[data-add-card]")?.dataset.timer || "tech_partner_2"
        },
        closest: () => cardRoot
      };

      const card = getCardFromButton(sourceButton, lane);
      const current = loadClipboard();

      const cleanLane = String(card.lane || "").toLowerCase().trim();

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

      current.push(card);
      saveClipboard(current);

      feedback(assignBtn, "success", assignBtn.dataset.originalText || assignBtn.textContent);
    }
  });
})();