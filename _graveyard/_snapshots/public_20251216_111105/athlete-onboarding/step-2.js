import { db, doc, getDoc, updateDoc } from "../assets/js/firebase-init.js";

// Get token from URL
const params   = new URLSearchParams(window.location.search);
const tokenId  = params.get("token");

const welcome  = document.getElementById("welcome-name");
const tagBox   = document.getElementById("virtue-tag");
const statusEl = document.getElementById("weapon-status");
const contCard = document.getElementById("continue-card");
const nextBtn  = document.getElementById("btn-next");

let tokenData = null;

// Load token data
(async function loadToken(){
  if(!tokenId){
    statusEl.textContent = "Missing token.";
    return;
  }

  const snap = await getDoc(doc(db, "intakeTokens", tokenId));
  if(!snap.exists()){
    statusEl.textContent = "Invalid or expired token.";
    return;
  }

  tokenData = snap.data();

  // Set UI
  welcome.textContent = `Welcome, ${tokenData.athleteName}`;
  tagBox.textContent   = tokenData.mintTag;
})();

// Weapon buttons
document.querySelectorAll(".weapon").forEach(btn => {
  btn.onclick = async () => {
    const weapon = btn.dataset.weapon;

    statusEl.textContent = "Saving…";

    await updateDoc(doc(db, "intakeTokens", tokenId), {
      weapon
    });

    statusEl.textContent = `Weapon selected: ${weapon}`;
    contCard.classList.remove("hidden");
  };
});

// Continue → Step 3 Tools
nextBtn.onclick = () => {
  window.location.href = `/athlete-onboarding/step-3.html?token=${tokenId}`;
};
