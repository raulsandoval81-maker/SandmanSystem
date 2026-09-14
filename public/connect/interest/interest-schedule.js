import { db } from "/assets/js/firebase-init.js";
import { PROGRAMS } from "/assets/js/programs.js";
import {
  loadPublishedLocationSchedule,
  normalizeScheduleDiscipline
} from "/assets/js/location-schedule.js";

const byId = (id) => document.getElementById(id);
const athleteAge = byId("athleteAge");
const programInterest = byId("programInterest");
const preferredDiscipline = byId("preferredDiscipline");
const preferredPlan = byId("preferredPlan");
const preferredTrainingPattern = byId("preferredTrainingPattern");
const preferredClassTime = byId("preferredClassTime");
const guidance = byId("trainingScheduleGuidance");

const PAIRS = Object.freeze([
  { value: "monday-wednesday", days: ["monday", "wednesday"], en: "Monday + Wednesday", es: "Lunes + Miércoles" },
  { value: "tuesday-thursday", days: ["tuesday", "thursday"], en: "Tuesday + Thursday", es: "Martes + Jueves" }
]);

let rows = [];
let scheduleState = "loading";

const clean = (value = "") => String(value || "").trim();
const language = () => document.documentElement.lang === "es" ? "es" : "en";
const t = (en, es) => language() === "es" ? es : en;
const selectedInterestType = () => document.querySelector('input[name="interestType"]:checked')?.value || "";

