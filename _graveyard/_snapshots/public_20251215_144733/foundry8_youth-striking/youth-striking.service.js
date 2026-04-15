// Orchestrates the Combat • Youth Striking hub/index + sport pages
// (boxing.html, kick_boxing.html, etc.)

import { initXPWidgets }   from "../assets/js/services/xp.service.js";
import { initCalendar }    from "../assets/js/services/calendar.service.js";
import { wireContactForm } from "../assets/js/services/contact.service.js";
import { toast }           from "../assets/js/services/core.service.js";

document.addEventListener("DOMContentLoaded", () => {
  try { toast("Youth Striking ready", "info"); } catch (_) {}

  // 1) XP / rank UI
  try { initXPWidgets({ root: document, audience: "youth-striking" }); } catch (e) { console.warn(e); }

  // 2) Calendar (optional on each page)
  const cal = document.querySelector("#calendar");
  if (cal) {
    try { initCalendar({ el: cal, src: "../data/coach-weekly.json", tags: ["striking","youth"] }); }
    catch (e) { console.warn(e); }
  }

  // 3) Contact / interest form
  const form = document.querySelector("form");
  if (form) {
    try { wireContactForm(form, { topic: "Youth Striking" }); }
    catch (e) { console.warn(e); }
  }
});
