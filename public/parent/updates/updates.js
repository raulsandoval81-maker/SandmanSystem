import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const updatesList =
  document.getElementById("updates-list");

const unreadCountEl =
  document.getElementById("unread-count");

const moreWrap =
  document.getElementById("updates-more-wrap");

const moreBtn =
  document.getElementById("updates-more-btn");

const getParentInboxCall =
  httpsCallable(functions, "getParentInbox");

const markParentInboxReadCall =
  httpsCallable(functions, "markParentInboxRead");

const INITIAL_VISIBLE = 3;
const MAX_VISIBLE = 8;

let currentItems = [];
let showAll = false;

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const labels = {
  COACH_NOTE: "📝 Coach Note",
  ATTENDANCE_LOGGED: "✅ Attendance Recorded",
  DAILY_GRIND_LOGGED: "📣 Daily Grind Logged",
  XP_MILESTONE: "⭐ XP Milestone • Stripe Earned",

  TEMPLE_ENTERED: "🛕 Temple Watch",
  TESTING_ELIGIBLE: "🎯 Testing Eligible",
  TEST_SCHEDULED: "📋 Testing Scheduled",
  TEST_DAY: "🥋 Test Day",
  TEST_STARTED: "🟡 Testing Started",

  TEST_PASSED: "🏆 Testing Passed",
  COOLDOWN_STARTED: "🙏 Gratitude Window • 5-Day Cooldown",
  PROMOTED: "⬆️ Promotion Earned",

  TEST_FAILED: "🛠 Additional Preparation Required",
  TEST_FREEZE: "🧊 Progress Freeze",
  PREPARATION_WINDOW: "⏳ Preparation Window • 5-Day Minimum",
  RETEST_READY: "🔁 Retest Ready",

  DECAY_WARNING: "⚠️ Decay Warning",
  DECAY_POINTS: "⬇️ Decay Points",
  PROGRAM_FROZEN: "🧊 Program Frozen",

  MINOR_INFRACTION: "⚠️ Minor Infraction",
  SEMI_MAJOR_INFRACTION: "🚨 Semi-Major Infraction",
  MAJOR_INFRACTION: "🛑 Major Infraction"
};

function getAthleteLabel(item = {}) {
  return (
    item.athleteName ||
    item.publicName ||
    item.athleteId ||
    item.athleteUid ||
    "Athlete"
  );
}

function formatDate(value) {
  if (!value) return "";

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  } catch {
    return "";
  }
}

function renderMessage(
  item,
  index
) {
  const isUnread =
    item.read !== true;

  const displayType =
    labels[item.type] ||
    "📣 Parent Update";

  const athleteLabel =
    getAthleteLabel(item);

  const created =
    formatDate(item.createdAt);

  const openByDefault =
    index === 0 &&
    isUnread;

  return `
    <details
      class="parent-update-row"
      data-message-id="${esc(item.id)}"
      ${openByDefault ? "open" : ""}
    >
      <summary class="parent-update-summary">
        <span class="update-summary-main">
          <span class="update-summary-athlete">
            ${esc(athleteLabel)}
          </span>

          <span class="update-summary-title">
            ${esc(displayType)}
          </span>

          <span class="update-summary-date">
            ${esc(created)}
          </span>
        </span>

        <span class="update-summary-side">
          ${
            isUnread
              ? `<span class="update-new-pill">NEW</span>`
              : ""
          }

          <span
            class="update-chevron"
            aria-hidden="true"
          >
            ›
          </span>
        </span>
      </summary>

      <div class="update-detail">
        <h3>
          ${esc(item.title || "Update")}
        </h3>

        <p>
          ${esc(item.message || "")}
        </p>

        ${
          item.note
            ? `
              <div class="update-note">
                <strong>Coach Note:</strong><br>
                ${esc(item.note)}
              </div>
            `
            : ""
        }

        ${
          isUnread
            ? `
              <button
                class="btn mark-read-btn"
                type="button"
                data-message-id="${esc(item.id)}"
                style="margin-top:14px;"
              >
                Mark Read
              </button>
            `
            : ""
        }
      </div>
    </details>
  `;
}

function renderUnreadCount(items = []) {
  if (!unreadCountEl) return;

  const count =
    items.filter(
      (item) => item.read !== true
    ).length;

  if (count > 0) {
    unreadCountEl.style.display =
      "inline-block";

    unreadCountEl.textContent =
      count === 1
        ? "1 unread"
        : `${count} unread`;
  } else {
    unreadCountEl.style.display =
      "none";

    unreadCountEl.textContent = "";
  }
}

function renderFeed() {
  if (!updatesList) return;

  const visible =
    showAll
      ? currentItems
      : currentItems.slice(
          0,
          INITIAL_VISIBLE
        );

  if (!visible.length) {
    updatesList.innerHTML =
      "<p>No updates available.</p>";

    if (moreWrap) {
      moreWrap.hidden = true;
    }

    return;
  }

  updatesList.innerHTML =
    visible
      .map(renderMessage)
      .join("");

  document
    .querySelectorAll(
      ".mark-read-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();

          await markRead(
            button.dataset.messageId
          );
        }
      );
    });

  if (moreWrap && moreBtn) {
    const hasMore =
      currentItems.length >
      INITIAL_VISIBLE;

    moreWrap.hidden =
      !hasMore;

    if (hasMore) {
      const remaining =
        Math.max(
          0,
          currentItems.length -
          INITIAL_VISIBLE
        );

      moreBtn.textContent =
        showAll
          ? "Show Less"
          : `Show ${remaining} More`;
    }
  }
}

async function markRead(messageId) {
  if (!messageId) return;

  try {
    await markParentInboxReadCall({
      messageId
    });

    await init();
  } catch (err) {
    console.error(err);
    alert(
      "Unable to mark update as read."
    );
  }
}

async function init() {
  try {
    const result =
      await getParentInboxCall({});

    currentItems =
      Array.isArray(result.data?.items)
        ? result.data.items.slice(
            0,
            MAX_VISIBLE
          )
        : [];

    renderUnreadCount(
      currentItems
    );

    renderFeed();
  } catch (err) {
    console.error(err);

    currentItems = [];

    updatesList.innerHTML =
      "<p>Unable to load updates.</p>";

    if (moreWrap) {
      moreWrap.hidden = true;
    }
  }
}

moreBtn?.addEventListener(
  "click",
  () => {
    showAll = !showAll;
    renderFeed();
  }
);

init();
