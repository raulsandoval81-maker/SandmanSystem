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

let publishedSchedule = null;
let scheduleState = "loading";

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

function locationId() {
  return clean(
    new URLSearchParams(
      window.location.search
    ).get("location")
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
  { selected = false } = {}
) {
  const option =
    document.createElement("option");

  option.value = value;
  option.textContent = label;
  option.selected = selected;

  select.appendChild(option);

  return option;
}

function rowDays(row = {}) {
  return clean(row.day)
    .split(/,|\s+&\s+/)
    .map((day) => clean(day))
    .filter(Boolean);
}

function patternValue(row = {}) {
  return rowDays(row)
    .map((day) =>
      day
        .toLowerCase()
        .replace(/[^a-z]+/g, "-")
        .replace(/^-|-$/g, "")
    )
    .join("-");
}

function patternLabel(row = {}) {
  return rowDays(row).join(" + ");
}

function rowAgeRange(row = {}) {
  let min = Number(
    row.minAge ??
    row.ageMin
  );

  let max = Number(
    row.maxAge ??
    row.ageMax
  );

  if (!Number.isFinite(min)) min = null;
  if (!Number.isFinite(max)) max = null;

  const title =
    clean(row.title).toLowerCase();

  const details =
    clean(row.details);

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

  if (title.includes("youth")) {
    if (min === null) min = 7;
    if (max === null) max = 13;
  }

  if (title.includes("teen")) {
    if (min === null) {
      min = String(row.category).toLowerCase() ===
        "fitness"
        ? 13
        : 14;
    }
  }

  if (
    title.includes("kid fit") &&
    max === null
  ) {
    max = 12;
  }

  return { min, max };
}

function rowMatchesAge(
  row,
  age
) {
  if (!Number.isFinite(age)) {
    return false;
  }

  const { min, max } =
    rowAgeRange(row);

  if (min !== null && age < min) {
    return false;
  }

  if (max !== null && age > max) {
    return false;
  }

  return true;
}

function matchingRows() {
  if (
    !publishedSchedule ||
    publishedSchedule.status !== "published"
  ) {
    return [];
  }

  const age =
    Number(athleteAge?.value);

  if (!Number.isFinite(age)) {
    return [];
  }

  const interestType =
    selectedInterestType();

  const selectedDiscipline =
    normalizeScheduleDiscipline(
      preferredDiscipline?.value || ""
    );

  return publishedSchedule.weekly.filter(
    (row) => {
      const category =
        clean(
          row.category ||
          row.type
        ).toLowerCase();

      if (!rowMatchesAge(row, age)) {
        return false;
      }

      if (interestType === "fitness") {
        return category === "fitness";
      }

      if (category !== "combat") {
        return false;
      }

      const rowDiscipline =
        normalizeScheduleDiscipline(
          row.discipline || ""
        );

      if (!selectedDiscipline) {
        return false;
      }

      if (
        ["muay-thai", "kickboxing"].includes(
          selectedDiscipline
        )
      ) {
        return [
          "muay-thai",
          "kickboxing"
        ].includes(rowDiscipline);
      }

      return rowDiscipline ===
        selectedDiscipline;
    }
  );
}

function localizePlanOptions() {
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
}

function updateClassTimes() {
  if (!preferredClassTime) return;

  const previous =
    preferredClassTime.value;

  preferredClassTime.innerHTML = "";

  const pattern =
    preferredTrainingPattern?.value || "";

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
      { selected: true }
    );

    return;
  }

  const rows =
    matchingRows().filter(
      (row) =>
        patternValue(row) === pattern
    );

  if (!rows.length) {
    addOption(
      preferredClassTime,
      "management-confirmation",
      translated(
        "Management will confirm availability",
        "Administración confirmará disponibilidad"
      ),
      { selected: true }
    );

    return;
  }

  const choices =
    rows.map((row) => {
      const title =
        language() === "es"
          ? row.titleEs || row.title
          : row.title;

      const time =
        row.label ||
        row.time ||
        `${row.start || ""}–${row.end || ""}`;

      return {
        value:
          `${row.title} — ${row.day} — ${time}`,
        label:
          `${title} · ${time}`
      };
    });

  const unique =
    Array.from(
      new Map(
        choices.map(
          (choice) => [
            choice.value,
            choice
          ]
        )
      ).values()
    );

  if (unique.length > 1) {
    addOption(
      preferredClassTime,
      "",
      translated(
        "Select a valid class time",
        "Selecciona un horario válido"
      )
    );
  }

  unique.forEach((choice) => {
    addOption(
      preferredClassTime,
      choice.value,
      choice.label,
      {
        selected:
          unique.length === 1 ||
          choice.value === previous
      }
    );
  });
}

