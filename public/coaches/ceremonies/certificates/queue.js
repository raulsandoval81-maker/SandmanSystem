const ENGINE_ENDPOINTS = {
  progression:
    "https://us-central1-sandmandashboard.cloudfunctions.net/testProgressionEngine",

  certificatePayload:
    "https://us-central1-sandmandashboard.cloudfunctions.net/testCertificatePayloadEngine"
};

const fields = {
  athleteUid: document.getElementById("athleteUid")
};

const buttons = {
  check: document.getElementById("checkBtn")
};

const statusBox = document.getElementById("statusBox");

function renderStatus(html) {
  statusBox.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Engine returned failure.");
  }

  return data;
}

function openGenerator(uid) {
  const url =
    `./generator.html?uid=${encodeURIComponent(uid)}`;

  window.open(url, "_blank");
}

async function checkAthlete() {
  const uid = fields.athleteUid.value.trim();

  if (!uid) {
    renderStatus(`<p>Please enter an athlete UID.</p>`);
    return;
  }

  renderStatus(`<p>Checking ${escapeHtml(uid)}...</p>`);

  try {
    const progressionUrl =
      `${ENGINE_ENDPOINTS.progression}?uid=${encodeURIComponent(uid)}`;

    const payloadUrl =
      `${ENGINE_ENDPOINTS.certificatePayload}?uid=${encodeURIComponent(uid)}`;

    const [progressionData, payloadData] = await Promise.all([
      fetchJson(progressionUrl),
      fetchJson(payloadUrl)
    ]);

    const athlete = progressionData.athlete;
    const decision = progressionData.decision;
    const payload = payloadData.payload;

    const printReady = Boolean(payload?.printReady);

    renderStatus(`
      <div style="padding:16px;border:1px solid #ccc;border-radius:12px;background:#fff;">
        <h2>${escapeHtml(athlete.name)}</h2>

        <p><strong>UID:</strong> ${escapeHtml(athlete.uid)}</p>
        <p><strong>Program:</strong> ${escapeHtml(athlete.programName)}</p>
        <p><strong>Tier:</strong> ${escapeHtml(athlete.tierCode)} · ${escapeHtml(decision.stripeDecision.trainingShirt)}</p>
        <p><strong>Stripe:</strong> ${escapeHtml(athlete.stripe)}</p>
        <p><strong>XP:</strong> ${escapeHtml(athlete.xp)} / ${escapeHtml(decision.stripeDecision.threshold)}</p>

        <hr />

        <p><strong>Progression State:</strong> ${escapeHtml(decision.state)}</p>
        <p><strong>Next Action:</strong> ${escapeHtml(decision.nextAction)}</p>
        <p><strong>Coach Action:</strong> ${escapeHtml(decision.coachAction)}</p>

        <p><strong>Certificate:</strong> ${printReady ? "Ready to print" : "No certificate ready"}</p>

        ${
          printReady
            ? `<button onclick="openGenerator('${escapeHtml(uid)}')">Open Certificate Generator</button>`
            : ""
        }
      </div>
    `);

  } catch (err) {
    console.error(err);

    renderStatus(`
      <div style="padding:16px;border:1px solid #b00020;border-radius:12px;background:#fff;">
        <strong>Error:</strong> ${escapeHtml(err.message)}
      </div>
    `);
  }
}

buttons.check.addEventListener("click", checkAthlete);
fields.athleteUid.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkAthlete();
});