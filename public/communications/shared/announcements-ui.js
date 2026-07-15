// /communications/shared/announcements-ui.js
// Shared announcements renderer
// Used by:
// - Coach/Admin
// - Parent
// - Athlete

export function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeDate(timestamp) {
  try {
    const date =
      typeof timestamp?.toDate === "function"
        ? timestamp.toDate()
        : timestamp instanceof Date
          ? timestamp
          : timestamp
            ? new Date(timestamp)
            : null;

    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    return date.toLocaleString();
  } catch {
    return "";
  }
}

export function normalizeDiscipline(
  value = ""
) {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}

export function disciplineLabel(
  value = ""
) {
  const normalized =
    normalizeDiscipline(value);

  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    mma: "MMA",
    "submission-grappling":
      "Submission Grappling"
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  if (!normalized) {
    return "All Disciplines";
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export function audienceLabel(
  value = "all"
) {
  const audience =
    String(value || "all")
      .trim()
      .toLowerCase();

  if (audience === "parents") {
    return "Parents";
  }

  if (audience === "athletes") {
    return "Athletes";
  }

  return "All";
}

export function scopeLabel(
  announcement = {}
) {
  const scope =
    String(
      announcement.scope || "all"
    )
      .trim()
      .toLowerCase();

  if (
    scope === "discipline" &&
    announcement.discipline
  ) {
    return disciplineLabel(
      announcement.discipline
    );
  }

  return "All Disciplines";
}

export function getIconFromText(
  text = ""
) {
  const normalized =
    String(text || "")
      .toLowerCase();

  if (
    normalized.includes("wrestling") ||
    normalized.includes("practice")
  ) {
    return "🤼";
  }

  if (
    normalized.includes("boxing")
  ) {
    return "🥊";
  }

  if (
    normalized.includes("mma")
  ) {
    return "🥋";
  }

  if (
    normalized.includes("tournament") ||
    normalized.includes("competition")
  ) {
    return "🏆";
  }

  if (
    normalized.includes("schedule") ||
    normalized.includes("change") ||
    normalized.includes("calendar")
  ) {
    return "📅";
  }

  if (
    normalized.includes("gear") ||
    normalized.includes("equipment")
  ) {
    return "🎒";
  }

  if (
    normalized.includes("transport") ||
    normalized.includes("ride") ||
    normalized.includes("bus")
  ) {
    return "🚗";
  }

  if (
    normalized.includes("urgent") ||
    normalized.includes("notice") ||
    normalized.includes("important")
  ) {
    return "⚠️";
  }

  if (
    normalized.includes("run") ||
    normalized.includes("conditioning")
  ) {
    return "🏃";
  }

  if (
    normalized.includes("lift") ||
    normalized.includes("strength")
  ) {
    return "🏋️";
  }

  if (
    normalized.includes("honor") ||
    normalized.includes("character")
  ) {
    return "🛡️";
  }

  return "📣";
}

export function getAnnIcon(
  announcement = {}
) {
  const basis = [
    announcement.category,
    announcement.title,
    announcement.discipline
  ]
    .filter(Boolean)
    .join(" ");

  return getIconFromText(basis);
}

export function renderAnnouncementCard(
  announcement = {},
  options = {}
) {
  const icon =
    getAnnIcon(announcement);

  const showTeam =
    options.showTeam !== false;

  const showAudience =
    options.showAudience !== false;

  const showPinned =
    options.showPinned !== false;

  const showCategory =
    options.showCategory !== false;

  const showScope =
    options.showScope !== false;

  const pinned =
    announcement.pinned === true;

  const audience =
    audienceLabel(
      announcement.audienceType
    );

  const scope =
    scopeLabel(
      announcement
    );

  const pinPill =
    showPinned && pinned
      ? `
        <span
          class="pill pill-pin"
          style="margin-left:8px;"
        >
          PINNED
        </span>
      `
      : "";

  const categoryPill =
    showCategory &&
    announcement.category
      ? `
        <span
          class="pill pill-dark"
        >
          ${esc(announcement.category)}
        </span>
      `
      : "";

  const scopePill =
    showScope
      ? `
        <span
          class="pill pill-dark"
        >
          ${esc(scope)}
        </span>
      `
      : "";

  const audienceTag =
    showAudience
      ? `
        <div class="feed-tag">
          ${esc(audience)}
        </div>
      `
      : "";

  const teamLine =
    showTeam &&
    announcement.teamId
      ? `
        <span class="feed-team">
          ${esc(announcement.teamId)}
        </span>
      `
      : "";

  const createdAt =
    safeDate(
      announcement.createdAt
    );

  return `
    <div class="card feed-card ${pinned ? "pinned" : ""}">
      <div class="feed-head">
        <div class="feed-title">
          <span class="feed-icon">
            ${esc(icon)}
          </span>

          <span>
            ${esc(
              announcement.title ||
              "(No title)"
            )}
          </span>

          ${pinPill}
        </div>

        ${audienceTag}
      </div>

      ${
        categoryPill ||
        scopePill
          ? `
            <div
              class="feed-pills"
              style="
                display:flex;
                flex-wrap:wrap;
                gap:8px;
                margin-top:6px;
              "
            >
              ${categoryPill}
              ${scopePill}
            </div>
          `
          : ""
      }

      <div class="feed-body">
        ${esc(
          announcement.message || ""
        )}
      </div>

      <div class="feed-foot">
        <span class="feed-date">
          ${esc(createdAt)}
        </span>

        ${teamLine}
      </div>
    </div>
  `;
}

export function sortPinnedThenNewest(
  items = []
) {
  const timestampSeconds = (
    timestamp
  ) => {
    try {
      if (
        typeof timestamp?.seconds ===
        "number"
      ) {
        return timestamp.seconds;
      }

      const date =
        typeof timestamp?.toDate ===
        "function"
          ? timestamp.toDate()
          : timestamp instanceof Date
            ? timestamp
            : timestamp
              ? new Date(timestamp)
              : null;

      if (
        date instanceof Date &&
        !Number.isNaN(
          date.getTime()
        )
      ) {
        return Math.floor(
          date.getTime() / 1000
        );
      }

      return 0;
    } catch {
      return 0;
    }
  };

  return [...items].sort(
    (a, b) => {
      const aPinned =
        a.pinned === true ? 1 : 0;

      const bPinned =
        b.pinned === true ? 1 : 0;

      if (
        bPinned !== aPinned
      ) {
        return (
          bPinned - aPinned
        );
      }

      return (
        timestampSeconds(
          b.createdAt
        ) -
        timestampSeconds(
          a.createdAt
        )
      );
    }
  );
}