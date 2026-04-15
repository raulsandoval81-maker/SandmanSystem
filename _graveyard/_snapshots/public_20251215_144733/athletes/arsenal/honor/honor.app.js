console.log("Honor Arsenal Loaded");

// TEMP: interactive highlight
document.querySelectorAll(".tool-card:not(.locked)").forEach(card => {
  card.addEventListener("click", () => {
    alert("Honor tools open reflection prompts in a later step.");
  });
});

// Later:
// • Read XP lanes from athlete profile
// • Glow next chapter when stripe threshold is reached
// • Load virtue pair for each chapter dynamically
