import { db } from "/assets/js/firebase-init.js";

import {
  loadPublishedLocationSchedule,
  normalizeScheduleDiscipline
} from "/assets/js/location-schedule.js";

const athleteAge =
  document.getElementById("athleteAge");

const programInterest =
  document.getElementById("programInterest");

const preferredDiscipline =
  document.getElementById("preferredDiscipline");

const preferredPlan =
  document.getElementById("preferredPlan");

const preferredTrainingPattern =
  document.getElementById("preferredTrainingPattern");

const preferredClassTime =
  document.getElementById("preferredClassTime");

const trainingScheduleGuidance =
  document.getElementById("trainingScheduleGuidance");

const interestTypeInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="interestType"]'
    )
  );

let publishedRows = [];
let scheduleLoaded = false;

function language() {
  return document.documentElement.lang === "es"
    ? "es"
    : "en";
}

function translated(en, es) {
  return language() === "es" ? es : en;
}

function clean(value = "") {
  return String(value || "").trim();
}

function getLocationId() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return clean(
    params.get("location") ||
    document.getElementById("locationId")?.value ||
    ""
  )
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function selectedInterestType() {
  return document.querySelector(
    'input[name="interestType"]:checked'
  )?.value || "";
}

function addOption(
  select,
  value,
  label,
  selected = false
) {
  const option =
    document.createElement("option");

  option.value = value;
  option.textContent = label;
  option.selected = selected;

  select.appendChild(option);
}

const TRAINING_PATTERN_DAYS =
  Object.freeze({
    "monday-wednesday":
      new Set(["monday", "wednesday"]),

    "tuesday-thursday":
      new Set(["tuesday", "thursday"])
  });

function rowDays(row = {}) {
  return clean(row.day)
    .split(/,|\s+&\s+/)
    .map((day) =>
      clean(day).toLowerCase()
    )
    .filter(Boolean);
}

function rowPattern(row = {}) {
  return rowDays(row).join("-");
}

function rowMatchesPattern(
  row = {},
  pattern = ""
) {
  const selectedDays =
    TRAINING_PATTERN_DAYS[pattern];

  if (!selectedDays) {
    return false;
  }

  return rowDays(row).some(
    (day) => selectedDays.has(day)
  );
}

function trainingPatternLabel(
  pattern = ""
) {
  if (pattern === "monday-wednesday") {
    return "Monday + Wednesday";
  }

  if (pattern === "tuesday-thursday") {
    return "Tuesday + Thursday";
  }

  return "";
}

function rowMatchesAge(
  row = {},
  age
) {
  if (!Number.isFinite(age)) {
    return false;
  }

  const title =
    clean(row.title).toLowerCase();

  const details =
    clean(row.details);

  let min =
    Number(
      row.minAge ??
      row.ageMin
    );

  let max =
    Number(
      row.maxAge ??
      row.ageMax
    );

  if (!Number.isFinite(min)) min = null;
  if (!Number.isFinite(max)) max = null;

  const range =
    details.match(
      /ages?\s+(\d+)\s*[–-]\s*(\d+)/i
    );

  const plus =
    details.match(
      /ages?\s+(\d+)\s*\+/i
    );

  if (range) {
    if (min === null) min = Number(range[1]);
    if (max === null) max = Number(range[2]);
  }

  if (plus && min === null) {
    min = Number(plus[1]);
  }

  // Canonical Combat age groups remain unchanged:
  // Youth 7–13 and Teen 14+.
  if (title.includes("youth")) {
    min = min ?? 7;
    max = max ?? 13;
  }

  if (title.includes("teen")) {
    min = min ?? 14;
  }

  if (min !== null && age < min) {
    return false;
  }

  if (max !== null && age > max) {
    return false;
  }

  return true;
}

function rowMatchesDiscipline(
  row = {},
  discipline
) {
  const normalized =
    normalizeScheduleDiscipline(
      row.discipline || ""
    );

  if (normalized) {
    if (
      ["muay-thai", "kickboxing"].includes(
        discipline
      )
    ) {
      return [
        "muay-thai",
        "kickboxing"
      ].includes(normalized);
    }

    return normalized === discipline;
  }

  // Supports older published rows whose discipline
  // exists in the title but not in a separate field.
  const title =
    clean(row.title).toLowerCase();

  if (discipline === "wrestling") {
    return title.includes("wrestling");
  }

  if (discipline === "boxing") {
    return title.includes("boxing");
  }

  if (
    discipline === "muay-thai" ||
    discipline === "kickboxing"
  ) {
    return (
      title.includes("muay thai") ||
      title.includes("kickboxing")
    );
  }

  return false;
}

function matchingClassRows() {
  const age =
    Number(athleteAge?.value);

  const interestType =
    selectedInterestType();

  const discipline =
    normalizeScheduleDiscipline(
      preferredDiscipline?.value || ""
    );

  const pattern =
    preferredTrainingPattern?.value || "";

  return publishedRows.filter((row) => {
    const category =
      clean(
        row.category ||
        row.type
      ).toLowerCase();

    if (!rowMatchesAge(row, age)) {
      return false;
    }

    if (
      pattern &&
      pattern !== "not-sure" &&
      !rowMatchesPattern(
        row,
        pattern
      )
    ) {
      return false;
    }

    if (interestType === "fitness") {
      return category === "fitness";
    }

    // Match the public schedule's own rule:
    // Fitness is explicit; every other training row is Combat.
    return (
      category !== "fitness" &&
      discipline &&
      rowMatchesDiscipline(
        row,
        discipline
      )
    );
  });
}

