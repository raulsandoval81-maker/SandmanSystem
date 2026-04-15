import { db, doc, getDoc } from "../assets/js/firebase-init.js";

const params  = new URLSearchParams(window.location.search);
const tokenId = params.get("token");

const nameEl      = document.getElementById("ath-name");
const tagBox      = document.getElementById("tag-box");
const weaponText  = document.getElementById("weapon-display");
const goBtn       = document.getElementById("go-tools");
const statusEl    = document.getElementById("status");

let tokenData = null;

(async function load() {
  if (!tokenId){
    statusEl.textContent = "Missing token.";
    return;
  }

  const snap = await getDoc(doc(db, "intakeTokens", tokenId));
  if (!snap.exists()){
    statusEl.textContent = "Invalid token.";
    return;
  }

  tokenData = snap.data();

  // Display name (if stored)
  nameEl.textContent = tokenData.athleteName || "Athlete";

  // Display Mint Tag
  if (tokenData.mintTag){
    tagBox.textContent = tokenData.mintTag;
  } else {
    tagBox.textContent = "No tag found.";
  }

  // Display weapon
  if (tokenData.weapon){
    weaponText.textContent = 
      tokenData.weapon === "COMBAT"  ? "Combat — Shadow Trainer" :
      tokenData.weapon === "STRENGTH"? "Strength — Primer" :
      tokenData.weapon === "HONOR"   ? "Honor — FEAR Primer" :
      "Unknown weapon";
  }
})();
 
goBtn.onclick = () => {
  statusEl.textContent = "Loading athlete tools…";
  window.location.href = "/athletes/index.html";
};
