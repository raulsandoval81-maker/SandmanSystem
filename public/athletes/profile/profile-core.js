import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "/assets/js/firebase-init.js";

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ATHLETE_ACHIEVEMENT_TYPES = new Set([
  "XP_MILESTONE",
  "TESTING_ELIGIBLE",
  "TEST_SCHEDULED",
  "TEST_STARTED",
  "TEST_PASSED",
  "PROMOTED",
  "COACH_NOTE",
]);

function labelFor(type = "") {
  const labels = {
    XP_MILESTONE: "⭐ Stripe Earned",
    TESTING_ELIGIBLE: "🎯 Testing Eligible",
    TEST_SCHEDULED: "📋 Testing Scheduled",
    TEST_STARTED: "🟡 Testing Started",
    TEST_PASSED: "🏆 Testing Passed",
    PROMOTED: "⬆️ Promotion Earned",
    COACH_NOTE: "📝 Coach Note",
  };

  return labels[type] || "Achievement";
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    value?.toDate?.() ||
    new Date(value);

  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : "—";
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
    const qy = query(
      collection(db, "parentInbox"),
      where("athleteId", "==", athleteId),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const snap =
      await getDocs(qy);

    const items =
      snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter((item) =>
          ATHLETE_ACHIEVEMENT_TYPES.has(item.type)
        )
        .slice(0, max);

    if (!items.length) {
      target.innerHTML =
        `<p class="muted">No achievements yet.</p>`;
      return;
    }

    target.innerHTML =
      items
        .map((item) => {
          return `
            <div class="achievement-row">
              <strong>${esc(labelFor(item.type))}</strong>
              <p>${esc(item.message || item.title || "")}</p>
              <small>${esc(formatDate(item.createdAt))}</small>
            </div>
          `;
        })
        .join("");
  } catch (err) {
    console.error("[athlete-achievements] failed:", err);

    target.innerHTML =
      `<p class="muted">Achievements unavailable.</p>`;
  }
}