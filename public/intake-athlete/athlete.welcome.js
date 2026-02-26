import { db, doc, getDoc, updateDoc, serverTimestamp } from "/assets/js/firebase-init.js";

// ---------------------------------------
// URL PARAM
// ---------------------------------------
const params = new URLSearchParams(window.location.search);
const athleteId = params.get("id");

const loading = document.getElementById("loading");
const profile = document.getElementById("profile");

// ---------------------------------------
// Double-Tap Guard
// ---------------------------------------
function preventDoubleTap(btn, fn) {
  let busy = false;

  return async (e) => {
    e?.preventDefault?.();
    if (busy) return;

    busy = true;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("is-busy");

    try {
      await fn(e);
      // keep disabled after success
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("is-busy");
      throw err;
    }
  };
}

// ---------------------------------------
// Helpers
// ---------------------------------------
function isF8(uid) {
  return String(uid || "").toUpperCase().startsWith("F8_");
}

function pickRank(data, uid) {
  if (data?.rank) return data.rank;
  return isF8(uid) ? "Shadow" : "Apprentice";
}

function pickJourney(uid) {
  return isF8(uid) ? "Zero 2 Hero" : "Path 2 Legend";
}

// UI polish: if claimed, make button look idle (no busy state)
function clearBusyUI(btn) {
  if (!btn) return;
  btn.removeAttribute("aria-busy");
  btn.classList.remove("is-busy");
}

// Hard lock claim UI (single truth)
function lockClaimUI(message = "Already claimed.") {
  const btn = document.getElementById("btn-claim");
  const status = document.getElementById("claim-status");

  if (btn) {
    btn.disabled = true;     // ✅ disable button
    clearBusyUI(btn);        // ✅ aria-busy off + remove is-busy
  }
  if (status) status.textContent = message;
}

// ---------------------------------------
// Load Profile
// ---------------------------------------
async function loadProfile() {
  if (!athleteId) {
    if (loading) loading.innerHTML = "<p>Error: Missing athlete ID.</p>";
    return;
  }

  const ref = doc(db, "athletes", athleteId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (loading) loading.innerHTML = "<p>Error: Athlete not found.</p>";
    return;
  }

  const data = snap.data() || {};

  // ✅ If already claimed: ensure clean, non-busy, disabled UI
  if (data.claimedAt || data.claimStatus === "claimed") {
    lockClaimUI("Already claimed.");
  }

  const uid = athleteId;

  const name =
    data.fullName ||
    data.name ||
    data.publicName ||
    "—";

  const track =
    data.trackCode ||
    data.track ||
    (isF8(uid) ? "foundry8-combat" : "foundry4-combat");

  const tier = data.tier || "T0";
  const rank = pickRank(data, uid);
  const journey = pickJourney(uid);

  const team =
    data.team?.name ||
    data.teamName ||
    data.team ||
    "—";

  const city =
    data.team?.city ||
    data.city ||
    data.location?.city ||
    "";

  const state =
    data.team?.state ||
    data.state ||
    data.location?.state ||
    "";

  const cityState =
    (city && state)
      ? `${city}, ${state}`
      : (city || state || "—");

  const mintTag =
    data.mintVirtueTag ||
    data.mintVirtueTagSerial ||
    "—";

  // Paint UI (guard each element so missing IDs don't crash)
  document.getElementById("ath-name")?.textContent = name;
  document.getElementById("ath-uid")?.textContent = uid;
  document.getElementById("ath-track")?.textContent = track;
  document.getElementById("ath-tier")?.textContent = tier;
  document.getElementById("ath-rank")?.textContent = rank;
  document.getElementById("ath-journey")?.textContent = journey;
  document.getElementById("ath-team")?.textContent = team;
  document.getElementById("ath-citystate")?.textContent = cityState;
  document.getElementById("ath-tag")?.textContent = mintTag;

  if (loading) loading.style.display = "none";
  if (profile) profile.style.display = "block";
}

loadProfile().catch((err) => {
  console.error("Load profile error:", err);
  if (loading) loading.innerHTML = "<p>Error loading profile.</p>";
});

// ---------------------------------------
// Claim Profile (Single Source of Truth)
// ---------------------------------------
async function claimProfile() {
  const status = document.getElementById("claim-status");
  if (status) status.textContent = "Claiming…";

  const ref = doc(db, "athletes", athleteId);

  await updateDoc(ref, {
    claimedAt: serverTimestamp(),
    claimedDeviceId: navigator.userAgent,
    claimStatus: "claimed",
  });

  // ✅ After successful claim: disable button + show "Already claimed."
  lockClaimUI("Already claimed.");
}

const claimBtn = document.getElementById("btn-claim");
if (claimBtn) {
  claimBtn.addEventListener("click", preventDoubleTap(claimBtn, claimProfile));
}
