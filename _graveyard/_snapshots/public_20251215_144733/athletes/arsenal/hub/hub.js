import { db, auth } from "../../../firebase-init.js";
import { db, doc, getDoc } from "/data/firebase-init.js";

const nameEl = document.getElementById("ath-name");
const tierEl = document.getElementById("ath-tier");
const btnWeapon = document.getElementById("btn-weapon");
const unlockMsg = document.getElementById("unlock-msg");
const unlockBox = document.getElementById("unlock-options");

auth.onAuthStateChanged(async (user) => {
  if (!user) return;

  const ref = doc(db, "athletes", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();

  // Name + Tier
  nameEl.textContent = data.publicName || "Athlete";
  tierEl.textContent = `${data.tierName} • ${data.xp}/${data.xpCap}`;

  // Weapon
  btnWeapon.textContent = data.weapon || "Choose Weapon";
  btnWeapon.onclick = () => location.href = `../weapon/index.html`;

  // Unlock Logic
  if (data.stripeCount >= 2) {
    unlockMsg.textContent = "You've reached Stripe 2. Your journey branches now.";
    unlockBox.innerHTML = `
      <button class="tool-btn">Combat Enhancement</button>
      <button class="tool-btn">Strength Expansion</button>
      <button class="tool-btn">Honor Advancement</button>
    `;
  } else {
    unlockMsg.textContent = "New tools unlock as you rank up.";
    unlockBox.innerHTML = "";
  }
});

// Lane redirects (actual files depend on your structure)
window.openTool = function (lane) {
  location.href = `../${lane}/index.html`;
};
