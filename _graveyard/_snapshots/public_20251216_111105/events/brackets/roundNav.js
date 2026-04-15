/* ===========================================================
   ROUND NAVIGATION (NFHS)
   Smooth scroll + active highlight
   =========================================================== */

const nav = document.getElementById("roundNav");
const buttons = nav.querySelectorAll(".round-btn");

buttons.forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.round;
    const section = document.getElementById(id);

    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }

    buttons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

console.log("%cROUND NAV READY","color:#ffdd48");
