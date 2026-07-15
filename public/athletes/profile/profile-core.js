import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const getAthleteProfileFeedCall =
  httpsCallable(functions, "getAthleteProfileFeed");

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : "—";
}

async function getFeed(athleteId) {
  const result =
    await getAthleteProfileFeedCall({
      athleteId
    });

  return result.data || {};
}

function renderAchievementItem(item = {}) {
  return `
    <div class="achievement-row">
      <strong>${esc(item.label || "Achievement")}</strong>
      <p>${esc(item.message || item.title || item.note || "")}</p>
      <small>${esc(formatDate(item.createdAt))}</small>
    </div>
  `;
}

function activityLaneLabel(item = {}) {
  const kind = String(
    item.kind || ""
  ).toUpperCase();

  const lane = String(
    item.lane ||
    item.meta?.lane ||
    ""
  ).toLowerCase();

  if (
    kind.includes("STRENGTH") ||
    lane === "strength"
  ) {
    return "Strength";
  }

  if (
    kind.includes("HONOR") ||
    lane === "honor"
  ) {
    return "Honor";
  }

  const rawDiscipline = String(
    item.discipline ||
    item.primaryDiscipline ||
    item.sport ||
    item.art ||
    item.meta?.discipline ||
    item.meta?.primaryDiscipline ||
    item.meta?.sport ||
    item.meta?.art ||
    item.meta?.program ||
    item.meta?.track ||
    ""
  ).toLowerCase();

  if (rawDiscipline.includes("kickbox")) {
    return "Kickboxing";
  }

  if (rawDiscipline.includes("wrest")) {
    return "Wrestling";
  }

  if (
    rawDiscipline.includes("mma") ||
    rawDiscipline.includes("mixed martial")
  ) {
    return "MMA";
  }

  if (rawDiscipline.includes("box")) {
    return "Boxing";
  }

  if (
    rawDiscipline.includes("submission") ||
    rawDiscipline.includes("grappling")
  ) {
    return "Submission Grappling";
  }

  // Legacy records may not contain discipline metadata.
  return "Combat";
}

function renderActivityItem(item = {}) {
  const amount =
    Number(item.amount || 0);

  const sign =
    amount > 0 ? "+" : "";

  const laneLabel =
    activityLaneLabel(item);

  return `
    <div class="activity-row">
      <strong>${esc(laneLabel)} ${esc(sign)}${esc(amount)} XP</strong>
      <p>${esc(item.label || item.note || item.kind || "XP Earned")}</p>
      <small>${esc(formatDate(item.createdAt))}</small>
    </div>
  `;
}

export async function renderAthleteAchievements({
  athleteId,
  targetId = "achievementFeed",
  max = 5,
}) {
  const target =
    document.getElementById(targetId);

  if (!target || !athleteId) return;

  target.innerHTML =
    `<p class="muted">Loading achievements...</p>`;

  try {
    const data =
      await getFeed(athleteId);

    const items =
      (data.achievements || [])
        .slice(0, max);

    if (!items.length) {
      target.innerHTML =
        `<p class="muted">No achievements yet.</p>`;
      return;
    }

    const collapsedCount =
      Math.min(2, items.length);

    const hasMore =
      items.length > collapsedCount;

    target.innerHTML = `
      <div class="achievement-list">
        ${items.map((item, index) => `
          <div
            class="achievement-feed-item"
            data-achievement-item
            ${index >= collapsedCount ? "hidden" : ""}
          >
            ${renderAchievementItem(item)}
          </div>
        `).join("")}
      </div>

      ${
        hasMore
          ? `
            <button
              type="button"
              class="activity-toggle"
              data-achievement-toggle
              aria-expanded="false"
            >
              Show last ${items.length}
            </button>
          `
          : ""
      }
    `;

    const toggle =
      target.querySelector(
        "[data-achievement-toggle]"
      );

    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const expanded =
        toggle.getAttribute(
          "aria-expanded"
        ) === "true";

      target
        .querySelectorAll(
          "[data-achievement-item]"
        )
        .forEach((item, index) => {
          item.hidden =
            expanded
              ? index >= collapsedCount
              : false;
        });

      toggle.setAttribute(
        "aria-expanded",
        String(!expanded)
      );

      toggle.textContent =
        expanded
          ? `Show last ${items.length}`
          : "Show less";
    });
  } catch (err) {
    console.error(
      "[athlete-achievements] failed:",
      err
    );

    target.innerHTML =
      `<p class="muted">Achievements unavailable.</p>`;
  }
}

export async function renderAthleteActivity({
  athleteId,
  targetId = "activityFeed",
  max = 5,
}) {
  const target =
    document.getElementById(targetId);

  if (!target || !athleteId) return;

  target.innerHTML =
    `<p class="muted">Loading activity...</p>`;

  try {
    const data =
      await getFeed(athleteId);

    const items =
      (data.activity || [])
        .slice(0, max);

    if (!items.length) {
      target.innerHTML =
        `<p class="muted">No activity yet.</p>`;
      return;
    }

    const collapsedCount =
      Math.min(2, items.length);

    const hasMore =
      items.length > collapsedCount;

    target.innerHTML = `
      <div class="activity-list">
        ${items.map((item, index) => `
          <div
            class="activity-feed-item"
            data-activity-item
            ${index >= collapsedCount ? "hidden" : ""}
          >
            ${renderActivityItem(item)}
          </div>
        `).join("")}
      </div>

      ${
        hasMore
          ? `
            <button
              type="button"
              class="activity-toggle"
              data-activity-toggle
              aria-expanded="false"
            >
              Show last ${items.length}
            </button>
          `
          : ""
      }
    `;

    const toggle =
      target.querySelector(
        "[data-activity-toggle]"
      );

    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const expanded =
        toggle.getAttribute(
          "aria-expanded"
        ) === "true";

      target
        .querySelectorAll(
          "[data-activity-item]"
        )
        .forEach((item, index) => {
          item.hidden =
            expanded
              ? index >= collapsedCount
              : false;
        });

      toggle.setAttribute(
        "aria-expanded",
        String(!expanded)
      );

      toggle.textContent =
        expanded
          ? `Show last ${items.length}`
          : "Show less";
    });
  } catch (err) {
    console.error(
      "[athlete-activity] failed:",
      err
    );

    target.innerHTML =
      `<p class="muted">Activity unavailable.</p>`;
  }
}