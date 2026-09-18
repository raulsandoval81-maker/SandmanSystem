export const DISCIPLINE_LABELS = Object.freeze({
  wrestling: "Wrestling",
  boxing: "Boxing",
  "muay-thai": "Muay Thai",
  mma: "MMA",
  "submission-grappling": "Submission Grappling",
  fitness: "Fitness"
});

export function normalizeDisciplineId(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

  if (
    raw === "kickbox" ||
    raw === "kickboxing" ||
    raw === "muaythai" ||
    raw === "muay-thai"
  ) {
    return "muay-thai";
  }

  return raw;
}

/*
  Sandman program architecture

  Zero2Hero = program family

  Zero2Hero
    ├─ Road2Champion
    │   └─ eligible discipline programs
    │
    └─ Path2Legend
        └─ eligible discipline programs

  Journey eligibility is broader than any one academy's
  current offering. Location policy determines which
  eligible programs are actually available at an academy.

  Legacy values such as zero2hero-kickboxing remain
  compatibility/routing identifiers and are not the
  conceptual Journey or discipline name.
*/

export const PROGRAM_FAMILIES = Object.freeze({
  zero2hero: Object.freeze({
    id: "zero2hero",
    label: "Sandman Zero2Hero™",
    journeys: Object.freeze([
      "road2champion",
      "path2legend"
    ])
  })
});

export const JOURNEY_LABELS = Object.freeze({
  road2champion: "Road2Champion™",
  path2legend: "Path2Legend™",
  quest2mastery: "Quest2Mastery™"
});

export const JOURNEY_DISCIPLINES = Object.freeze({
  road2champion: Object.freeze([
    "wrestling",
    "boxing",
    "muay-thai"
  ]),

  path2legend: Object.freeze([
    "wrestling",
    "boxing",
    "muay-thai"
  ]),

  /*
    Quest2Mastery remains separate until its
    program-family placement is explicitly established.
  */
  quest2mastery: Object.freeze([
    "mma",
    "submission-grappling"
  ])
});

export function normalizeJourneyId(value = "") {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll(" ", "");

  const aliases = {
    road2champion: "road2champion",
    r2c: "road2champion",

    path2legend: "path2legend",
    p2l: "path2legend",

    quest2mastery: "quest2mastery",
    q2m: "quest2mastery"
  };

  return aliases[raw] || raw;
}

export function disciplinesForJourney(journey = "") {
  return (
    JOURNEY_DISCIPLINES[
      normalizeJourneyId(journey)
    ] || []
  );
}

export const LOCATION_JOURNEY_DISCIPLINES = Object.freeze({
  "santa-ynez-valley": Object.freeze({
    road2champion: Object.freeze([
      "wrestling",
      "muay-thai"
    ]),

    path2legend: Object.freeze([
      "wrestling",
      "boxing"
    ])
  })
});

export function disciplinesForLocationJourney(
  locationId = "",
  journey = ""
) {
  const journeyId = normalizeJourneyId(journey);
  const eligible = disciplinesForJourney(journeyId);

  const locationKey = String(locationId || "")
    .trim()
    .toLowerCase();

  const offered =
    LOCATION_JOURNEY_DISCIPLINES[
      locationKey
    ]?.[journeyId];

  if (!offered) {
    return eligible;
  }

  const offeredSet = new Set(offered);

  return eligible.filter((id) =>
    offeredSet.has(id)
  );
}

export function disciplineLabel(value = "") {
  const id = normalizeDisciplineId(value);
  return DISCIPLINE_LABELS[id] || id;
}

export function journeyLabel(value = "") {
  const id = normalizeJourneyId(value);
  return JOURNEY_LABELS[id] || id;
}
