// /public/athlete-onboarding/onboarding.js
import {
  db,
  auth,
  doc,
  getDoc,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import { resolveOnboardingTemplate } from "./onboarding-templates.js";
import {
  disciplineLabel,
  normalizeDisciplineId
} from "/assets/js/discipline-policy.js";

const $ = (id) => document.getElementById(id);

/* -------------------------------- URL PARAMS -------------------------------- */
const params = new URLSearchParams(location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();

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

function onboardingIsComplete(a = {}) {
  return a?.onboarding?.status === "complete"
    || Boolean(a?.onboarding?.completedAt)
    || a?.onboarding?.locks?.step9 === true;
}

function athleteDestination() {
  return onboardingIsComplete(athlete)
    ? `/athletes/hub/?id=${encodeURIComponent(uid)}`
    : `/athlete-onboarding/step-2.html?id=${encodeURIComponent(uid)}`;
}

function athleteLoginUrl() {
  const next = `/athlete-onboarding/?id=${encodeURIComponent(uid)}`;
  return `/login/?next=${encodeURIComponent(next)}`;
}

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

function needsRealLogin() {
  const user = auth?.currentUser;
  return !user || user.isAnonymous;
}

/* -------------------------------- LOAD ATHLETE -------------------------------- */

function prettyJourneyName(programTrack = "", art = "", placement = {}) {
  const pt = String(
    programTrack ||
    placement.programTrack ||
    ""
  ).toLowerCase();

  const a = String(
    art ||
    placement.art ||
    ""
  ).toLowerCase();

  if (pt === "zero2hero" || pt === "road2champion") return "Road2Champion";
  if (pt === "path2legend") return "Path2Legend";
  if (pt === "quest2mastery") return "Quest2Mastery";
  if (pt === "road2grestness" || pt === "adultboxing") return "Road2Glory";

  if (a === "boxing") return "Road2Glory";
  if (a === "mma") return "Quest2Mastery";
  if (a === "wrestling") return "Path2Legend";

  return "—";
}

function prettyArtName(art = "") {
  const canonical = normalizeDisciplineId(art);

  switch (canonical) {
    case "mma":
      return "MMA";

    case "boxing":
      return "Boxing";

    case "wrestling":
      return "Wrestling";

    case "muay-thai":
      return disciplineLabel(canonical);

    case "grappling":
    case "submission-grappling":
      return "Submission Grappling";

    default:
      return "—";
  }
}

function prettyTierRank(a = {}) {
  const pt = String(a.programTrack || "").toLowerCase();

  if (
    pt === "quest2mastery" ||
    pt === "road2glory" ||
    pt === "adultboxing"
  ) {
    return `${a.tier || "T1"} ${a.rankName || a.rank || "Apprentice"}`;
  }

  return `${a.tier || "T0"} ${a.rankName || a.rank || "—"}`;
}

async function loadAthlete() {
  setStatus("Loading existing Athlete…");
  disableButtons(true);

  await ensureSignedIn();

  const snap = await getDoc(doc(db, "athletes", uid));
  if (!snap.exists()) {
    setStatus("Athlete not found.");
    disableButtons(true);
    return;
  }

  athlete = snap.data() || {};

  const onboardingTemplate = resolveOnboardingTemplate(athlete);
  document.body.dataset.onboardingTemplate = onboardingTemplate.templateKey;

  console.log("[loadAthlete] full athlete:", athlete);
  console.log("[loadAthlete] programTrack:", athlete.programTrack);
  console.log("[loadAthlete] placement:", athlete.placement);

  const displayName = athlete.fullName || athlete.publicName || uid;
  const mintTag =
    athlete.mintVirtueTagDisplay ||
    athlete.mintVirtueTag ||
    athlete.uidCode ||
    athlete.uid ||
    "—";

  if (nameEl) nameEl.textContent = displayName;
  if (virtueEl) virtueEl.textContent = mintTag;

  const journeyName = prettyJourneyName(
    athlete.programTrack,
    athlete.art,
    athlete.placement
  );
  const artName = prettyArtName(athlete.art);

  text("mini-uid", uid);

  text(
    "mini-track",
    journeyName !== "—"
      ? `${journeyName} • ${artName}`
      : (athlete.trackCode || athlete.track || athlete.foundry || "—")
  );

  text("mini-tier", prettyTierRank(athlete));

  const team = pickTeamName(athlete);
  const city = pickCity(athlete);
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
  console.log("[loadAthlete] journey/art:", journeyName, artName);
  console.log("[loadAthlete] team/city/state:", team, city, state);
}

/* -------------------------------- CONFIRM IDENTITY (STEP 1) --------------------------------
   First-time access is activated before onboarding. This page only verifies
   that the signed-in Firebase account is already bound to this Athlete record.
-------------------------------------------------------------------------------------------- */
async function confirmIdentity() {
  if (!athlete || uiLocked) return;

  hardLockUI("Working…");

  if (needsRealLogin()) {
    setStatus("Athlete access must be activated first. Opening Sandman Login…");
    window.location.assign(athleteLoginUrl());
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    unlockUI("Not signed in.");
    return;
  }

  if (String(athlete.authUid || "").trim() !== user.uid) {
    unlockUI(
      "This login is not connected to this Athlete. Use the Athlete's first-time invitation or the correct Athlete login."
    );
    return;
  }

  if (athlete?.onboarding?.locks?.step1 !== true) {
    unlockUI(
      "Athlete access is connected, but first-time activation is incomplete. Ask Sandman Management to verify access."
    );
    return;
  }

  window.location.href = athleteDestination();
}

/* -------------------------------- NOT ME -------------------------------- */
function notMe() {
  if (uiLocked) return;
  hardLockUI("Not you. Returning to Login…");
  setTimeout(() => {
    window.location.href = "/login/";
  }, 800);
}

/* -------------------------------- BOOT -------------------------------- */
async function bootVerify() {
  try {
    await loadAthlete();
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Unable to load Athlete onboarding.");
    disableButtons(true);
  }
}

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