function setGuidance(rows) {
  if (!trainingScheduleGuidance) return;

  if (scheduleState === "loading") {
    trainingScheduleGuidance.textContent =
      translated(
        "Loading the current published schedule…",
        "Cargando el horario publicado actual…"
      );

    return;
  }

  if (scheduleState === "unavailable") {
    trainingScheduleGuidance.textContent =
      translated(
        "The current schedule could not be loaded. Management will help confirm availability.",
        "No se pudo cargar el horario actual. Administración ayudará a confirmar la disponibilidad."
      );

    return;
  }

  if (
    !athleteAge?.value ||
    (
      selectedInterestType() !== "fitness" &&
      !programInterest?.value
    )
  ) {
    trainingScheduleGuidance.textContent =
      translated(
        "Available days will appear after the athlete’s age and program are selected.",
        "Los días disponibles aparecerán después de seleccionar la edad y el programa."
      );

    return;
  }

  if (!rows.length) {
    trainingScheduleGuidance.textContent =
      translated(
        "No published class currently matches these selections. Choose “Help me choose” and Management will review the request.",
        "Ninguna clase publicada coincide actualmente. Elige “Ayúdame a elegir” y Administración revisará la solicitud."
      );

    return;
  }

  trainingScheduleGuidance.textContent =
    preferredPlan?.value === "plus-4-6"
      ? translated(
          "Choose the published class schedule that will anchor the Plus Plan. Management will confirm the additional training days.",
          "Elige el horario publicado que servirá como base del Plan Plus. Administración confirmará los días adicionales."
        )
      : translated(
          "Choose the published training days that work best. The matching class time will appear below.",
          "Elige los días publicados que funcionen mejor. El horario correspondiente aparecerá abajo."
        );
}

function updateScheduleChoices() {
  localizePlanOptions();

  if (
    !preferredTrainingPattern
  ) {
    return;
  }

  const previous =
    preferredTrainingPattern.value;

  const rows =
    matchingRows();

  preferredTrainingPattern.innerHTML = "";

  addOption(
    preferredTrainingPattern,
    "",
    translated(
      "Select available training days",
      "Selecciona días disponibles"
    )
  );

  const patterns =
    Array.from(
      new Map(
        rows
          .filter((row) =>
            patternValue(row)
          )
          .map((row) => [
            patternValue(row),
            patternLabel(row)
          ])
      ).entries()
    );

  patterns.forEach(
    ([value, label]) => {
      addOption(
        preferredTrainingPattern,
        value,
        label,
        { selected: value === previous }
      );
    }
  );

  addOption(
    preferredTrainingPattern,
    "not-sure",
    translated(
      "Not sure — help me choose",
      "No estoy seguro — ayúdame a elegir"
    ),
    {
      selected:
        previous === "not-sure" ||
        (
          !patterns.length &&
          scheduleState !== "loading"
        )
    }
  );

  setGuidance(rows);
  updateClassTimes();
}

function updateScheduleLinks() {
  const id =
    locationId();

  const href =
    id
      ? `/locations/${id}/schedule.html`
      : "/schedule/";

  [
    document.getElementById(
      "interestScheduleLink"
    ),
    document.getElementById(
      "interestScheduleLinkEs"
    )
  ].forEach((link) => {
    if (link) link.href = href;
  });
}

async function loadSchedule() {
  updateScheduleLinks();

  const id =
    locationId();

  if (!id) {
    scheduleState = "unavailable";
    updateScheduleChoices();
    return;
  }

  scheduleState = "loading";
  updateScheduleChoices();

  try {
    publishedSchedule =
      await loadPublishedLocationSchedule(
        db,
        id
      );

    scheduleState =
      publishedSchedule.status === "published"
        ? "ready"
        : "unavailable";
  } catch (error) {
    console.error(
      "[interest-schedule] load failed",
      error
    );

    publishedSchedule = null;
    scheduleState = "unavailable";
  }

  updateScheduleChoices();
}

[
  athleteAge,
  programInterest,
  preferredDiscipline,
  preferredPlan
]
  .filter(Boolean)
  .forEach((field) => {
    field.addEventListener(
      "change",
      () => queueMicrotask(
        updateScheduleChoices
      )
    );

    field.addEventListener(
      "input",
      () => queueMicrotask(
        updateScheduleChoices
      )
    );
  });

interestTypeInputs.forEach((input) => {
  input.addEventListener(
    "change",
    () => queueMicrotask(
      updateScheduleChoices
    )
  );
});

preferredTrainingPattern
  ?.addEventListener(
    "change",
    updateClassTimes
  );

document
  .querySelectorAll(
    "[data-set-language]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => queueMicrotask(
        updateScheduleChoices
      )
    );
  });

loadSchedule();
