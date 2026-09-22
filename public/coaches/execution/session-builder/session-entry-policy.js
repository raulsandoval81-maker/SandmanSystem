export const SESSION_ENTRY_MODES = Object.freeze([
  "checked-in",
  "hybrid",
  "manual",
  "quick"
]);

export const SESSION_ROOMS = Object.freeze([
  Object.freeze({
    value: "lompoc-mat-1",
    roomId: "mat-1",
    locationId: "lompoc",
    label: "Lompoc Mat 1"
  }),
  Object.freeze({
    value: "solvang-mat-1",
    roomId: "mat-1",
    locationId: "santa-ynez-valley",
    label: "Solvang Mat 1"
  })
]);

export const SESSION_PROGRAMS = Object.freeze([
  Object.freeze({
    programId: "manual-build",
    label: "Manual Coach Build",
    groupLabel: "MANUAL BUILD",
    discipline: "coach-built",
    journey: "MANUAL",
    ageBand: "All",
    allowedLocationIds: ["lompoc", "santa-ynez-valley"],
    foundry: "Manual",
    track: "Manual Build",
    manual: true,
    hybrid: false,
    hybridModelPrefix: ""
  }),
  Object.freeze({
    programId: "youth-z2h-wrestling",
    label: "Road2Champion Wrestling",
    groupLabel: "Youth · Road2Champion · Ages 7–13",
    discipline: "wrestling",
    journey: "Z2H",
    ageBand: "Youth 7–13",
    allowedLocationIds: ["santa-ynez-valley"],
    foundry: "Foundry 8",
    track: "Foundry 8",
    manual: true,
    hybrid: false,
    hybridModelPrefix: "/assets/js/hybrid/youth/youth-zero-to-hero-wrestling"
  }),
  Object.freeze({
    programId: "youth-z2h-muay-thai",
    label: "Road2Champion Muay Thai",
    groupLabel: "Youth · Road2Champion · Ages 7–13",
    discipline: "muay-thai",
    journey: "Z2H",
    ageBand: "Youth 7–13",
    allowedLocationIds: ["santa-ynez-valley"],
    foundry: "Foundry 8",
    track: "Foundry 8",
    manual: true,
    hybrid: false,
    hybridModelPrefix: ""
  }),
  Object.freeze({
    programId: "teen-p2l-wrestling",
    label: "Path2Legend Wrestling",
    groupLabel: "Teen · Path2Legend · Ages 14+",
    discipline: "wrestling",
    journey: "P2L",
    ageBand: "Teen 14+",
    allowedLocationIds: ["santa-ynez-valley"],
    foundry: "Foundry 4",
    track: "Foundry 4",
    manual: true,
    hybrid: true,
    hybridModelPrefix: "/assets/js/hybrid/teen/teen-path-to-legend-wrestling"
  }),
  Object.freeze({
    programId: "teen-p2l-boxing",
    label: "Path2Legend Boxing",
    groupLabel: "Teen · Path2Legend · Ages 14+",
    discipline: "boxing",
    journey: "P2L",
    ageBand: "Teen 14+",
    allowedLocationIds: ["santa-ynez-valley"],
    foundry: "Foundry 4",
    track: "Foundry 4",
    manual: true,
    hybrid: true,
    hybridModelPrefix: "/assets/js/hybrid/teen/teen-path-to-legend-boxing"
  }),
  Object.freeze({
    programId: "adult-q2m-mma",
    label: "Quest2Mastery MMA",
    groupLabel: "Adult · Quest2Mastery · Ages 16+",
    discipline: "mma",
    journey: "Q2M",
    ageBand: "Adult 16+",
    allowedLocationIds: [],
    foundry: "Foundry 4",
    track: "Foundry 4",
    manual: true,
    hybrid: false,
    hybridModelPrefix: "/assets/js/hybrid/adult/adult-quest-to-mastery-mma"
  }),
  Object.freeze({
    programId: "fitness-striking",
    label: "Striking Fitness · Self-Defense",
    groupLabel: "Teen/Adult Fitness · Ages 12+",
    discipline: "striking",
    journey: "",
    ageBand: "Teen/Adult 12+",
    allowedLocationIds: ["santa-ynez-valley"],
    foundry: "Fitness",
    track: "Fitness",
    manual: true,
    hybrid: false,
    hybridModelPrefix: ""
  })
]);

export function roomByValue(value) {
  return SESSION_ROOMS.find((room) => room.value === String(value || "")) || null;
}

export function programById(programId) {
  return SESSION_PROGRAMS.find((program) => program.programId === String(programId || "")) || null;
}

export function programsForLocation(locationId) {
  const canonical = String(locationId || "").trim().toLowerCase();
  return SESSION_PROGRAMS.filter((program) => program.allowedLocationIds.includes(canonical));
}

export function normalizeExecutionMode(value, fallback = "manual") {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "auto") {
    throw new Error("Auto session planning is not available yet.");
  }
  return SESSION_ENTRY_MODES.includes(mode) ? mode : fallback;
}

export function attendanceParticipants(attendance = {}) {
  const source = Array.isArray(attendance.checkedIn) ? attendance.checkedIn : [];
  const seen = new Set();
  return source.flatMap((athlete = {}) => {
    const athleteId = String(athlete.id || athlete.uid || "").trim();
    if (!athleteId || seen.has(athleteId)) return [];
    seen.add(athleteId);
    return [{
      athleteId,
      name: String(athlete.name || athlete.publicName || athlete.fullName || athleteId).trim(),
      journey: String(athlete.journey || athlete.program || "").trim(),
      tier: String(athlete.tier || "").trim(),
      rank: String(athlete.rank || "").trim(),
      status: "checked-in",
      checkedInAt: athlete.checkedInAt || null
    }];
  });
}

export function attendanceRankSummary(attendance = {}) {
  const counts = new Map();
  attendanceParticipants(attendance).forEach((athlete) => {
    const label = athlete.rank || athlete.tier || "Rank unavailable";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
