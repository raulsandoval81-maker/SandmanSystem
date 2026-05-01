function applyClipboardTheme(theme){
  const isDay = theme === "day";
  document.body.classList.toggle("theme-day", isDay);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = isDay ? "🌙" : "☀";
  }

  localStorage.setItem("clipboardTheme", theme);
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("clipboardTheme") || "night";

  applyClipboardTheme(savedTheme);

  if (btn) {
    btn.addEventListener("click", () => {
      const nextTheme = document.body.classList.contains("theme-day") ? "night" : "day";
      applyClipboardTheme(nextTheme);
    });
  }
});