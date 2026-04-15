import { initCalendar }   from "../services/calendar.service.js";
import { wireContactForm } from "../services/contact.service.js";

document.addEventListener("DOMContentLoaded", () => {
  const cal = document.querySelector("#calendar");
  if (cal) initCalendar({ el: cal, src: "../data/coach-weekly.json" });

  const form = document.querySelector("form");
  if (form) wireContactForm(form);
});
