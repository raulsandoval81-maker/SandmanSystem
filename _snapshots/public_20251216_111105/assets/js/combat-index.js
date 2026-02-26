// /assets/js/combat-index.js

// (optional) import Firebase logging helpers
// import { logEvent } from "./shared-content.js";

// Track clicks on .open buttons
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".open");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const label = btn.closest(".card")?.querySelector("h3")?.innerText || "unknown";
      console.log("Combat open:", label);
      // if using Firebase:
      // logEvent("combat_open", { program: label });
    });
  });
});
