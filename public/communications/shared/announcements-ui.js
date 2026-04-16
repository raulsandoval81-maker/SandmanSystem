// /communications/shared/announcements-ui.js
// Shared announcements renderer (Admin + Parent + Athlete)

export function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeDate(ts) {
  try { return ts?.toDate?.().toLocaleString?.() || ""; } catch { return ""; }
}

export function getIconFromText(text = "") {
  const t = String(text).toLowerCase();
  if (t.includes("practice")) return "🤼";
  if (t.includes("tournament")) return "🏆";
  if (t.includes("schedule") || t.includes("change")) return "📅";
  if (t.includes("gear")) return "🎒";
  if (t.includes("transport")) return "🚗";
  if (t.includes("urgent") || t.includes("notice") || t.includes("important")) return "⚠️";
  if (t.includes("run") || t.includes("conditioning")) return "🏃";
  if (t.includes("lift") || t.includes("strength")) return "🏋️";
  return "📣";
}

export function getAnnIcon(d) {
  const basis = d?.category || d?.title || "";
  return getIconFromText(basis);
}

export function renderAnnouncementCard(d, opts = {}) {
  const aud = String(d.audienceType || "all").toLowerCase();
  const icon = getAnnIcon(d);

  const showTeam = opts.showTeam !== false;
  const showAudience = opts.showAudience !== false;
  const showPinned = opts.showPinned !== false;
  const showCategory = opts.showCategory !== false;

  const pinPill =
    showPinned && d.pinned === true
      ? `<span class="pill pill-pin" style="margin-left:8px;">PINNED</span>`
      : "";

  const categoryPill =
    showCategory && d.category
      ? `<span class="pill pill-dark" style="margin-left:8px;">${esc(d.category)}</span>`
      : "";

  const audiencePill =
    showAudience
      ? `<div class="feed-tag">${esc(aud)}</div>`
      : `<div class="feed-tag" style="display:none"></div>`;

  const teamLine =
    showTeam
      ? `<span class="feed-team">${esc(d.teamId || "")}</span>`
      : `<span class="feed-team" style="display:none"></span>`;

  return `
    <div class="card feed-card">
      <div class="feed-head">
        <div class="feed-title">
          <span class="feed-icon">${esc(icon)}</span>
          ${esc(d.title || "(no title)")}
          ${pinPill}
        </div>
        ${audiencePill}
      </div>

      <div style="margin-top:6px;">
        ${categoryPill}
      </div>

      <div class="feed-body">${esc(d.message || "")}</div>

      <div class="feed-foot">
        <span class="feed-date">${esc(safeDate(d.createdAt))}</span>
        ${teamLine}
      </div>
    </div>
  `;
}

export function sortPinnedThenNewest(items = []) {
  const stampSeconds = (ts) => {
    try {
      if (typeof ts?.seconds === "number") return ts.seconds;
      const d = ts?.toDate?.();
      if (d instanceof Date) return Math.floor(d.getTime() / 1000);
      return 0;
    } catch { return 0; }
  };

  return [...items].sort((a, b) => {
    const ap = a.pinned === true ? 1 : 0;
    const bp = b.pinned === true ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return stampSeconds(b.createdAt) - stampSeconds(a.createdAt);
  });
}