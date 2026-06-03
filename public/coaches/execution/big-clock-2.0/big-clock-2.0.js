import {
  db,
  ensureSignedIn,
  doc,
  setDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

const STATE_KEY = "sandman_run_state";
const PAYLOAD_KEY = "sandman_big_clock_payload_v2";
const TV_SCALE_KEY = "sandman_tv_scale";

let authReady = false;

ensureSignedIn()
  .then(() => {
    authReady = true;
  })
  .catch(err => {
    console.warn("Big Clock auth warning:", err);
  });

const savedScale =
  Number(localStorage.getItem(TV_SCALE_KEY) || 1);

document.documentElement.style.setProperty(
  "--tv-scale",
  savedScale
);

function format(totalSeconds = 0) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

async function setState(state) {

  localStorage.setItem(
    STATE_KEY,
    JSON.stringify(state)
  );

  try {
     if (!authReady) return;

    const session =
      getSessionPayload();

    const sessionId =
      session.sessionId || "lompoc-mat-1";

    await setDoc(
      doc(db, "liveSessions", sessionId),
      {
        runState: {
          running: state.running || false,
          paused: state.paused || false,
          complete: state.complete || false,

          index: state.index || 0,

          blockStartedAt:
            state.blockStartedAt || null,

          blockDuration:
            state.blockDuration || 0,

          updatedAt:
            serverTimestamp()
        }
      },
      { merge: true }
    );

  } catch (err) {

    console.warn(
      "runState sync failed:",
      err
    );

  }

}

function getPayload() {
  try {
    return JSON.parse(localStorage.getItem(PAYLOAD_KEY) || "{}");
  } catch {
    return {};
  }
}

function getSessionPayload() {
  try {
    return JSON.parse(
      localStorage.getItem("sandman_session_builder_v1") || "{}"
    );
  } catch {
    return {};
  }
}

function startFromPayload() {

  const payload = getPayload();

  const blocks = Array.isArray(payload.blocks)
    ? payload.blocks
    : [];

  if (!blocks.length) return;

  const playlist = blocks
    .map(b => ({
      title: b.title || b.slot || "Block",
      minutes: Number(b.minutes || 0),
      cards: Array.isArray(b.cards) ? b.cards : [],
      notes: b.notes || ""
    }))
    .filter(b => b.minutes > 0);

  if (!playlist.length) return;

  setState({
    running: true,
    paused: false,
    complete: false,
    index: 0,
    playlist,
    blockStartedAt: Date.now(),
    blockDuration: playlist[0].minutes * 60,
    updatedAt: Date.now()
  });

}

function renderComplete({
  statusEl,
  blockEl,
  clockEl,
  nextEl,
  cuesEl
}) {
  if (statusEl) {
    statusEl.textContent = "COMPLETE";
    statusEl.className = "status complete";
  }

  if (blockEl) {
    blockEl.innerHTML = `
      <span class="sandman-title">SANDMAN COMBAT</span>
      <span class="sandman-tag">Built In The Shadows</span>
    `;
  }

  if (cuesEl) {
    cuesEl.innerHTML = "";
  }

  if (clockEl) {
    clockEl.textContent = "00:00";
  }

  if (nextEl) {
    nextEl.textContent = "Practice Complete";
  }

  document
    .getElementById("sessionEndActions")
    ?.classList.remove("hidden");
}

function render() {
  const data = getState();

  const statusEl = document.getElementById("status");
  const blockEl = document.getElementById("block");
  const clockEl = document.getElementById("clock");
  const nextEl = document.getElementById("next");
  const cuesEl = document.getElementById("cues");

  if (data.complete) {
    renderComplete({
      statusEl,
      blockEl,
      clockEl,
      nextEl,
      cuesEl
    });

    return;
  }

  const playlist = Array.isArray(data.playlist)
    ? data.playlist
    : [];

  const current = playlist[data.index] || null;
  const next = playlist[(data.index || 0) + 1] || null;

  const status =
    data.paused
      ? "paused"
      : data.running
      ? "running"
      : "stopped";

  if (statusEl) {
    statusEl.textContent = status.toUpperCase();
    statusEl.className = `status ${status}`;
  }

  if (blockEl) {
    blockEl.textContent =
      current?.title || "No active block";
  }

  const now = Date.now();

  const elapsed = Math.floor(
    (now - (data.blockStartedAt || now)) / 1000
  );

  const remaining = Math.max(
    0,
    (data.blockDuration || 0) - elapsed
  );

  if (clockEl) {
    clockEl.textContent = format(remaining);
  }

  if (remaining <= 0 && data.running) {
    const nextIndex = Number(data.index || 0) + 1;
    const nextBlock = playlist[nextIndex];

    if (nextBlock) {
      setState({
        ...data,
        index: nextIndex,
        blockStartedAt: Date.now(),
        blockDuration:
          Number(nextBlock.minutes || 0) * 60,
        updatedAt: Date.now()
      });
    } else {
      setState({
        ...data,
        running: false,
        paused: false,
        complete: true,
        updatedAt: Date.now()
      });
    }

    return;
  }

  const cues = Array.isArray(current?.cards)
    ? current.cards
    : [];

  if (cuesEl) {
    cuesEl.innerHTML = cues.length
      ? cues
          .map(c => {
            const label =
              typeof c === "string"
                ? c
                : c.title || "";

            return `
              <div class="cue-item">
                ${label}
              </div>
            `;
          })
          .join("")
      : "";
  }

  if (nextEl) {
    nextEl.textContent = next
      ? `Next: ${next.title} • ${String(next.minutes).padStart(2, "0")}:00`
      : "Next: —";
  }
}

const readyScreen =
  document.getElementById("readyScreen");

/* =========================
   READY SCREEN LAUNCH
========================= */

window.startPracticeNow = function () {
  document
    .getElementById("sessionEndActions")
    ?.classList.add("hidden");

  startFromPayload();

  readyScreen?.classList.add("hidden");
};

window.showBigClockQr = function () {
  const session = getSessionPayload();
  const sessionId = session.sessionId || "lompoc-mat-1";

  const url =
    `${window.location.origin}/coaches/execution/big-clock-2.0/?session=${encodeURIComponent(sessionId)}`;

  showQrPanel(url, "Scan To Open Big Clock");
};

window.showCompanionQr = function () {
  const session = getSessionPayload();
  const sessionId = session.sessionId || "lompoc-mat-1";

  const url =
    `${window.location.origin}/coaches/execution/coach-companion/?session=${encodeURIComponent(sessionId)}`;

  showQrPanel(url, "Scan To Open Coach Companion");
};

function showQrPanel(url, title = "Scan QR") {

  const qrPanel =
    document.getElementById("qrPanel");

  const qrImage =
    document.getElementById("qrImage");

  const qrTitle =
    document.getElementById("qrTitle");

  const alreadyOpen =
    qrPanel?.classList.contains("active");

  const currentSrc =
    qrImage?.dataset.url || "";

  if (alreadyOpen && currentSrc === url) {
    qrPanel.classList.remove("active");
    qrPanel.classList.add("hidden");

    qrImage.removeAttribute("src");
    qrImage.dataset.url = "";

    return;
  }

  if (qrTitle) {
    qrTitle.textContent = title;
  }

  if (qrImage) {

    qrImage.src =
      `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;

    qrImage.dataset.url = url;
  }

  qrPanel?.classList.remove("hidden");
  qrPanel?.classList.add("active");
}
render();

setInterval(render, 250);

window.addEventListener("storage", e => {
  if (e.key === STATE_KEY) {
    render();
  }
});