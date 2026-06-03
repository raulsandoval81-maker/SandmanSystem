function applyClipboardTheme(theme){
  const isDay = theme === "day";
  document.body.classList.toggle("theme-day", isDay);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = isDay ? "🌙" : "☀";
  }

  localStorage.setItem("clipboardTheme", theme);
}

// 🔒 ONLY handle toggle here (no theme init here)
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("themeToggle");

  if (btn) {
    btn.addEventListener("click", () => {
      const isDay = document.body.classList.contains("theme-day");
      applyClipboardTheme(isDay ? "night" : "day");
    });
  }
});