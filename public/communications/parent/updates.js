import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const updatesList =
  document.getElementById("updates-list");

const getParentInboxCall =
  httpsCallable(functions, "getParentInbox");

function renderMessage(item) {
  const created =
    item.createdAt
      ? new Date(item.createdAt).toLocaleString()
      : "—";

  return `
    <article class="card" style="margin-top:12px;">
      <div class="eyebrow">
        ${item.type || "UPDATE"}
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
    </article>
  `;
}

async function init() {
  try {
    const result =
      await getParentInboxCall();

    const items =
      result.data?.items || [];

    if (!items.length) {
      updatesList.innerHTML =
        "<p>No updates available.</p>";
      return;
    }

    updatesList.innerHTML =
      items.map(renderMessage).join("");
  } catch (err) {
    console.error(err);

    updatesList.innerHTML =
      "<p>Unable to load updates.</p>";
  }
}

init();