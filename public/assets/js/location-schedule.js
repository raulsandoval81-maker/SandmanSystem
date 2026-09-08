import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export const LOCATION_SCHEDULES = "paraSchedule";
export const LOCATION_SCHEDULE_DRAFTS = "paraScheduleDrafts";
export const LOCATION_IDS = Object.freeze([
  "santa-ynez-valley",
  "lompoc",
  "elk-grove",
]);

export const LOCATION_NAMES = Object.freeze({
  "santa-ynez-valley": "Santa Ynez Valley",
  lompoc: "Lompoc",
  "elk-grove": "Elk Grove",
});

export const SANTA_YNEZ_VALLEY_SCHEDULE_SEED = Object.freeze({
  locationId: "santa-ynez-valley",
  locationName: "Santa Ynez Valley",
  timezone: "America/Los_Angeles",
  status: "draft",
  weekly: [
    { day: "Monday, Wednesday", title: "Kid Fit", category: "fitness", provider: "yesc", label: "4:00–5:00 PM", start: "16:00", end: "17:00", instructor: "Coach Sandoval", audience: "all", discipline: "", details: "Ages 7+." },
    { day: "Monday, Wednesday", title: "Teen Fit", category: "fitness", provider: "yesc", label: "5:00–6:00 PM", start: "17:00", end: "18:00", instructor: "Coach Sandoval", audience: "all", discipline: "", details: "Ages 13+." },
    { day: "Monday, Wednesday", title: "Combat Youth Wrestling / Grappling", category: "combat", provider: "sandman", label: "6:00–7:00 PM", start: "18:00", end: "19:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "wrestling", details: "Ages 7+." },
    { day: "Monday, Wednesday", title: "Combat Teen Wrestling / Grappling", category: "combat", provider: "sandman", label: "7:00–8:00 PM", start: "19:00", end: "20:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "wrestling", details: "Ages 14+." },
    { day: "Monday, Wednesday", title: "Combat Teen Boxing / Striking", category: "combat", provider: "sandman", label: "8:00–9:00 PM", start: "20:00", end: "21:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "boxing", details: "Ages 14+." },
    { day: "Tuesday, Thursday", title: "Combat Youth Muay Thai / Striking", category: "combat", provider: "sandman", label: "4:00–5:00 PM", start: "16:00", end: "17:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "muay-thai", details: "Ages 7+." },
    { day: "Tuesday, Thursday", title: "Combat Youth Wrestling / Grappling", category: "combat", provider: "sandman", label: "5:00–6:00 PM", start: "17:00", end: "18:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "wrestling", details: "Ages 7+." },
    { day: "Tuesday, Thursday", title: "HIIT Fit", category: "fitness", provider: "yesc", label: "6:05–6:50 PM", start: "18:05", end: "18:50", instructor: "Coach Sandoval", audience: "all", discipline: "", details: "Ages 14+. Ages 12–13 allowed only with a participating parent in the class." },
    { day: "Tuesday, Thursday", title: "Combat Teen Boxing / Striking", category: "combat", provider: "sandman", label: "7:00–8:00 PM", start: "19:00", end: "20:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "boxing", details: "Ages 14+." },
    { day: "Tuesday, Thursday", title: "Combat Teen Wrestling / Grappling", category: "combat", provider: "sandman", label: "8:00–9:00 PM", start: "20:00", end: "21:00", instructor: "Coach Sandoval", audience: "discipline", discipline: "wrestling", details: "Ages 14+." },
  ],
  events: [],
  banner: { active: false, text: "" },
});

export function normalizeLocationId(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return LOCATION_IDS.includes(normalized) ? normalized : "";
}

export function resolveScheduleLocation(record = {}, fallback = "") {
  return normalizeLocationId(
    record.locationId || record.location?.id || record.academyLocationId || fallback
  );
}

export function normalizeSchedule(data = {}, locationId = "") {
  const id = normalizeLocationId(data.locationId || locationId);
  const weeklySource = Array.isArray(data.weekly) ? data.weekly : Array.isArray(data.daily) ? data.daily : [];
  return {
    locationId: id,
    locationName: String(data.locationName || LOCATION_NAMES[id] || "Location"),
    timezone: String(data.timezone || "America/Los_Angeles"),
    status: data.status === "published" ? "published" : "unpublished",
    weekly: weeklySource.map((row) => ({
      ...row,
      category: String(row.category || row.type || "").trim().toLowerCase(),
    })),
    events: Array.isArray(data.events) ? data.events : Array.isArray(data.tournaments) ? data.tournaments : [],
    banner: data.banner && typeof data.banner === "object" ? data.banner : { active: false, text: "" },
    publishedAt: data.publishedAt || null,
  };
}

export function expandScheduleRowsByDay(rows = []) {
  const dayOrder = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return (Array.isArray(rows) ? rows : [])
    .flatMap((row) => {
      const days = String(row?.day || "")
        .split(/,|\s+&\s+/)
        .map((day) => day.trim())
        .filter(Boolean);

      return days.length
        ? days.map((day) => ({ ...row, day }))
        : [{ ...row }];
    })
    .sort((a, b) => {
      const dayDiff =
        dayOrder.indexOf(a.day) -
        dayOrder.indexOf(b.day);

      if (dayDiff) return dayDiff;

      return String(a.start || "")
        .localeCompare(String(b.start || ""));
    });
}

export function scheduleCategoryLabel(row = {}) {
  return String(row.category || row.type || "").toLowerCase() === "fitness" ? "Fitness" : "Combat";
}

export function scheduleProviderLabel(row = {}) {
  return String(row.provider || "").toLowerCase() === "yesc" ? "YESC" : "Sandman";
}

export async function loadPublishedLocationSchedule(db, locationId) {
  const id = normalizeLocationId(locationId);
  if (!id) throw new Error("A valid schedule location is required.");
  const snapshot = await getDoc(doc(db, LOCATION_SCHEDULES, id));
  if (!snapshot.exists()) return normalizeSchedule({}, id);
  const schedule = normalizeSchedule(snapshot.data() || {}, id);
  return schedule.status === "published" ? schedule : normalizeSchedule({}, id);
}

const SCHEDULE_DISCIPLINE_ALIASES = Object.freeze({
  bjj: "submission-grappling",
  grappling: "submission-grappling",
  submission: "submission-grappling",
  submissiongrappling: "submission-grappling",
  muaythai: "muay-thai",
});

export function normalizeScheduleDiscipline(value = "") {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

  return SCHEDULE_DISCIPLINE_ALIASES[key] || key;
}

export function getAthleteScheduleDisciplineIds(athlete = {}) {
  const disciplineMap =
    athlete.disciplines &&
    typeof athlete.disciplines === "object" &&
    !Array.isArray(athlete.disciplines)
      ? Object.keys(athlete.disciplines)
      : [];

  const legacyDisciplineArray =
    Array.isArray(athlete.disciplines)
      ? athlete.disciplines
      : [];

  const raw = [
    ...(Array.isArray(athlete.disciplineIds) ? athlete.disciplineIds : []),
    ...disciplineMap,
    ...legacyDisciplineArray,
    athlete.activeDiscipline,
    athlete.primaryDiscipline,
    athlete.discipline,
    athlete.art,
    athlete.sport,
    athlete.trackDiscipline,
  ];

  const normalized = new Set(
    raw.map(normalizeScheduleDiscipline).filter(Boolean)
  );

  if (
    normalized.has("muay-thai") ||
    normalized.has("kickboxing")
  ) {
    normalized.add("muay-thai");
    normalized.add("kickboxing");
  }

  return normalized;
}

export function filterScheduleForAthlete(schedule, athlete = null) {
  if (!athlete) return schedule;

  const disciplineIds = getAthleteScheduleDisciplineIds(athlete);

  const visible = (item) => {
    if (item?.audience !== "discipline" || !item?.discipline) {
      return true;
    }

    const discipline = normalizeScheduleDiscipline(item.discipline);

    if (
      discipline === "muay-thai" ||
      discipline === "kickboxing"
    ) {
      return (
        disciplineIds.has("muay-thai") ||
        disciplineIds.has("kickboxing")
      );
    }

    return disciplineIds.has(discipline);
  };

  return {
    ...schedule,
    weekly: schedule.weekly.filter(visible),
    events: schedule.events.filter(visible),
  };
}
