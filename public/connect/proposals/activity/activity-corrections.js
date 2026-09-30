import {
  db,
  collection,
  getDocs
} from "/assets/js/firebase-init.js";

const proposalId = String(
  new URLSearchParams(window.location.search)
    .get("proposalId") || ""
).trim();

const card =
  document.getElementById("activityCard");

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function millis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTimestamp(value) {
  const time = millis(value);
  if (!time) return "Time pending";
  return new Date(time).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function installCorrectionHistory() {
  if (!proposalId || !card) return;

  const history = await getDocs(
    collection(
      db,
      "proposals",
      proposalId,
      "history"
    )
  );

  const corrections = history.docs
    .map((item) => item.data() || {})
    .filter((item) =>
      String(item.reason || "").toUpperCase() ===
      "MANAGEMENT_CORRECTION"
    )
    .sort((a, b) =>
      millis(a.createdAt) - millis(b.createdAt)
    );

  if (!corrections.length) return;

  const render = () => {
    if (
      card.querySelector(
        "[data-correction-history]"
      )
    ) {
      return true;
    }

    if (
      card.querySelector(
        ".activity-empty"
      )
    ) {
      return false;
    }

    const section =
      document.createElement("section");

    section.className =
      "activity-phase";
    section.dataset.correctionHistory =
      "true";

    section.innerHTML = `
      <div class="activity-phase-head">
        <div>
          <h2>Corrections</h2>
          <p>Management corrections preserve the original history and explain why the proposal was reopened.</p>
        </div>
        <span class="activity-count">${corrections.length}</span>
      </div>
      <ol class="activity-list">
        ${corrections.map((item) => `
          <li class="activity-item">
            <span class="activity-dot" aria-hidden="true"></span>
            <div>
              <strong>Proposal Reopened for Correction</strong>
              <span>${esc(formatTimestamp(item.createdAt))}</span>
              <small>${esc(item.correctionReason || "Reason not recorded")}${item.createdByName ? ` · By ${esc(item.createdByName)}` : ""}</small>
            </div>
          </li>
        `).join("")}
      </ol>
    `;

    card.appendChild(section);
    return true;
  };

  if (render()) return;

  const observer =
    new MutationObserver(() => {
      if (render()) {
        observer.disconnect();
      }
    });

  observer.observe(
    card,
    {
      childList: true,
      subtree: true
    }
  );
}

installCorrectionHistory().catch((error) => {
  console.error(
    "Unable to render proposal correction history:",
    error
  );
});
