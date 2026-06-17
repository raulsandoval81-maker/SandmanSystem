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

function renderActivityItem(item = {}) {
  const amount =
    Number(item.amount || 0);

  const sign =
    amount > 0 ? "+" : "";

  return `
    <div class="activity-row">
      <strong>${esc(sign)}${esc(amount)} XP</strong>
      <p>${esc(item.label || item.note || item.kind || "XP Earned")}</p>
      <small>${esc(formatDate(item.createdAt))}</small>
    </div>
  `;
}

export async function renderAthleteAchievements({
  athleteId,
  targetId = "achievementFeed",
  max = 3,
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

    target.innerHTML =
      items.map(renderAchievementItem).join("");
  } catch (err) {
    console.error("[athlete-achievements] failed:", err);

    target.innerHTML =
      `<p class="muted">Achievements unavailable.</p>`;
  }
}

export async function renderAthleteActivity({
  athleteId,
  targetId = "activityFeed",
  max = 3,
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

    target.innerHTML =
      items.map(renderActivityItem).join("");
  } catch (err) {
    console.error("[athlete-activity] failed:", err);

    target.innerHTML =
      `<p class="muted">Activity unavailable.</p>`;
  }
}