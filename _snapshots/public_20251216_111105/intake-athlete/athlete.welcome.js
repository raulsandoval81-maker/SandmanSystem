import { db, auth } from "../intake-shared/fire.js";
import { db, doc, getDoc, updateDoc } from "/data/firebase-init.js";

// Read URL param (?id=xxxx)
const params = new URLSearchParams(window.location.search);
const athleteId = params.get("id");

const loading = document.getElementById("loading");
const profile = document.getElementById("profile");

async function loadProfile(){
  if (!athleteId){
    loading.innerHTML = "<p>Error: Missing athlete ID.</p>";
    return;
  }

  const ref = doc(db, "athletes", athleteId);
  const snap = await getDoc(ref);

  if (!snap.exists()){
    loading.innerHTML = "<p>Error: Athlete not found.</p>";
    return;
  }

  const data = snap.data();

  document.getElementById("ath-name").textContent = data.name;
  document.getElementById("ath-track").textContent = data.track;
  document.getElementById("ath-lane").textContent = data.lane;
  document.getElementById("ath-virtue").textContent = data.virtueFull;
  document.getElementById("ath-tag").textContent = data.mintTag;

  loading.style.display = "none";
  profile.style.display = "block";
}

loadProfile();

// CLAIM PROFILE
document.getElementById("btn-claim").addEventListener("click", async () => {
  const status = document.getElementById("claim-status");
  status.textContent = "Claiming…";

  const deviceId = navigator.userAgent + "_" + Date.now();

  const ref = doc(db, "athletes", athleteId);

  await updateDoc(ref, {
    claimedAt: Date.now(),
    deviceId: deviceId
  });

  status.textContent = "Profile claimed! Your coach will confirm you soon.";
});
