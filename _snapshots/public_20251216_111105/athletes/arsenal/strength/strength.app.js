console.log("Strength Arsenal Loaded");

// TEMP: interactive highlight
document.querySelectorAll(".tool-card:not(.locked)").forEach(card => {
  card.addEventListener("click", () => {
    alert("This strength concept opens a drill page in a later step.");
  });
});

// Later:
// • Check XP lane unlocked
// • Check chapter unlocks via unlock.json
// • Glow next chapter when stripe reaches threshold
