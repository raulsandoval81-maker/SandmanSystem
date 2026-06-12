function paintLang(lang) {
  const showEN = lang === "en";

  document.querySelectorAll(".en").forEach((el) => {
    el.style.display = showEN ? "" : "none";
  });

  document.querySelectorAll(".es").forEach((el) => {
    el.style.display = showEN ? "none" : "";
  });
}

function setLang(lang) {
  const buttons =
    document.querySelectorAll(".lang-btn");

  localStorage.setItem("lang", lang);

  buttons.forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.lang === lang
    );
  });

  paintLang(lang);
}

function setTheme(mode) {
  document.body.classList.remove("day", "night");
  document.body.classList.add(mode);
  localStorage.setItem("theme", mode);
}

document.addEventListener("DOMContentLoaded", () => {
  const savedLang =
    localStorage.getItem("lang") || "en";

  setLang(savedLang);

  document
    .querySelectorAll(".lang-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        setLang(btn.dataset.lang);
      });
    });

  const savedTheme =
    localStorage.getItem("theme") || "day";

  setTheme(savedTheme);

  const themeBtn =
    document.getElementById("themeToggle");

  themeBtn?.addEventListener("click", () => {
    const isDay =
      document.body.classList.contains("day");

    setTheme(isDay ? "night" : "day");
  });
});