// /public/athlete-onboarding/onboarding.js
import {
  db,
  auth,                 // ✅ needed for magic link + user state
  functions,            // ✅ callable functions instance (must be exported by firebase-init.js)
  doc,
  getDoc,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

// ✅ import callable helper from Firebase SDK (NOT firebase-init.js)
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js";
// Firebase Auth helpers (CDN modular)
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);

/* -------------------------------- URL PARAMS -------------------------------- */
const params = new URLSearchParams(location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();
const tokenId = (params.get("token") || params.get("invite") || "").trim();

if (!uid) {
  alert("Missing ?id= in URL");
  throw new Error("Missing ?id=");
}

/* -------------------------------- DOM -------------------------------- */
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
let uiLocked = false;

/* -------------------------------- HELPERS -------------------------------- */
const setStatus = (t) => { if (statusEl) statusEl.textContent = t || ""; };

const disableButtons = (d) => {
  if (btnYes) btnYes.disabled = d;
  if (btnNo)  btnNo.disabled  = d;
};

function hardLockUI(message) {
  if (uiLocked) return;
  uiLocked = true;
  disableButtons(true);
  if (message) setStatus(message);
}

function unlockUI(message) {
  uiLocked = false;
  disableButtons(false);
  if (message) setStatus(message);
}

function text(id, value) {
  const el = $(id);
  if (el) el.textContent = (value ?? "—");
}

function pickTeamName(a) { return a.team?.name || a.teamName || a.team || "—"; }
function pickCity(a)     { return a.team?.city || a.city || "—"; }
function pickState(a)    { return a.team?.state || a.state || "—"; }

/* -------------------------------- MAGIC LINK (only after YES) -------------------------------- */
function onboardingReturnUrl() {
  // Return to the SAME page so we can auto-resume YES
  return `${location.origin}${location.pathname}?id=${encodeURIComponent(uid)}${tokenId ? `&token=${encodeURIComponent(tokenId)}` : ""}`;
}

async function startMagicLink(email) {
  const cleaned = String(email || "").trim().toLowerCase();
  if (!cleaned) throw new Error("Missing email.");

  // Save email so we can finish sign-in when the link returns
  localStorage.setItem("sandman_magic_email", cleaned);

  // Save intent so after login we resume YES automatically
  sessionStorage.setItem("sandman_pending_yes_uid", uid);

  const actionCodeSettings = {
    url: onboardingReturnUrl(),
    handleCodeInApp: true
  };

  console.log("[magiclink] SENDING", { cleaned, actionCodeSettings });

  await sendSignInLinkToEmail(auth, cleaned, actionCodeSettings);
  console.log("[magiclink] SENT OK");
  setStatus("Check your email to continue.");
}

async function finishMagicLinkIfPresent() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return false;

  const saved = localStorage.getItem("sandman_magic_email");
  const email = saved || window.prompt("Confirm your email to finish sign-in:");
  if (!email) throw new Error("Email required to finish sign-in.");

  await signInWithEmailLink(auth, email, window.location.href);

  // Force refresh token (helps some mobile cases)
  try { await auth.currentUser?.getIdToken?.(true); } catch {}

  localStorage.removeItem("sandman_magic_email");

  // Clean URL (strip oobCode params etc.) while preserving id/token
  history.replaceState({}, document.title, onboardingReturnUrl());

  return true;
}

function needsRealLogin() {
  const u = auth?.currentUser;
  if (!u) return true;
  if (u.isAnonymous) return true; // anonymous is not “real login” for onboarding bind
  return false;
}

/* -------------------------------- LOAD ATHLETE -------------------------------- */
async function loadAthlete() {
  setStatus("Loading…");
  disableButtons(true);

  // needed for rules-gated reads (anonymous OK here)
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

  if (nameEl)   nameEl.textContent = displayName;
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

  console.log("[loadAthlete] uid:", uid);
  console.log("[loadAthlete] team/city/state:", team, city, state);
}

/* -------------------------------- CONFIRM IDENTITY (STEP 1) --------------------------------
   Pivot: NO Firestore write here.
   After magic login, call Cloud Function to do the write with Admin privileges.
-------------------------------------------------------------------------------------------- */
async function confirmIdentity() {
  if (!athlete || uiLocked) return;

  hardLockUI("Working…");

  // If not signed in with a real account yet → start magic link
  if (needsRealLogin()) {
    try {
      setStatus("Enter email to continue…");
      const email = window.prompt("Enter your email to continue onboarding:");
      if (!email) {
        unlockUI("Login cancelled.");
        return;
      }
      await startMagicLink(email);
      // Stop here; they return via email link and we auto-resume YES
      return;
    } catch (e) {
      console.error(e);
      unlockUI("Login failed. Check console.");
      return;
    }
  }

  // Real signed-in user
  const user = auth.currentUser;
  console.log("Auth UID:", user?.uid, "anon:", user?.isAnonymous);

  if (!user) {
    unlockUI("Not signed in.");
    return;
  }

  // If already confirmed (UI copy), just continue
  if (athlete?.onboarding?.locks?.step1 === true) {
    window.location.href = `/athlete-onboarding/step-2.html?id=${encodeURIComponent(uid)}`;
    return;
  }

  try {
    setStatus("Saving…");

    // ✅ Cloud Function does:
    // - bind authUid if missing
    // - enforce "already bound" protection
    // - set onboarding step/locks/timestamps
    const fn = httpsCallable(functions, "onboardingConfirmStep1");
    const res = await fn({ athleteId: uid, tokenId: tokenId || null });

    console.log("[confirmIdentity] function result:", res?.data || res);

    window.location.href = `/athlete-onboarding/step-2.html?id=${encodeURIComponent(uid)}`;
  } catch (e) {
    console.error("[confirmIdentity] failed:", e);
    const code = e?.code || "";
    const msg  = e?.message || String(e);

    // show something useful
    if (String(code).includes("permission-denied")) {
      unlockUI("Blocked: profile is already bound to a different account.");
    } else if (String(code).includes("unauthenticated")) {
      unlockUI("Not signed in. Try again.");
    } else {
      unlockUI(`Save failed: ${msg}`);
    }
  }
}

/* -------------------------------- NOT ME -------------------------------- */
function notMe() {
  if (uiLocked) return;
  hardLockUI("Not you. Link locked. Ask coach for a new link.");
  setTimeout(() => {
    window.location.href = "/athlete-onboarding/";
  }, 1200);
}

/* -------------------------------- BOOT -------------------------------- */
async function bootVerify() {
  try {
    await finishMagicLinkIfPresent();
    await loadAthlete();

    // Auto-resume YES if they were in the middle of confirmation
    const pendingUid = sessionStorage.getItem("sandman_pending_yes_uid");
    if (pendingUid && pendingUid === uid && !needsRealLogin()) {
      sessionStorage.removeItem("sandman_pending_yes_uid");
      confirmIdentity();
    }
  } catch (e) {
    console.error(e);
    setStatus("Error loading profile.");
    disableButtons(true);
  }
}

// Splash support
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