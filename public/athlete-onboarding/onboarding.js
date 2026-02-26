import {
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  ensureSignedIn
} from "../assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

// --------------------------------
// URL PARAMS
// --------------------------------
const params = new URLSearchParams(location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();

if (!uid) {
  alert("Missing ?id= in URL");
  throw new Error("Missing ?id=");
}

// --------------------------------
// DOM
// --------------------------------
const splashPanel = $("panel-splash");
const verifyPanel = $("panel-verify");
const startBtn    = $("btn-start");

const statusEl = $("token-status");
const cardEl   = $("name-card");
const virtueEl = $("virtue-output");
const nameEl   = $("athlete-name");

const btnYes   = $("btn-verify");
const btnNo    = $("btn-not-me");

let athlete = null;

// --------------------------------
// HELPERS
// --------------------------------
const setStatus = (t) => {
  if (statusEl) statusEl.textContent = t || "";
};

const disableButtons = (d) => {
  if (btnYes) btnYes.disabled = d;
  if (btnNo) btnNo.disabled = d;
};

function text(id, value) {
  const el = $(id);
  if (el) el.textContent = (value ?? "—");
}

function pickTeamName(a) {
  return a.team?.name || a.teamName || a.team || "—";
}

function pickCity(a) {
  return a.team?.city || a.city || "—";
}

function pickState(a) {
  return a.team?.state || a.state || "—";
}

// --------------------------------
// LOAD ATHLETE
// --------------------------------
async function loadAthlete() {
  setStatus("Loading…");
  disableButtons(true);

  // 🔐 REQUIRED FOR PHONE (auth)
  await ensureSignedIn();

  const snap = await getDoc(doc(db, "athletes", uid));

  if (!snap.exists()) {
    setStatus("Athlete not found.");
    disableButtons(true);
    return;
  }

  athlete = snap.data() || {};

  const displayName = athlete.fullName || athlete.publicName || uid;

  const mintTag =
    athlete.mintVirtueTagDisplay ||
    athlete.mintVirtueTag ||
    athlete.uidCode ||
    athlete.uid ||
    "—";

  if (nameEl) nameEl.textContent = displayName;
  if (virtueEl) virtueEl.textContent = mintTag;

  // Identity (read-only)
  text("mini-uid", uid);
  text("mini-track", athlete.trackCode || athlete.track || athlete.foundry || "—");
  text("mini-tier", athlete.tier || "—");

  const team  = pickTeamName(athlete);
  const city  = pickCity(athlete);
  const state = pickState(athlete);

  text("mini-team", team);

  const cityState =
    (city && state && city !== "—" && state !== "—")
      ? `${city}, ${state}`
      : (city !== "—" ? city : (state !== "—" ? state : "—"));

  text("mini-citystate", cityState);

  if (cardEl) cardEl.classList.remove("hidden");

  setStatus("Is this you?");
  disableButtons(false);
}

// --------------------------------
// CONFIRM IDENTITY
// --------------------------------
async function confirmIdentity() {
  if (!athlete) return;

  try {
    disableButtons(true);
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "started",
      "onboarding.step": 1,
      "onboarding.startedAt": serverTimestamp(),
      "onboarding.step1At": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    window.location.href =
      `/athlete-onboarding/step-2.html?id=${encodeURIComponent(uid)}`;

  } catch (e) {
    console.error(e);
    setStatus("Save failed. Check console.");
    disableButtons(false);
  }
}

// --------------------------------
// NOT ME
// --------------------------------
function notMe() {
  window.location.href = "/";
}

// --------------------------------
// BOOT
// --------------------------------
async function bootVerify() {
  try {
    await loadAthlete();
  } catch (e) {
    console.error(e);
    setStatus("Error loading profile.");
    disableButtons(true);
  }
}

// Splash flow support
if (startBtn && splashPanel && verifyPanel) {
  startBtn.addEventListener("click", () => {
    splashPanel.classList.add("hidden");
    verifyPanel.classList.remove("hidden");
    bootVerify();
  });
} else {
  bootVerify();
}

if (btnYes) btnYes.onclick = confirmIdentity;
if (btnNo)  btnNo.onclick  = notMe;
