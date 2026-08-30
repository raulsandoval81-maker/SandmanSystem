export const SUPPORTED_PARENT_LANGUAGES = [
  { code: "en", label: "English", aliases: ["en"] },
  { code: "es", label: "Español", aliases: ["es", "sp"] }
];

export function normalizeParentLanguage(value) {
  const requested = String(value || "en").toLowerCase();
  return SUPPORTED_PARENT_LANGUAGES.find((language) => language.aliases.includes(requested))?.code || "en";
}

export function setParentLanguage(value) {
  const language = normalizeParentLanguage(value);
  localStorage.setItem("lang", language);
  document.documentElement.lang = language;
  document.body.classList.toggle("lang-es", language === "es");
  document.querySelectorAll(".en").forEach((element) => { element.style.display = language === "es" ? "none" : ""; });
  document.querySelectorAll(".es").forEach((element) => { element.style.display = language === "es" ? "" : "none"; });
  document.querySelectorAll("[data-lang]").forEach((button) => { button.classList.toggle("active", normalizeParentLanguage(button.dataset.lang) === language); });
  window.dispatchEvent(new CustomEvent("parent:language-change", { detail: { language } }));
  return language;
}

export function setParentTheme(value) {
  const theme = value === "day" ? "day" : "night";
  localStorage.setItem("parent-theme", theme);
  localStorage.setItem("theme", theme);
  document.body.classList.toggle("day", theme === "day");
  document.body.classList.toggle("theme-day", theme === "day");
  document.body.classList.toggle("theme-night", theme === "night");
  document.querySelectorAll("[data-theme]").forEach((button) => { button.classList.toggle("active", button.dataset.theme === theme); });
  window.dispatchEvent(new CustomEvent("parent:theme-change", { detail: { theme } }));
  return theme;
}
