import { db, doc, getDoc, updateDoc } from "../assets/js/firebase-init.js";

// UI elements
const tokenInput = document.getElementById("token-input");
const tokenStatus = document.getElementById("token-status");
const nameCard   = document.getElementById("name-card");
const virtueCard = document.getElementById("virtue-card");
const nameInput  = document.getElementById("athlete-name");
const virtueBox  = document.getElementById("virtue-output");

// Buttons
document.getElementById("btn-verify").onclick = verifyToken;
document.getElementById("btn-save-name").onclick = saveName;
document.getElementById("btn-finish").onclick = finish;

let tokenData = null;
let tokenId   = null;

// STEP 1 — verify token
async function verifyToken(){
  tokenId = tokenInput.value.trim();
  if(!tokenId){
    tokenStatus.textContent = "Enter a token.";
    return;
  }

  const ref = doc(db, "intakeTokens", tokenId);
  const snap = await getDoc(ref);

  if(!snap.exists()){
    tokenStatus.textContent = "Invalid or expired token.";
    return;
  }

  tokenData = snap.data();

  tokenStatus.textContent = "Token verified ✓";
  nameCard.classList.remove("hidden");
}

// STEP 2 — save name
async function saveName(){
  const name = nameInput.value.trim();
  if(!name){
    alert("Enter your full name.");
    return;
  }

  await updateDoc(doc(db, "intakeTokens", tokenId), {
    athleteName: name
  });

  virtueBox.textContent = tokenData.mintTag;
  virtueCard.classList.remove("hidden");
}

// STEP 3 — finish onboarding
function finish(){
  window.location.href = "/athletes/index.html";
}
