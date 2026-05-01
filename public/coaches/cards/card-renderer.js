export function renderCards(cards, container) {
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(cards) || !cards.length) {
    container.innerHTML = `<div class="muted">No skills yet.</div>`;
    return;
  }

  cards.forEach(card => {
    const rawTitle = (card.title || "Untitled Skill").trim();
    const cleanTitle = rawTitle
      .replace(/^Skill\s*\d+\s*[—-]\s*/i, "")
      .replace(/^Skill\s*\d+\s*/i, "")
      .trim();

    const skillNum = String(card.skill || "").padStart(2, "0");
    const tier = (card.tier || "").trim().toUpperCase();
    const cue = typeof card.cue === "string" ? card.cue.trim() : "";
    const href = typeof card.href === "string" ? card.href.trim() : "";

    const el = document.createElement("div");
    el.className = "clip-item";
el.innerHTML = `
  <div class="clip-line1">
    ${href
      ? `<a class="clip-title-link" href="${escapeAttr(href)}">${escapeHtml(cleanTitle)}</a>`
      : `${escapeHtml(cleanTitle)}`
    }
  </div>

  ${(skillNum || tier) ? `
    <div class="clip-line2">
      — Skill ${escapeHtml(skillNum)} · ${escapeHtml(tier)}
    </div>
  ` : ""}

  ${cue ? `
    <div class="clip-line3">
      — ${escapeHtml(cue)}
    </div>
  ` : ""}
`;
    container.appendChild(el);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}