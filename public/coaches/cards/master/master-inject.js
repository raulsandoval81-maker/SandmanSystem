(function () {
  const path = window.location.pathname;

  if (!path.includes("/cards/")) return;
  if (path.endsWith("index.html")) return;
  const key = "sandman_clipboard_v1";

  // --- READ DATA FROM PAGE ---

const addBtn = document.querySelector("[data-add-card]");

function getSkillFromPath(path) {
  const match = path.match(/skill-(\d+)/i);
  return match ? match[1].padStart(2, "0") : "";
}

function getTierFromPage() {
  const tierLine = Array.from(document.querySelectorAll("p"))
    .find(p => p.textContent.includes("Tier:"));

  if (!tierLine) return "";

  const match = tierLine.textContent.match(/\bT\d+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function getFirstCueFromPage() {
  const headings = Array.from(document.querySelectorAll("h3"));
  const cueHeading = headings.find(
    h => h.textContent.trim().toLowerCase() === "coaching cues"
  );

  if (!cueHeading) return "";

  let next = cueHeading.nextElementSibling;

  while (next) {
    if (next.tagName === "UL") {
      const li = next.querySelector("li");
      return li
        ? li.textContent.replace(/[“”"]/g, "").trim()
        : "";
    }
    if (/^H[1-6]$/.test(next.tagName)) break;
    next = next.nextElementSibling;
  }

  return "";
}

const card = {
  id:
    addBtn?.dataset.id ||
    path.replace(/\/+/g, "-").replace(/^-|-$/g, ""),

  title:
    addBtn?.dataset.title ||
    document.querySelector("h1, h2")?.textContent?.replace(/^Skill\s*—\s*/i, "").trim() ||
    document.title ||
    "Untitled Skill",

  category:
    normalizeCategory(addBtn?.dataset.category || "technique"),

  minutes:
    Number(addBtn?.dataset.minutes || 10),

  timer:
    addBtn?.dataset.timer || "tech_partner_2",

  timerMode:
    addBtn?.dataset.timerMode || null,

  skill:
    getSkillFromPath(path),

  tier:
    getTierFromPage(),

  cue:
    getFirstCueFromPage(),

  href: path
};
  // --- UI ---
  const container = document.createElement("div");
  container.className = "card-actions";

container.innerHTML = `
  <a class="pill-btn" href="./index.html">← Back</a>

  <div class="card-actions">
    <button class="pill-btn" data-assign="technique" type="button">Technique</button>
    <button class="pill-btn" data-assign="drill" type="button">Drill</button>
    <button class="pill-btn" data-assign="live" type="button">Live</button>
  </div>

  <a class="pill-btn" href="/coaches/execution/daily-clipboard/">
    ← Back to Clipboard
  </a>
`;
  document.body.appendChild(container);

  // --- STYLE ---
  const style = document.createElement("style");
  style.innerHTML = `
    .card-actions{
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      z-index: 999;
      max-width: min(95vw, 900px);
      padding: 0 12px;
    }

    .pill-btn{
      padding: .55rem 1rem;
      border-radius: 999px;
      background: #0b1017;
      border: 1px solid #1d2430;
      color: #f5f5f5;
      font-weight: 800;
      font-size: .8rem;
      text-decoration: none;
      cursor: pointer;
      transition: .18s ease;
    }

    .pill-btn:hover{
      border-color: #e63946;
      box-shadow: 0 0 10px rgba(230,57,70,.25);
    }

    .bank-btn{
      opacity: .88;
    }

    .pill-btn.success{
      background: #1f7a1f;
      border-color: #1f7a1f;
      color: #fff;
    }

    .pill-btn.error{
      background: #7a1f1f;
      border-color: #7a1f1f;
      color: #fff;
    }
  `;
  document.head.appendChild(style);

  // --- HELPERS ---
  function getClipboard() {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveClipboard(data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function flashButton(button, text, type = "success") {
    const original = button.dataset.originalText || button.textContent;
    button.dataset.originalText = original;

    button.textContent = text;
    button.classList.remove("success", "error");
    button.classList.add(type);

    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("success", "error");
    }, 800);
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

function buildCard(lane = null) {
  return {
    ...card,
    lane: lane ? normalizeLane(lane) : null
  };
}

// --- ASSIGN LOGIC ---
container.querySelectorAll("[data-assign]").forEach(assignBtn => {
  assignBtn.addEventListener("click", () => {
    const lane = assignBtn.dataset.assign;
    const current = getClipboard();
    const assignedCard = buildCard(lane);

    const cleanLane = String(assignedCard.lane || "").toLowerCase().trim();

    const exists = current.some(
      item =>
        String(item.id || "") === String(assignedCard.id || "") &&
        String(item.lane || "").toLowerCase().trim() === cleanLane
    );

    if (exists) {
      flashButton(assignBtn, "Already There", "error");
      return;
    }

    const count = current.filter(item =>
      String(item.lane || "").toLowerCase().trim() === cleanLane
    ).length;

    if (count >= 4) {
      flashButton(assignBtn, "Max reached", "error");
      return;
    }

    current.push(assignedCard);
    saveClipboard(current);
    flashButton(assignBtn, "✓ Added", "success");
  });
});
})();