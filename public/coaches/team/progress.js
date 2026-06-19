import {
  db,
  ensureSignedIn,
  doc,
  setDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

await ensureSignedIn();

const laneSelect = document.getElementById("laneSelect");
const typeSelect = document.getElementById("typeSelect");
const audienceSelect = document.getElementById("audienceSelect");
const audienceValue = document.getElementById("audienceValue");
const titleInput = document.getElementById("titleInput");
const detailsInput = document.getElementById("detailsInput");
const xpHintInput = document.getElementById("xpHintInput");

const templateBtn = document.getElementById("templateBtn");
const previewBtn = document.getElementById("previewBtn");
const pushBtn = document.getElementById("pushBtn");

const previewBox = document.getElementById("previewBox");
const statusEl = document.getElementById("status");
const recentList = document.getElementById("recentList");

const RECENT_KEY = "sandman_team_progress_recent_v1";

function setStatus(msg = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#fecaca" : "#ffdd48";
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getTemplate(lane, type) {
  const key = `${lane}:${type}`;

  const templates = {
    "combat:challenge": {
      title: "Combat Challenge",
      details: "Win one hard position today. Start with focus. Finish with effort.",
      xpHint: "Coach may award Combat XP through normal Daily Grind or Arena tools."
    },

    "strength:challenge": {
      title: "Strength Challenge",
      details: "Complete two strength sessions this week. Quality work. No shortcuts.",
      xpHint: "Coach may award Strength +5 after proof."
    },

    "honor:challenge": {
      title: "Honor Challenge",
      details: "Help one teammate this week without being asked. Lead quietly.",
      xpHint: "Coach may award Honor +5 after proof."
    },

    "arena:challenge": {
      title: "Arena Challenge",
      details: "Compete with courage. Score first points or win the next hard exchange.",
      xpHint: "Arena XP is awarded through Weekend Arena or Duel Arena."
    },

    "attendance:challenge": {
      title: "Daily Grind Challenge",
      details: "Make your practices this week. Show up ready. Stack the work.",
      xpHint: "Attendance XP is awarded through Daily Grind."
    },

    "culture:challenge": {
      title: "Culture Challenge",
      details: "Live F.E.A.R. this week: Focus, Effort, Attitude, Respect.",
      xpHint: "Coach may award Honor XP if the standard is met."
    },

    "combat:mission": {
      title: "Combat Mission",
      details: "Today’s mission: attack first, recover fast, finish every rep.",
      xpHint: "Mission creates focus. XP is earned separately."
    },

    "strength:mission": {
      title: "Strength Mission",
      details: "Build the body that supports the fight. Controlled reps. Clean effort.",
      xpHint: "Coach may award Strength XP after completion."
    },

    "honor:mission": {
      title: "Honor Mission",
      details: "Be the teammate people trust. Respect the room. Respect the work.",
      xpHint: "Coach may award Honor XP after observed action."
    },

    "arena:focus_point": {
      title: "Arena Focus",
      details: "Focus point: win the first exchange and keep wrestling through the whistle.",
      xpHint: "Arena XP is awarded after competition."
    },

    "combat:focus_point": {
      title: "Combat Focus Point",
      details: "Focus point: hand fight first, move your feet, finish clean.",
      xpHint: "No automatic XP. Coach judges the work."
    },

    "honor:agreement": {
      title: "Agreement Challenge",
      details: "Make an agreement with yourself: no excuses, no shortcuts, finish the week.",
      xpHint: "Coach may award Honor XP if the agreement is kept."
    },

    "arena:regional": {
      title: "Regional Challenge",
      details: "Regional focus: compete like the room travels with you. Represent the standard.",
      xpHint: "Arena XP is awarded through the correct Arena tool."
    }
  };

  return templates[key] || {
    title: `${capitalize(lane)} ${toTitle(type)}`,
    details: "Coach-defined focus for the athlete or team.",
    xpHint: "Challenge creates focus. XP is earned separately."
  };
}

function capitalize(value = "") {
  const s = String(value || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toTitle(value = "") {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getPayload() {
  const lane = laneSelect?.value || "combat";
  const type = typeSelect?.value || "challenge";
  const audienceType = audienceSelect?.value || "team";

  return {
    lane,
    type,
    title: (titleInput?.value || "").trim(),
    details: (detailsInput?.value || "").trim(),
    xpHint: (xpHintInput?.value || "").trim(),
    audienceType,
    audienceValue: (audienceValue?.value || "").trim(),
    status: "active",
    source: "coach-team-progress",
  };
}

function validatePayload(payload) {
  if (!payload.title) {
    throw new Error("Title is required.");
  }

  if (!payload.details) {
    throw new Error("Details are required.");
  }

  if (
    (payload.audienceType === "group" ||
     payload.audienceType === "athlete") &&
    !payload.audienceValue
  ) {
    throw new Error("Group / Athlete ID is required for this audience.");
  }
}

function renderPreview(payload) {
  if (!previewBox) return;

  previewBox.style.display = "block";

  previewBox.innerHTML = `
    <div class="preview-title">
      ${escapeHTML(payload.title)}
    </div>

    <div class="preview-meta">
      ${escapeHTML(toTitle(payload.lane))}
      · ${escapeHTML(toTitle(payload.type))}
      · Audience: ${escapeHTML(payload.audienceType)}
      ${payload.audienceValue ? ` · ${escapeHTML(payload.audienceValue)}` : ""}
    </div>

    <div>
      ${escapeHTML(payload.details)}
    </div>

    ${payload.xpHint ? `
      <div class="preview-meta" style="margin-top:10px;">
        ${escapeHTML(payload.xpHint)}
      </div>
    ` : ""}
  `;
}

function getRecent() {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecent(item) {
  const recent = getRecent();

  recent.unshift({
    ...item,
    savedAt: new Date().toISOString()
  });

  localStorage.setItem(
    RECENT_KEY,
    JSON.stringify(recent.slice(0, 8))
  );

  renderRecent();
}

function renderRecent() {
  if (!recentList) return;

  const recent = getRecent();

  if (!recent.length) {
    recentList.innerHTML =
      `<div class="recent-card">No challenges pushed yet.</div>`;
    return;
  }

  recentList.innerHTML = recent.map(item => `
    <div class="recent-card">
      <strong>${escapeHTML(item.title)}</strong>
      <div style="color:#9ca3af;font-size:.88rem;margin-top:4px;">
        ${escapeHTML(toTitle(item.lane))}
        · ${escapeHTML(toTitle(item.type))}
        · ${escapeHTML(item.audienceType)}
      </div>
      <div style="margin-top:6px;">
        ${escapeHTML(item.details)}
      </div>
    </div>
  `).join("");
}

templateBtn?.addEventListener("click", () => {
  const lane = laneSelect?.value || "combat";
  const type = typeSelect?.value || "challenge";
  const template = getTemplate(lane, type);

  titleInput.value = template.title;
  detailsInput.value = template.details;
  xpHintInput.value = template.xpHint;

  setStatus("Template loaded.");
});

previewBtn?.addEventListener("click", () => {
  try {
    const payload = getPayload();
    validatePayload(payload);
    renderPreview(payload);
    setStatus("Preview ready.");
  } catch (err) {
    setStatus(err.message || "Preview failed.", true);
  }
});

pushBtn?.addEventListener("click", async () => {
  const oldText = pushBtn.textContent;

  try {
    const payload = getPayload();
    validatePayload(payload);

    pushBtn.disabled = true;
    pushBtn.textContent = "Pushing...";
    setStatus("Saving challenge...");

    const id =
      `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await setDoc(
      doc(db, "trainingChallenges", id),
      {
        ...payload,
        id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    renderPreview(payload);
    saveRecent(payload);

    setStatus("Challenge pushed.");
  } catch (err) {
    console.error("[team-progress] push failed:", err);
    setStatus(err.message || "Push failed.", true);
  } finally {
    pushBtn.disabled = false;
    pushBtn.textContent = oldText;
  }
});

renderRecent();