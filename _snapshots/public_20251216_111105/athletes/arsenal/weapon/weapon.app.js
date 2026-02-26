console.log("Weapon Selector Loaded");

// Track selected weapon
let selectedWeapon = null;

// Highlight card on click
document.querySelectorAll(".weapon-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".weapon-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedWeapon = card.dataset.weapon;
  });
});

// Save (stub, will connect to Firestore later)
document.getElementById("saveWeapon").addEventListener("click", () => {
  if (!selectedWeapon) {
    alert("Choose one weapon to continue.");
    return;
  }

  console.log("Saving weapon:", selectedWeapon);

  // Future:
  // await updateDoc(doc(db, "athletes", uid), { weapon: selectedWeapon })

  alert(`Weapon locked: ${selectedWeapon.toUpperCase()}`);
  history.back();
});
