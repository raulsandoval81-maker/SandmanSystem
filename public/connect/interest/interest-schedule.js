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

const DAY_ORDER = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

const DAY_LABELS = Object.freeze({
  monday: { en: "Monday", es: "Lunes" },
  tuesday: { en: "Tuesday", es: "Martes" },
  wednesday: { en: "Wednesday", es: "Miércoles" },
  thursday: { en: "Thursday", es: "Jueves" },
  friday: { en: "Friday", es: "Viernes" },
  saturday: { en: "Saturday", es: "Sábado" },
  sunday: { en: "Sunday", es: "Domingo" }
});

const PAIRS = Object.freeze([
  {
    value: "monday-wednesday",
    days: ["monday", "wednesday"],
    en: "Monday + Wednesday",
    es: "Lunes + Miércoles"
  },
  {
    value: "tuesday-thursday",
    days: ["tuesday", "thursday"],
    en: "Tuesday + Thursday",
    es: "Martes + Jueves"
  }
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

window.sandmanInterestScheduleOffersProgram = function (discipline, age) {
  if (scheduleState !== "ready") return true;

  const requested =
    normalizeScheduleDiscipline(discipline || "");

  const numericAge =
    Number(age);

  if (!requested || !Number.isFinite(numericAge)) {
    return false;
  }

  return rows.some((row) => {
    const category =
      clean(row.category || row.type).toLowerCase();

    if (category === "fitness") return false;

    return (
      rowMatchesAge(row, numericAge) &&
      rowMatchesDiscipline(row, requested)
    );
  });
};

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

function availableDays(candidateRows) {
  const days = new Set(
    candidateRows.flatMap(rowDays)
  );

  return DAY_ORDER.filter((day) =>
    days.has(day)
  );
}

function fullSchedulePattern(candidateRows) {
  const days = availableDays(candidateRows);

  if (days.length < 4) return null;

  const exactWeekdaySet =
    days.length === 4 &&
    ["monday", "tuesday", "wednesday", "thursday"]
      .every((day) => days.includes(day));

  return {
    value: "all-available",
    days,
    en: exactWeekdaySet
      ? "Monday–Thursday"
      : days
          .map((day) => DAY_LABELS[day]?.en || day)
          .join(" + "),
    es: exactWeekdaySet
      ? "Lunes–Jueves"
      : days
          .map((day) => DAY_LABELS[day]?.es || day)
          .join(" + ")
  };
}

function trainingPatterns(candidateRows) {
  const patterns = [...validPairs(candidateRows)];
  const full = fullSchedulePattern(candidateRows);

  if (full) patterns.push(full);

  return patterns;
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

  const patternValue =
    preferredTrainingPattern?.value || "";

  const patterns =
    trainingPatterns(candidateRows);

  const pattern =
    patterns.find(
      (item) => item.value === patternValue
    );

  const previous =
    preferredClassTime.value;

  preferredClassTime.innerHTML = "";

  if (patternValue === "not-sure") {
    addOption(
      preferredClassTime,
      "management-confirmation",
      t(
        "Management will help choose",
        "Administración ayudará a elegir"
      ),
      true
    );
    return;
  }

  if (!pattern) {
    addOption(
      preferredClassTime,
      "",
      t(
        "Select training days first",
        "Primero selecciona los días"
      )
    );
    return;
  }

  if (preferredPlan) {
    preferredPlan.value =
      pattern.days.length >= 4
        ? "plus-4-6"
        : "standard-2-3";
  }

  const groups =
    groupedClasses(candidateRows);

  if (pattern.value === "all-available") {
    const matchingGroups =
      groups.filter((group) =>
        [...group.days].some((day) =>
          pattern.days.includes(day)
        )
      );

    if (!matchingGroups.length) {
      addOption(
        preferredClassTime,
        "",
        t(
          "No published class matches these days",
          "Ninguna clase publicada coincide con estos días"
        )
      );
      return;
    }

    const segments =
      matchingGroups.map((group) => {
        const activeDays =
          DAY_ORDER.filter(
            (day) =>
              pattern.days.includes(day) &&
              group.days.has(day)
          );

        const dayLabel =
          activeDays
            .map(
              (day) =>
                DAY_LABELS[day]?.[language()] ||
                day
            )
            .join(" + ");

        return `${dayLabel} · ${group.time}`;
      });

    const title =
      language() === "es"
        ? matchingGroups[0].row.titleEs ||
          matchingGroups[0].row.title
        : matchingGroups[0].row.title;

    const value =
      `${title} — ${pattern.en}`;

    addOption(
      preferredClassTime,
      value,
      `${title} · ${segments.join(" / ")}`,
      true
    );

    return;
  }

  const matches =
    groups.filter((group) =>
      pattern.days.every((day) =>
        group.days.has(day)
      )
    );

  if (!matches.length) {
    addOption(
      preferredClassTime,
      "",
      t(
        "No published class matches these days",
        "Ninguna clase publicada coincide con estos días"
      )
    );
    return;
  }

  if (matches.length > 1) {
    addOption(
      preferredClassTime,
      "",
      t(
        "Select a class time",
        "Selecciona un horario"
      )
    );
  }

  for (const group of matches) {
    const title =
      language() === "es"
        ? group.row.titleEs ||
          group.row.title
        : group.row.title;

    const patternLabel =
      language() === "es"
        ? pattern.es
        : pattern.en;

    const value =
      `${group.row.title} — ${pattern.en} — ${group.time}`;

    addOption(
      preferredClassTime,
      value,
      `${title} · ${patternLabel} · ${group.time}`,
      matches.length === 1 ||
        value === previous
    );
  }
}

function renderDays() {
  if (!preferredTrainingPattern) return;

  const candidateRows =
    eligibleRows();

  const patterns =
    trainingPatterns(candidateRows);

  const previous =
    preferredTrainingPattern.value;

  const selected =
    previous === "not-sure"
      ? "not-sure"
      : patterns.some(
          (pattern) =>
            pattern.value === previous
        )
        ? previous
        : patterns.length === 1
          ? patterns[0].value
          : "";

  preferredTrainingPattern.innerHTML = "";

  addOption(
    preferredTrainingPattern,
    "",
    t(
      "Select one",
      "Selecciona una opción"
    ),
    !selected
  );

  for (const pattern of patterns) {
    addOption(
      preferredTrainingPattern,
      pattern.value,
      language() === "es"
        ? pattern.es
        : pattern.en,
      pattern.value === selected
    );
  }

  addOption(
    preferredTrainingPattern,
    "not-sure",
    t(
      "Not sure — help me choose",
      "No estoy seguro — ayúdame a elegir"
    ),
    selected === "not-sure"
  );

  const selectedPattern =
    patterns.find(
      (pattern) =>
        pattern.value === selected
    );

  if (preferredPlan) {
    preferredPlan.value =
      selectedPattern?.days.length >= 4
        ? "plus-4-6"
        : "standard-2-3";
  }

  if (guidance) {
    if (scheduleState === "loading") {
      guidance.textContent =
        t(
          "Loading the current schedule…",
          "Cargando el horario actual…"
        );
    } else if (scheduleState !== "ready") {
      guidance.textContent =
        t(
          "The schedule could not be loaded. Choose “Not sure” and Management will help.",
          "No se pudo cargar el horario. Elige “No estoy seguro” y Administración ayudará."
        );
    } else if (
      !Number.isFinite(
        Number(athleteAge?.value)
      ) ||
      Number(athleteAge?.value) <= 0 ||
      (
        selectedInterestType() !== "fitness" &&
        !requestedDiscipline()
      )
    ) {
      guidance.textContent =
        t(
          "Select the athlete’s age and program to see the training days currently offered for that discipline.",
          "Selecciona la edad y el programa para ver los días de entrenamiento disponibles actualmente para esa disciplina."
        );
    } else if (patterns.length === 1) {
      guidance.textContent =
        t(
          "This is the current published schedule for the selected discipline.",
          "Este es el horario publicado actualmente para la disciplina seleccionada."
        );
    } else if (patterns.length > 1) {
      guidance.textContent =
        t(
          "Choose the day pair or full class set that works best. The class time below follows the current published schedule.",
          "Elige el par de días o el conjunto completo de clases que funcione mejor. El horario de clase abajo sigue el horario publicado actualmente."
        );
    } else {
      guidance.textContent =
        t(
          "No published schedule matches this selection. Choose “Not sure” and Management will help.",
          "Ningún horario publicado coincide. Elige “No estoy seguro” y Administración ayudará."
        );
    }
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

    document.dispatchEvent(
      new CustomEvent("sandman:scheduleloaded")
    );
  } catch (error) {
    console.error("[interest-schedule] load failed", error);
    rows = [];
    scheduleState = "unavailable";
  }
  renderDays();
}

[athleteAge, programInterest, preferredDiscipline]
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

document.addEventListener(
  "sandman:languagechange",
  () => queueMicrotask(renderDays)
);

loadSchedule();
