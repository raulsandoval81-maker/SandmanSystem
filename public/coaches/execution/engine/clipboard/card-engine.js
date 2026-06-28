// public/coaches/execution/engine/clipboard/card-engine.js

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getAutoDesc(card) {
  if (card.desc) return card.desc;

  const title = (card.title || "").toLowerCase();
  const category = (card.category || "").toLowerCase().trim();
  const lane = (card.lane || "").toLowerCase().trim();

  if (
    lane === "water" ||
    category === "game" ||
    category === "games"
  ) {
    return "Reset on your own";
  }

  if (title.includes("push")) return "3–5 sets";
  if (title.includes("sit")) return "3–5 sets";
  if (title.includes("pull")) return "3–5 sets";

  if (title.includes("plank")) return "3 x 30 sec hold";
  if (title.includes("hold")) return "hold + control position";

  if (title.includes("carry")) return "down & back x 3";
  if (title.includes("walk")) return "down & back x 3";
  if (title.includes("drag")) return "down & back x 3";

  if (title.includes("crawl")) return "forward + backward";
  if (title.includes("bear")) return "forward + backward";

  if (title.includes("sprint")) return "wall to wall x 3";
  if (title.includes("shuttle")) return "wall to wall x 3";

  if (title.includes("balance")) return "hold + control position";

  if (category === "conditioning") return "3–5 sets";
  if (category === "warmup") return "controlled reps";

  return "";
}

export function makeClipCard(card) {
  const el = document.createElement("div");

  el.className = "clip-card";
  el.setAttribute("contenteditable", "false");

  const title = (card.title || "Untitled").trim();
  const href = typeof card.href === "string" ? card.href.trim() : "";
  const category = (card.category || "").toLowerCase();
  const lane = (card.lane || "").toLowerCase().trim();

  const hrefParts = href.split("/").filter(Boolean);

  const parsedDiscipline =
    hrefParts.includes("p2l-kickboxing") ? "kickboxing" :
    hrefParts.includes("p2l-boxing") ? "boxing" :
    hrefParts.includes("p2l-wrestling") ? "wrestling" :
    hrefParts.includes("z2h-wrestling") ? "wrestling" :
    hrefParts.includes("q2m-mma") ? "mma" :
    hrefParts.includes("r2g-boxing") ? "boxing" :
    "";

  const parsedJourney =
    hrefParts.includes("p2l-kickboxing") ||
    hrefParts.includes("p2l-boxing") ||
    hrefParts.includes("p2l-wrestling") ? "p2l" :
    hrefParts.includes("z2h-wrestling") ? "z2h" :
    hrefParts.includes("q2m-mma") ? "q2m" :
    hrefParts.includes("r2g-boxing") ? "r2g" :
    "";

  const parsedTier =
    hrefParts.find(part => /^t\d+$/i.test(part)) || "";

  const skillMatch = href.match(/skill-(\d+)/i);
  const parsedSkill = skillMatch ? skillMatch[1] : "";

  el.dataset.skill = card.skill || parsedSkill || "";
  el.dataset.tier = card.tier || parsedTier || "";
  el.dataset.discipline = card.discipline || parsedDiscipline || "";
  el.dataset.journey = card.journey || parsedJourney || "";
  el.dataset.category = card.category || "";
  el.dataset.lane = card.lane || "";

  if (category === "mat-talk") {
    el.innerHTML = `
      <div class="clip-card-body compact mat-talk-card">
        <div class="clip-card-lines">
          <div class="clip-line1">
            ${
              href
                ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
                : `<span class="clip-title">${escapeHtml(title)}</span>`
            }
          </div>
        </div>
      </div>
    `;

    return el;
  }

  if (
    ["game", "games", "warmup", "conditioning", "cond"].includes(category) ||
    [
      "water",
      "game",
      "games",

      "warmup",
      "warmup_body",
      "warmup_agility",

      "warmup_footwork",
      "warmup_striking_motion",
      "warmup_reaction",

      "warmup_transition",
      "warmup_movement",
      "warmup_live",

      "cond",
      "conditioning"
    ].includes(lane)
  ) {
    const desc = getAutoDesc(card);

    el.innerHTML = `
      <div class="clip-card-body compact">
        <div class="clip-card-lines">
          <div class="clip-line1">
            ${
              href
                ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(title)}</a>`
                : `<span class="clip-title">${escapeHtml(title)}</span>`
            }
          </div>

          ${desc ? `<div class="clip-line2">— ${escapeHtml(desc)}</div>` : ""}
        </div>
      </div>
    `;

    return el;
  }

  const skill = String(card.skill || parsedSkill || "").padStart(2, "0");
  const tier = (card.tier || parsedTier || "").trim().toUpperCase();
  const cue = typeof card.cue === "string" ? card.cue.trim() : "";

  const cleanTitle =
    title.replace(/^Skill\s*\d+\s*[—-]\s*/i, "").trim();

  el.innerHTML = `
    <div class="clip-card-body compact">
      <div class="clip-card-lines">
        <div class="clip-line1">
          ${
            href
              ? `<a class="clip-title-link" href="${escapeHtml(href)}">${escapeHtml(cleanTitle)}</a>`
              : `<span class="clip-title">${escapeHtml(cleanTitle)}</span>`
          }
        </div>

        ${(skill || tier) ? `
          <div class="clip-line2">
            — Skill ${escapeHtml(skill)} · ${escapeHtml(tier)}
          </div>
        ` : ""}

        ${cue ? `
          <div class="clip-line3">
            — ${escapeHtml(cue)}
          </div>
        ` : ""}
      </div>
    </div>
  `;

  return el;
}