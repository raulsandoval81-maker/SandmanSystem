import { SUPPORTED_PARENT_LANGUAGES, setParentLanguage, setParentTheme } from "/assets/js/parent-preferences.js";

const languageSelect = document.getElementById("languagePreference");
const statusEl = document.getElementById("settingsStatus");

SUPPORTED_PARENT_LANGUAGES.forEach((language) => {
  const option = document.createElement("option");
  option.value = language.code;
  option.textContent = language.label;
  languageSelect.append(option);
});

languageSelect.value = localStorage.getItem("lang") || "en";
languageSelect.addEventListener("change", () => {
  setParentLanguage(languageSelect.value);
  statusEl.textContent = "Language preference saved.";
});

document.querySelectorAll(".theme-btn").forEach((button) => {
  button.addEventListener("click", () => {
    setParentTheme(button.dataset.theme);
    statusEl.textContent = "Appearance preference saved.";
  });
});
