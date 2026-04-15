// Tabs + accordions + “stay on Coach” lock
export function initUI(){
  // Default lock flags (you can toggle these in core after Approve)
  window.__stayOnCoach = true;
  window.__coachLockUntil = 0;

  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll("main[data-panel]");

  function showTab(name){
    // enforce temp coach lock
    if (window.__stayOnCoach && Date.now() < (window.__coachLockUntil || 0) && name !== "coach") {
      name = "coach";
    }
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    panels.forEach(p => {
      const on = p.getAttribute("data-panel") === name;
      p.hidden = !on;
      const hdr = p.querySelector(".section-hdr");
      if (on && hdr && !hdr.classList.contains("open")) hdr.classList.add("open");
      const body = p.querySelector(".section-body");
      if (on && body){ body.style.maxHeight = "2000px"; body.style.padding = "12px"; }
    });

    // repaint athlete if landing there
    if (name === "athlete" && typeof window.paintWhenReady === "function"){
      const uid = localStorage.getItem("lastApprovedUid");
      if (uid) window.paintWhenReady(uid);
    }

    const u = new URL(location.href); u.hash = name; history.replaceState(null, "", u);
  }

  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  const start = (location.hash || "#coach").slice(1);
  showTab(["coach","parent","athlete"].includes(start) ? start : "coach");

  // Accordions toggle
  document.addEventListener("click", (e)=>{
    if (!e.target.matches(".section-hdr")) return;
    e.target.classList.toggle("open");
  });
}
