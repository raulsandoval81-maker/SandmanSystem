import { db, doc, getDoc, updateDoc } from "../assets/js/firebase-init.js";

const params  = new URLSearchParams(window.location.search);
const tokenId = params.get("token");

const toolName  = document.getElementById("tool-name");
const toolDesc  = document.getElementById("tool-desc");
const preview   = document.getElementById("tool-preview");
const finishBtn = document.getElementById("finish-btn");
const statusEl  = document.getElementById("status");

let tokenData = null;

(async function load(){
  if(!tokenId){
    statusEl.textContent = "Missing token.";
    return;
  }

  const snap = await getDoc(doc(db, "intakeTokens", tokenId));
  if(!snap.exists()){
    statusEl.textContent = "Invalid token.";
    return;
  }

  tokenData = snap.data();

  const weapon = tokenData.weapon;

  if(!weapon){
    statusEl.textContent = "No weapon selected. Go back to Step 2.";
    return;
  }

  // Load appropriate starter kit
  loadStarterKit(weapon);
})();

function loadStarterKit(weapon){
  if(weapon === "COMBAT"){
    toolName.textContent = "Shadow Trainer (v1)";
    toolDesc.textContent = "Your first Combat tool. These are your foundation drills and mindset cues.";

    preview.innerHTML = `
      <ul class="small">
        <li>Stance → Motion → Level Change</li>
        <li>Shadow Shots (L/R)</li>
        <li>Hand-Fight Basics</li>
        <li>Breakdowns (pressure form)</li>
      </ul>
    `;
  }

  else if(weapon === "STRENGTH"){
    toolName.textContent = "Strength Primer";
    toolDesc.textContent = "Simple 10-minute strength sessions to build consistency and power.";

    preview.innerHTML = `
      <ul class="small">
        <li>Push → Pull → Legs rotation</li>
        <li>3×10 foundational reps</li>
        <li>Daily micro-goal: 10 min</li>
      </ul>
    `;
  }

  else if(weapon === "HONOR"){
    toolName.textContent = "Honor Primer";
    toolDesc.textContent = "Your first FEAR challenges to sharpen discipline and mindset.";

    preview.innerHTML = `
      <ul class="small">
        <li>Rule #1 — Focus</li>
        <li>Rule #2 — Effort</li>
        <li>Rule #3 — Attitude</li>
        <li>Rule #4 — Respect</li>
      </ul>
    `;
  }

  else {
    toolName.textContent = "Unknown weapon";
    toolDesc.textContent = "";
  }
}

// Finish onboarding
finishBtn.onclick = async () => {

  statusEl.textContent = "Finishing…";

  await updateDoc(doc(db, "intakeTokens", tokenId), {
    onboardingComplete: true,
    completedAt: Date.now()
  });

  // Go to athlete hub
  window.location.href = "/athletes/index.html";
};
