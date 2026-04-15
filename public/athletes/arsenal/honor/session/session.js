const params = new URLSearchParams(window.location.search);

const athleteId = (params.get("id") || "").trim().toUpperCase();
const segment = (params.get("segment") || "segment1").trim().toLowerCase();
const sessionNumber = parseInt(params.get("n") || "1", 10);

const SESSION_JSON_URL = `/vault/honor/${segment}/sessions.json`;

async function loadHonorSession() {
  const shell = document.getElementById("session-shell");
  if (!shell) return;

  try {
    const res = await fetch(SESSION_JSON_URL, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Failed to load honor session JSON: ${res.status}`);
    }

    const data = await res.json();
    renderHonorSession(shell, data);
  } catch (err) {
    console.error("Honor session load failed:", err);

    shell.innerHTML = `
      <div class="lane-name">Honor Session</div>
      <p class="lane-desc">Could not load session content.</p>
    `;
  }
}

function renderHonorSession(shell, data) {
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const s = sessions.find(x => x.n === sessionNumber) || sessions[0] || null;

  console.log("SESSION OBJECT:", s);

  if (!s) {
    shell.innerHTML = `
      <div class="lane-name">Honor Session</div>
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
    focusArea: "",
    principle: "",
    houseStandard: "",
    prompt: "",
    deliverable: "",
    scripture: "",
    coachNote: "",
    ...s
  };

  shell.innerHTML = `
    <div class="lane-meta">
      Session ${escapeHtml(String(normalized.n || sessionNumber))}
      • Block ${escapeHtml(String(normalized.block || "—"))}
      ${normalized.id ? `• ${escapeHtml(normalized.id)}` : ""}
    </div>

    <div class="lane-name">${escapeHtml(normalized.title || "Honor Session")}</div>

    ${normalized.type ? `
      <div class="lane-type">
        ${escapeHtml(normalized.type.replaceAll("_", " "))}
      </div>
    ` : ""}

    ${renderTextBlock("Focus Area", normalized.focusArea)}
    ${renderTextBlock("Principle", normalized.principle)}
    ${renderTextBlock("House Standard", normalized.houseStandard)}
    ${renderTextBlock("Prompt", normalized.prompt)}
    ${renderTextBlock("Deliverable", normalized.deliverable)}
    ${renderTextBlock("Scripture", normalized.scripture)}
    ${renderTextBlock("Coach Note", normalized.coachNote)}

    <div class="action-block">
      <a class="primary-btn"
         data-athlete-link="/athletes/arsenal/honor/self.html">
         Return to Self
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

function renderTextBlock(title, value) {
  value = value || "—";

  return `
    <div class="section-block">
      <h2 class="section-title">${title}</h2>
      <p class="lane-desc preline">${escapeHtml(value)}</p>
    </div>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

loadHonorSession();