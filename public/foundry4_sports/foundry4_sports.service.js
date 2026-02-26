import { initXPWidgets } from "../services/xp.service.js";
import { initCalendar }  from "../services/calendar.service.js";

document.addEventListener("DOMContentLoaded", () => {
  initXPWidgets({ root: document });

  const cal = document.querySelector("#calendar");
  if (cal) initCalendar({ el: cal, src: "../data/coach-weekly.json" });
});
