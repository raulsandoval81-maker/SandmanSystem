function applyArenaTheme(theme){
  const isDay = theme === "day";
  document.body.classList.toggle("theme-day", isDay);

  const btn = document.getElementById("themeToggle");
  if (btn) {
btn.textContent = isDay ? "☀" : "🌙";
    btn.setAttribute("aria-label", isDay ? "Switch to night mode" : "Switch to day mode");
    btn.setAttribute("title", isDay ? "Night mode" : "Day mode");
  }

  localStorage.setItem("arenaClipboardTheme", theme);
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("arenaClipboardTheme") || "night";
  applyArenaTheme(saved);

  const btn = document.getElementById("themeToggle");
  if (btn){
    btn.addEventListener("click", () => {
      const next = document.body.classList.contains("theme-day") ? "night" : "day";
      applyArenaTheme(next);
    });
  }
});