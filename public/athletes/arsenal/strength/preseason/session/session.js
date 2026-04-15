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

function getSegmentFocus(segmentId) {
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

function renderStrengthSession(shell, data) {
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const session = sessions.find(x => Number(x.n) === sessionNumber) || sessions[0] || null;
  const segmentUI = getSegmentFocus(segment);
  // 🔥 ADD THIS HERE
  const isBaseline = sessionNumber === 1 || sessionNumber === 40;
  shell.dataset.baseline = isBaseline ? "true" : "false";

  if (!session) {
    shell.innerHTML = `
      <div class="lane-name">Strength Session</div>
      <p class="lane-desc">No session data found.</p>
    `;
    return;
  }

  const trackHtml = renderTrack(session.track);
  const workoutHtml = renderWorkoutSource(session);

  shell.innerHTML = `
    <div class="segment-header" style="margin-bottom:14px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03);">
      <div class="segment-title" style="font-weight:900;font-size:1rem;">${escapeHtml(segmentUI.title)}</div>
      <div class="segment-focus" style="opacity:.78;font-size:.9rem;margin-top:4px;">
        ${segmentUI.focus ? `FOCUS: ${escapeHtml(segmentUI.focus)}` : ""}
      </div>
    </div>

    <div class="lane-name">${escapeHtml(session.title || `Session ${sessionNumber}`)}</div>

    ${
      session.prompt
        ? `<div class="section-block">
             <h2 class="section-title">Prompt</h2>
             <p class="lane-desc">${escapeHtml(session.prompt)}</p>
           </div>`
        : ""
    }

    ${workoutHtml}

    ${trackHtml}

    ${
      session.athleteNote
        ? `<div class="section-block">
             <h2 class="section-title">Athlete Note</h2>
             <textarea
               placeholder="Today notes... Elbow was bugging. Felt strong. Gassed round 3..."
               style="width:100%;min-height:100px;border-radius:12px;padding:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;"
             ></textarea>
           </div>`
        : ""
    }

    ${
      session.coachNote
        ? `<div class="section-block">
             <h2 class="section-title">Coach Note</h2>
             <p class="lane-desc">${escapeHtml(session.coachNote)}</p>
           </div>`
        : ""
    }

    <div class="action-block">
      <a class="primary-btn"
         data-athlete-link="/athletes/arsenal/strength/postseason.html">
         Return to Postseason
      </a>
    </div>
  `;

  document.querySelectorAll("[data-athlete-link]").forEach((link) => {
    const base = link.getAttribute("data-athlete-link");
    if (!base) return;
    link.href = athleteId
      ? `${base}?id=${encodeURIComponent(athleteId)}`
      : base;
  });
}

function renderWorkoutSource(session) {
  const source = session?.source || "";
  const preset = session?.preset || "";

  return `
    <div class="section-block">
      <h2 class="section-title">Workout</h2>
      <p class="lane-desc">
        ${source ? `Source: ${escapeHtml(source)}` : "Workout source not set."}
        ${preset ? `<br>Preset: ${escapeHtml(preset)}` : ""}
      </p>
    </div>
  `;
}

function renderTrack(track) {
  if (!track || typeof track !== "object") return "";

  const [trackType, config] = Object.entries(track)[0] || [];
  const fields = Array.isArray(config?.fields) ? config.fields : [];

  if (!trackType || !fields.length) return "";

  return `
    <div class="section-block">
      <h2 class="section-title">Track</h2>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
            ${fields.map(f => {
  const label = typeof f === "string" ? labelize(f) : f.label;

  return `
    <th style="text-align:left;padding:10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:.92rem;">
      ${escapeHtml(label)}
    </th>
  `;
}).join("")}

            </tr>
          </thead>
          <tbody>
            <tr>
            ${fields.map(f => {
  const key = typeof f === "string" ? f : f.key;
  const label = typeof f === "string" ? labelize(f) : f.label;
  const placeholder = typeof f === "string"
    ? label
    : (f.placeholder || label);

  return `
    <td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);">
      <input
        type="text"
        data-field="${escapeHtml(key)}"
        placeholder="${escapeHtml(placeholder)}"
        style="width:100%;border-radius:10px;padding:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;"
      />
    </td>
  `;
}).join("")}

            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function labelize(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
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