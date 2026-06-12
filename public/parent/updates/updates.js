import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const updatesList =
  document.getElementById("updates-list");

const unreadCountEl =
  document.getElementById("unread-count");

const getParentInboxCall =
  httpsCallable(functions, "getParentInbox");

const markParentInboxReadCall =
  httpsCallable(functions, "markParentInboxRead");

function renderMessage(item) {
  const created =
    item.createdAt
      ? new Date(item.createdAt).toLocaleString()
      : "—";

  const isUnread =
    item.read !== true;

  return `
    <article
      class="card parent-update-card ${isUnread ? "unread" : ""}"
      style="margin-top:12px;"
      data-message-id="${item.id}"
    >
      <div class="eyebrow">
        ${item.type || "UPDATE"}
        ${isUnread ? `<span class="unread-pill">NEW</span>` : ""}
      </div>

      <h3>
        ${item.title || "Update"}
      </h3>

      <p>
        ${item.message || ""}
      </p>

      <small>
        ${created}
      </small>

      ${
        isUnread
          ? `
            <button
              class="btn mark-read-btn"
              type="button"
              data-message-id="${item.id}"
              style="margin-top:12px;"
            >
              Mark Read
            </button>
          `
          : ""
      }
    </article>
  `;
}

function renderUnreadCount(count) {
  if (!unreadCountEl) return;

  if (count > 0) {
    unreadCountEl.hidden = false;
    unreadCountEl.textContent =
      `${count} unread`;
  } else {
    unreadCountEl.hidden = true;
    unreadCountEl.textContent = "";
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
    alert("Unable to mark update as read.");
  }
}

async function init() {
  try {
    const result =
      await getParentInboxCall();

    const items =
      result.data?.items || [];

    const unreadCount =
      result.data?.unreadCount || 0;

    renderUnreadCount(unreadCount);

    if (!items.length) {
      updatesList.innerHTML =
        "<p>No updates available.</p>";
      return;
    }

    updatesList.innerHTML =
      items.map(renderMessage).join("");

    document
      .querySelectorAll(".mark-read-btn")
      .forEach((button) => {
        button.addEventListener("click", () => {
          markRead(button.dataset.messageId);
        });
      });
  } catch (err) {
    console.error(err);

    updatesList.innerHTML =
      "<p>Unable to load updates.</p>";
  }
}

init();