function locationId() {
  return clean(new URLSearchParams(location.search).get("location") || byId("locationId")?.value)
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function addOption(select, value, label, selected = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  select.appendChild(option);
}

function rowDays(row = {}) {
  return clean(row.day)
    .split(/,|\s+&\s+/)
    .map((day) => clean(day).toLowerCase())
    .filter(Boolean);
}

function rowAgeRange(row = {}) {
  let min = Number(row.minAge ?? row.ageMin);
  let max = Number(row.maxAge ?? row.ageMax);
  if (!Number.isFinite(min)) min = null;
  if (!Number.isFinite(max)) max = null;

  const title = clean(row.title).toLowerCase();
  const details = clean(row.details);
  const range = details.match(/ages?\s+(\d+)\s*[–-]\s*(\d+)/i);
  const plus = details.match(/ages?\s+(\d+)\s*\+/i);
  if (range) {
    if (min === null) min = Number(range[1]);
    if (max === null) max = Number(range[2]);
  }
  if (plus && min === null) min = Number(plus[1]);

  // Canonical Combat groups. Do not infer new program ages.
  if (title.includes("youth")) {
    min = min ?? 7;
    max = max ?? 13;
  }
  if (title.includes("teen")) min = min ?? 14;
  return { min, max };
}

function rowMatchesAge(row, age) {
  if (!Number.isFinite(age)) return false;
  const { min, max } = rowAgeRange(row);
  return (min === null || age >= min) && (max === null || age <= max);
}

function requestedDiscipline() {
  const direct = normalizeScheduleDiscipline(preferredDiscipline?.value || "");
  if (direct) return direct;
  const program = PROGRAMS.find((item) => item.value === programInterest?.value);
  return normalizeScheduleDiscipline(program?.discipline || "");
}

function rowMatchesDiscipline(row, requested) {
  const stored = normalizeScheduleDiscipline(row.discipline || "");
  const title = clean(row.title).toLowerCase().replace(/[_\s]+/g, "-");
  const haystack = `${stored} ${title}`;
  if (requested === "wrestling") return haystack.includes("wrestling");
  if (requested === "boxing") return haystack.includes("boxing");
  if (["muay-thai", "kickboxing"].includes(requested)) {
    return haystack.includes("muay-thai") || haystack.includes("kickboxing");
  }
  return Boolean(requested) && stored === requested;
}

function eligibleRows() {
  const age = Number(athleteAge?.value);
  const interestType = selectedInterestType();
  const discipline = requestedDiscipline();

  return rows.filter((row) => {
    if (!rowMatchesAge(row, age)) return false;
    const category = clean(row.category || row.type).toLowerCase();
    if (interestType === "fitness") return category === "fitness";
    // Public schedule semantics: explicit Fitness; everything else is Combat.
    return category !== "fitness" && rowMatchesDiscipline(row, discipline);
  });
}

function pairCovered(pair, candidateRows) {
  const covered = new Set(candidateRows.flatMap(rowDays));
  return pair.days.every((day) => covered.has(day));
}

function validPairs(candidateRows) {
  const groups = groupedClasses(candidateRows);
  return PAIRS.filter((pair) =>
    groups.some((group) =>
      pair.days.every((day) => group.days.has(day))
    )
  );
}

function groupedClasses(candidateRows) {
  const groups = new Map();
  for (const row of candidateRows) {
    const time = clean(row.label || row.time || (row.start && row.end ? `${row.start}–${row.end}` : ""));
    const key = `${clean(row.title).toLowerCase()}|${time}`;
    if (!groups.has(key)) groups.set(key, { row, time, days: new Set() });
    rowDays(row).forEach((day) => groups.get(key).days.add(day));
  }
  return [...groups.values()];
}

function localizePlans() {
  preferredPlan?.querySelectorAll("[data-plan-label-en]").forEach((option) => {
    option.textContent = language() === "es" ? option.dataset.planLabelEs : option.dataset.planLabelEn;
  });
}

function renderClassTimes(candidateRows) {
  if (!preferredClassTime) return;
  const patternValue = preferredTrainingPattern?.value || "";
  const pair = PAIRS.find((item) => item.value === patternValue);
  const previous = preferredClassTime.value;
  preferredClassTime.innerHTML = "";

  if (patternValue === "not-sure") {
    addOption(preferredClassTime, "management-confirmation", t("Management will help choose", "Administración ayudará a elegir"), true);
    return;
  }
  if (!pair) {
    addOption(preferredClassTime, "", t("Select training days first", "Primero selecciona los días"));
    return;
  }

  const matches = groupedClasses(candidateRows).filter((group) =>
    pair.days.every((day) => group.days.has(day))
  );
  if (!matches.length) {
    addOption(preferredClassTime, "", t("No published class matches these days", "Ninguna clase publicada coincide con estos días"));
    return;
  }
  if (matches.length > 1) {
    addOption(preferredClassTime, "", t("Select a class time", "Selecciona un horario"));
  }
  for (const group of matches) {
    const title = language() === "es" ? group.row.titleEs || group.row.title : group.row.title;
    const pairLabel = language() === "es" ? pair.es : pair.en;
    const value = `${group.row.title} — ${pair.en} — ${group.time}`;
    addOption(preferredClassTime, value, `${title} · ${pairLabel} · ${group.time}`, matches.length === 1 || value === previous);
  }
}

function renderDays() {
  if (!preferredTrainingPattern) return;
  localizePlans();
  const candidateRows = eligibleRows();
  const pairs = validPairs(candidateRows);
  const previous = preferredTrainingPattern.value;
  const selected = previous === "not-sure"
    ? "not-sure"
    : pairs.some((pair) => pair.value === previous)
      ? previous
      : pairs.length === 1 ? pairs[0].value : "";

  preferredTrainingPattern.innerHTML = "";
  addOption(preferredTrainingPattern, "", t("Select one", "Selecciona una opción"), !selected);
  for (const pair of pairs) {
    addOption(preferredTrainingPattern, pair.value, language() === "es" ? pair.es : pair.en, pair.value === selected);
  }
  addOption(preferredTrainingPattern, "not-sure", t("Not sure — help me choose", "No estoy seguro — ayúdame a elegir"), selected === "not-sure");

  if (guidance) {
    if (scheduleState === "loading") guidance.textContent = t("Loading the current schedule…", "Cargando el horario actual…");
    else if (scheduleState !== "ready") guidance.textContent = t("The schedule could not be loaded. Choose “Not sure” and Management will help.", "No se pudo cargar el horario. Elige “No estoy seguro” y Administración ayudará.");
    else if (!Number.isFinite(Number(athleteAge?.value)) || Number(athleteAge?.value) <= 0 || (selectedInterestType() !== "fitness" && !requestedDiscipline())) guidance.textContent = t("Select the athlete’s age and program to see available training days.", "Selecciona la edad y el programa para ver los días disponibles.");
    else if (pairs.length === 1) guidance.textContent = t("This program is offered on one regular schedule, so it has been selected for you.", "Este programa se ofrece en un solo horario regular, por eso fue seleccionado automáticamente.");
    else if (pairs.length > 1) guidance.textContent = t("Choose the regular training days that work best. The matching class time will appear below.", "Elige los días que funcionen mejor. El horario correspondiente aparecerá abajo.");
    else guidance.textContent = t("No published schedule matches this selection. Choose “Not sure” and Management will help.", "Ningún horario publicado coincide. Elige “No estoy seguro” y Administración ayudará.");
  }
  renderClassTimes(candidateRows);
}

function updateScheduleLinks() {
  const id = locationId();
  const href = id ? `/locations/${id}/schedule.html` : "/schedule/";
  ["interestScheduleLink", "interestScheduleLinkEs"].forEach((linkId) => {
    const link = byId(linkId);
    if (link) link.href = href;
  });
}

async function loadSchedule() {
  updateScheduleLinks();
  renderDays();
  const id = locationId();
  if (!id) {
    scheduleState = "unavailable";
    renderDays();
    return;
  }
  try {
    const schedule = await loadPublishedLocationSchedule(db, id);
    rows = schedule.status === "published" ? schedule.weekly : [];
    scheduleState = schedule.status === "published" ? "ready" : "unavailable";
  } catch (error) {
    console.error("[interest-schedule] load failed", error);
    rows = [];
    scheduleState = "unavailable";
  }
  renderDays();
}

[athleteAge, programInterest, preferredDiscipline, preferredPlan]
  .filter(Boolean)
  .forEach((field) => ["input", "change"].forEach((eventName) =>
    field.addEventListener(eventName, () => queueMicrotask(renderDays))
  ));
document.querySelectorAll('input[name="interestType"]').forEach((input) =>
  input.addEventListener("change", () => queueMicrotask(renderDays))
);
preferredTrainingPattern?.addEventListener("change", () => renderClassTimes(eligibleRows()));
document.querySelectorAll("[data-set-language]").forEach((button) =>
  button.addEventListener("click", () => queueMicrotask(renderDays))
);

loadSchedule();
