import { initCalendar }  from "../services/calendar.service.js";
import { initXPWidgets } from "../services/xp.service.js";

document.addEventListener("DOMContentLoaded", () => {
  const cal = document.querySelector("#calendar");
  if (cal) initCalendar({ el: cal, src: "../data/coach-weekly.json" });
  initXPWidgets({ root: document });
});
