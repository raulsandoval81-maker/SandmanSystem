// /public/combat/combat.service.js
// Orchestrates the Combat hub + index pages

import { initXPWidgets }   from "../assets/js/services/xp.service.js";
import { initCalendar }    from "../assets/js/services/calendar.service.js";
import { wireContactForm } from "../assets/js/services/contact.service.js";
import { toast }           from "../assets/js/services/core.service.js";

document.addEventListener("DOMContentLoaded", () => {
  // Light “it loaded” ping (safe to remove later)
  try { toast("Combat hub ready", "info"); } catch (_) {}

  // 1) XP widgets (rank bars, progress chips, etc.)
  try { initXPWidgets({ root: document }); } catch (err) { console.warn("XP init:", err); }

  // 2) Calendar (only if page has #calendar)
  const calEl = document.querySelector("#calendar");
  if (calEl) {
    try {
      // Point to whatever schedule JSON you want shown on Combat pages
      initCalendar({ el: calEl, src: "../data/coach-weekly.json" });
    } catch (err) {
      console.warn("Calendar init:", err);
    }
  }

  // 3) Contact / interest form (only if a <form> exists)
  const form = document.querySelector("form");
  if (form) {
    try { wireContactForm(form); } catch (err) { console.warn("Form wiring:", err); }
  }
});
