import {
  functions,
  httpsCallable
} from "/assets/js/firebase-init.js";

const list = document.getElementById("testing-history-list");

const getTestingHistoryCall =
  httpsCallable(functions, "getTestingHistory");

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(value);
}

function eventLabel(type) {
  switch (type) {
    case "TEST_SCHEDULED": return "Testing Scheduled";
    case "TEST_STARTED": return "Testing Started";
    case "TEST_FAILED": return "Additional Preparation Required";
    case "PROMOTED": return "Promotion Earned";
    case "TEST_PASSED": return "Testing Passed";
    default: return type || "Testing Event";
  }
}

function renderEvent(event) {
  const name = event.publicName || event.athleteName || event.uid || "Athlete";
  const type = eventLabel(event.type);
  const created = formatDate(event.createdAt);

  const score =
    event.score === null || event.score === undefined
      ? ""
      : `<p><strong>Score:</strong> ${event.score}</p>`;

  const tierLine =
    event.nextTier
      ? `<p><strong>Tier:</strong> ${event.tier || "—"} → ${event.nextTier}</p>`
      : event.tier
        ? `<p><strong>Tier:</strong> ${event.tier}</p>`
        : "";

  const scheduled =
    event.scheduledDate
      ? `<p><strong>Scheduled:</strong> ${event.scheduledDate}</p>`
      : "";

  return `
    <article class="output-card" style="margin-top:12px;">
      <p class="range-label">${type}</p>
      <h3>${name}</h3>
      <p><strong>UID:</strong> ${event.uid || "—"}</p>
      ${tierLine}
      ${scheduled}
      ${score}
      <p><strong>Created:</strong> ${created}</p>
    </article>
  `;
}

async function init() {
  try {
    const result = await getTestingHistoryCall();
    const events = result.data?.events || [];

    if (!events.length) {
      list.innerHTML = "<p>No testing events yet.</p>";
      return;
    }

    list.innerHTML = events
      .map(renderEvent)
      .join("");
  } catch (err) {
    console.error(err);
    list.innerHTML = "<p>Could not load testing history.</p>";
  }
}

init();