function localizeStaticOptions() {
  preferredPlan
    ?.querySelectorAll(
      "[data-plan-label-en]"
    )
    .forEach((option) => {
      option.textContent =
        language() === "es"
          ? option.dataset.planLabelEs
          : option.dataset.planLabelEn;
    });

  preferredTrainingPattern
    ?.querySelectorAll(
      "[data-day-label-en]"
    )
    .forEach((option) => {
      option.textContent =
        language() === "es"
          ? option.dataset.dayLabelEs
          : option.dataset.dayLabelEn;
    });

  const firstDayOption =
    preferredTrainingPattern
      ?.querySelector('option[value=""]');

  if (firstDayOption) {
    firstDayOption.textContent =
      translated(
        "Select one",
        "Selecciona una opción"
      );
  }
}

function updateClassTime() {
  if (!preferredClassTime) return;

  const previous =
    preferredClassTime.value;

  const pattern =
    preferredTrainingPattern?.value || "";

  preferredClassTime.innerHTML = "";

  if (!pattern) {
    addOption(
      preferredClassTime,
      "",
      translated(
        "Select training days first",
        "Primero selecciona los días"
      )
    );

    return;
  }

  if (pattern === "not-sure") {
    addOption(
      preferredClassTime,
      "management-confirmation",
      translated(
        "Management will help choose",
        "Administración ayudará a elegir"
      ),
      true
    );

    return;
  }

  const rows =
    matchingClassRows();

  if (!rows.length) {
    addOption(
      preferredClassTime,
      scheduleLoaded
        ? ""
        : "management-confirmation",
      scheduleLoaded
        ? translated(
            "Not available for the selected days",
            "No disponible para los días seleccionados"
          )
        : translated(
            "Management will confirm the class time",
            "Administración confirmará el horario"
          ),
      true
    );

    return;
  }

  const choices =
    Array.from(
      new Map(
        rows.map((row) => {
          const title =
            language() === "es"
              ? row.titleEs || row.title
              : row.title;

          const time =
            row.label ||
            row.time ||
            `${row.start || ""}–${row.end || ""}`;

          const days =
            trainingPatternLabel(pattern);

          const value =
            `${row.title} — ${days} — ${time}`;

          return [
            value,
            {
              value,
              label: `${title} · ${time}`
            }
          ];
        })
      ).values()
    );

  if (choices.length > 1) {
    addOption(
      preferredClassTime,
      "",
      translated(
        "Select a valid class time",
        "Selecciona un horario válido"
      )
    );
  }

  choices.forEach((choice) => {
    addOption(
      preferredClassTime,
      choice.value,
      choice.label,
      choices.length === 1 ||
      choice.value === previous
    );
  });
}

function updateGuidance() {
  if (!trainingScheduleGuidance) return;

  const interestType =
    selectedInterestType();

  if (
    !athleteAge?.value ||
    (
      interestType !== "fitness" &&
      !programInterest?.value
    )
  ) {
    trainingScheduleGuidance.textContent =
      translated(
        "Select the athlete’s age and program, then choose the preferred training days.",
        "Selecciona la edad y el programa, y después elige los días preferidos."
      );

    return;
  }

  if (
    preferredPlan?.value === "plus-4-6"
  ) {
    trainingScheduleGuidance.textContent =
      translated(
        "Choose the regular schedule that works best as the starting point. Management will confirm the additional Plus Plan days.",
        "Elige el horario regular que funcione mejor como punto de partida. Administración confirmará los días adicionales del Plan Plus."
      );

    return;
  }

  trainingScheduleGuidance.textContent =
    translated(
      "Choose the regular training days that work best. The matching class time will appear below.",
      "Elige los días regulares que funcionen mejor. El horario correspondiente aparecerá abajo."
    );
}

function refresh() {
  localizeStaticOptions();
  updateGuidance();
  updateClassTime();
}

function updateScheduleLinks() {
  const id =
    getLocationId();

  const href =
    id
      ? `/locations/${id}/schedule.html`
      : "/schedule/";

  [
    "interestScheduleLink",
    "interestScheduleLinkEs"
  ].forEach((id) => {
    const link =
      document.getElementById(id);

    if (link) link.href = href;
  });
}

async function loadSchedule() {
  updateScheduleLinks();
  refresh();

  const id =
    getLocationId();

  if (!id) {
    scheduleLoaded = false;
    return;
  }

  try {
    const schedule =
      await loadPublishedLocationSchedule(
        db,
        id
      );

    publishedRows =
      schedule.status === "published"
        ? schedule.weekly
        : [];

    scheduleLoaded =
      schedule.status === "published";
  } catch (error) {
    console.error(
      "[interest-schedule] load failed",
      error
    );

    publishedRows = [];
    scheduleLoaded = false;
  }

  refresh();
}

[
  athleteAge,
  programInterest,
  preferredDiscipline,
  preferredPlan
]
  .filter(Boolean)
  .forEach((field) => {
    ["input", "change"].forEach(
      (eventName) => {
        field.addEventListener(
          eventName,
          () => queueMicrotask(refresh)
        );
      }
    );
  });

interestTypeInputs.forEach((input) => {
  input.addEventListener(
    "change",
    () => queueMicrotask(refresh)
  );
});

preferredTrainingPattern
  ?.addEventListener(
    "change",
    refresh
  );

document
  .querySelectorAll(
    "[data-set-language]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => queueMicrotask(refresh)
    );
  });

loadSchedule();
