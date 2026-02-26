console.log("Combat Arsenal Loaded");

// Later, this file will:
// • Check athlete stripeCount
// • Unlock Shadow Trainer when stripeCount >= 1
// • Load deeper combat tools as each stripe unlocks

// TEMP: highlight cards
document.querySelectorAll(".tool-card:not(.locked)").forEach(card => {
  card.addEventListener("click", () => {
    alert("This combat concept opens a drill page in a later step.");
  });
});
