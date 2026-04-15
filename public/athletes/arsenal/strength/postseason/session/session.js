const params = new URLSearchParams(window.location.search);

const athleteId = (params.get("id") || "").trim().toUpperCase();
const segment = (params.get("segment") || "segment1").trim().toLowerCase();
const sessionNumber = parseInt(params.get("n") || "1", 10);

const SESSION_JSON_URL = `/vault/strength/${segment}/sessions.json`;

async function loadStrengthSession() {
  const shell = document.getElementById("session-shell");
  if (!shell) return;

  try {
    const res = await fetch(SESSION_JSON_URL, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Failed to load strength session JSON: ${res.status}`);
    }

    const data = await res.json();
    renderStrengthSession(shell, data);
  } catch (err) {
    console.error("Strength session load failed:", err);

    shell.innerHTML = `
      <div class="lane-name">Strength Session</div>
      <p class="lane-desc">Could not load session content.</p>
    `;
  }
}

function getSegmentUI(segmentId) {
  if (segmentId === "segment1") {
    return {
      title: "Postseason · Foundation",
      focus: "Build the base"
    };
  }

  if (segmentId === "segment2") {
    return {
      title: "Postseason · Capacity",
      focus: "Maintain output"
    };
  }

  if (segmentId === "segment3") {
    return {
      title: "Postseason · Performance",
      focus: "Execute sharply"
    };
  }

  return {
    title: "Postseason",
    focus: ""
  };
}

function buildWorkoutHtml(normalized, isBaseline) {
  if (!Array.isArray(normalized.workout) || !normalized.workout.length) {
    return "";
  }

  if (isBaseline) {
    return `
      <div class="section-block">
        <h2 class="section-title">Baseline Test</h2>
        <ul class="focus-list">
          ${normalized.workout.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  if (normalized.type === "explosive") {
    return `
      <div class="section-block">
        <h2 class="section-title">Explosive Work</h2>
        <ul class="focus-list">
          ${normalized.workout.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
        <p class="lane-desc">Focus on speed, intent, and clean mechanics.</p>
      </div>
    `;
  }

  if (normalized.type === "iron") {
    return `
      <div class="section-block">
        <h2 class="section-title">Iron Work</h2>
        <ul class="focus-list">
          ${normalized.workout.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  if (normalized.type === "remote_hiit") {
    return `
      <div class="section-block">
        <h2 class="section-title">HIIT Work</h2>
        <ul class="focus-list">
          ${normalized.workout.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  if (normalized.type === "performance") {
    return `
      <div class="section-block">
        <h2 class="section-title">Performance Work</h2>
        <ul class="focus-list">
          ${normalized.workout.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  return `
    <div class="section-block">
      <h2 class="section-title">Workout</h2>
      <ul class="focus-list">
        ${normalized.workout.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function buildRemoteHtml(normalized, isBaseline) {
  if (isBaseline) {
    return `
      <div class="section-block">
        <h2 class="section-title">Remote Option</h2>
        <p class="lane-desc">Training away from the room? Use the remote strength version here.</p>
        <a
          class="primary-btn"
          href="/athletes/arsenal/strength/postseason/remote.html?id=${encodeURIComponent(athleteId)}&segment=${encodeURIComponent(segment)}&n=${encodeURIComponent(String(normalized.n || sessionNumber))}"
        >
          Open Remote Strength
        </a>
      </div>
    `;
  }

  return `
    <div class="section-block">
      <details class="remote-accordion">
        <summary style="cursor:pointer;font-weight:800;">Remote Strength (Optional)</summary>
        <div style="margin-top:12px;">
          <p class="lane-desc">Training away from the room? Use the remote strength version here.</p>
          <a
            class="primary-btn"
            href="/athletes/arsenal/strength/postseason/remote.html?id=${encodeURIComponent(athleteId)}&segment=${encodeURIComponent(segment)}&n=${encodeURIComponent(String(normalized.n || sessionNumber))}"
          >
            Open Remote Strength
          </a>
        </div>
      </details>
    </div>
  `;
}

function renderStrengthSession(shell, data) {
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const session =
    sessions.find((x) => Number(x.n) === sessionNumber) ||
    sessions[0] ||
    null;

  if (!session) {
    shell.innerHTML = `
      <div class="lane-name">Strength Session</div>
      <p class="lane-desc">No session data found.</p>
    `;
    return;
  }

  const normalized = {
    n: sessionNumber,
    id: "",
    block: "",
    type: "",
    title: "",
    prompt: "",
    deliverable: "",
    coachNote: "",
    workout: [],
    track: {},
    athleteNote: false,
    ...session
  };

  const isBaseline =
    normalized.type === "baseline_test" ||
    normalized.type === "baseline_retest" ||
    Number(normalized.n) === 1 ||
    Number(normalized.n) === 40;

  const segmentUI = getSegmentUI(segment);
  const workoutHtml = buildWorkoutHtml(normalized, isBaseline);
  const remoteHtml = buildRemoteHtml(normalized, isBaseline);

  shell.innerHTML = `
    <div class="segment-header" style="margin-bottom:14px;padding:12px 14px;border:1px solid #2b3f6a;border-radius:14px;background:#0d1a35;">
      <div class="segment-title" style="font-weight:900;font-size:1rem;">${escapeHtml(segmentUI.title)}</div>
      ${
        segmentUI.focus
          ? `<div class="segment-focus" style="margin-top:4px;font-size:.92rem;opacity:.85;">FOCUS: ${escapeHtml(segmentUI.focus)}</div>`
          : ""
      }
    </div>

    <div class="lane-meta">
      Session ${escapeHtml(String(normalized.n || sessionNumber))}
      ${normalized.type ? ` • Type: ${escapeHtml(normalized.type)}` : ""}
    </div>

    <div class="lane-name">${escapeHtml(normalized.title || "Strength Session")}</div>

    ${
      normalized.prompt
        ? `
          <div class="section-block">
            <p class="lane-desc" style="white-space:pre-line;">${escapeHtml(normalized.prompt)}</p>
          </div>
        `
        : ""
    }

    ${workoutHtml}

    ${
      normalized.deliverable
        ? `
          <div class="section-block">
            <h2 class="section-title">Deliverable</h2>
            <p class="lane-desc" style="white-space:pre-line;">${escapeHtml(normalized.deliverable)}</p>
          </div>
        `
        : ""
    }

    ${
      normalized.coachNote
        ? `
          <div class="section-block">
            <h2 class="section-title">Coach Note</h2>
            <p class="lane-desc" style="white-space:pre-line;">${escapeHtml(normalized.coachNote)}</p>
          </div>
        `
        : ""
    }

    ${
      normalized.athleteNote
        ? `
          <div class="section-block">
            <textarea
              id="strength-response"
              placeholder="Write your response here..."
              style="width:100%;min-height:140px;padding:.85rem;border-radius:12px;border:1px solid #2b3f6a;background:#0b1730;color:#f5f7fb;"
            ></textarea>

            <div style="margin-top:12px;">
              <button
                id="strength-submit"
                class="primary-btn"
                type="button"
              >
                Submit
              </button>
            </div>

            <div
              id="strength-status"
              style="margin-top:10px;font-size:.95rem;opacity:.85;"
            ></div>
          </div>
        `
        : ""
    }

    ${remoteHtml}

    <div class="action-block">
      <a
        class="back-btn"
        href="/athletes/arsenal/strength/postseason.html?id=${encodeURIComponent(athleteId)}"
      >
        Back
      </a>
    </div>
  `;

  const submitBtn = document.getElementById("strength-submit");
  const responseEl = document.getElementById("strength-response");
  const statusEl = document.getElementById("strength-status");

  if (submitBtn && responseEl && statusEl) {
    submitBtn.addEventListener("click", async () => {
      const body = responseEl.value.trim();

      if (!body) {
        statusEl.textContent = "Response required.";
        return;
      }

      submitBtn.disabled = true;
      statusEl.textContent = "Submitted. Awaiting coach review.";
      submitBtn.textContent = "Submitted";

      // keep your existing save logic here if already wired
    });
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

loadStrengthSession();