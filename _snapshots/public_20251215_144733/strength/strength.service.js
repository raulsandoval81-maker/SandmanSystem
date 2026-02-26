import { wireContactForm } from "../services/contact.service.js";
import { initCalendar }    from "../services/calendar.service.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (form) wireContactForm(form);

  const cal = document.querySelector("#calendar");
  if (cal) initCalendar({ el: cal, src: "../data/coach-weekly.json" });
});
