// Orchestrates the Combat • Youth Grappling hub/index + sport pages
// (wrestling.html, submission_grappling.html, etc.)

import { initXPWidgets }   from "../assets/js/services/xp.service.js";
import { initCalendar }    from "../assets/js/services/calendar.service.js";
import { wireContactForm } from "../assets/js/services/contact.service.js";
import { toast }           from "../assets/js/services/core.service.js";

document.addEventListener("DOMContentLoaded", () => {
  try { toast("Youth Grappling ready", "info"); } catch (_) {}

  // 1) XP / rank UI (safe no-op if widgets aren't present)
  try { initXPWidgets({ root: document, audience: "youth-grappling" }); } catch (e) { console.warn(e); }

  // 2) Calendar (only if #calendar exists on this page)
  const cal = document.querySelector("#calendar");
  if (cal) {
    try { initCalendar({ el: cal, src: "../data/coach-weekly.json", tags: ["grappling","youth"] }); }
    catch (e) { console.warn(e); }
  }

  // 3) Contact / interest form
  const form = document.querySelector("form");
  if (form) {
    try { wireContactForm(form, { topic: "Youth Grappling" }); }
    catch (e) { console.warn(e); }
  }
});
