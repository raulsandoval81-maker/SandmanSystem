import { applyChoice } from "../../assets/js/unlock-utils.js";

let selected = null;

document.querySelectorAll(".choice-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".choice-card").forEach(c => 
      c.classList.remove("active")
    );
    card.classList.add("active");
    selected = card.dataset.choice;
    document.getElementById("confirm").disabled = false;
  });
});

document.getElementById("confirm").addEventListener("click", () => {
  if (!selected) return;
  applyChoice(selected);
});
