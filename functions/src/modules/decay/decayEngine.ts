export type DecayState =
  | "CLEAR"
  | "WARNING"
  | "DECAY_ACTIVE"
  | "FROZEN";

export interface DecayResult {
  state: DecayState;
  daysInactive: number;
  decayHits: number;
  decayPoints: number;
  nextDecayAtDays: number | null;
  recoveryDaysRequired: number;
  frozen: boolean;
  message: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

const WARNING_DAYS = 14;
const FIRST_DECAY_DAYS = 28;
const SECOND_DECAY_DAYS = 35;
const DECAY_INTERVAL_AFTER_SECOND = 14;

const DECAY_POINTS_PER_HIT = 25;
const FREEZE_DECAY_TOTAL = 150;

export const RECOVERY_DAYS_REQUIRED = 3;

function getDecayHits(daysInactive: number): number {
  if (daysInactive < FIRST_DECAY_DAYS) return 0;

  let hits = 1;

  if (daysInactive < SECOND_DECAY_DAYS) {
    return hits;
  }

  hits += 1;

  const extraDays =
    daysInactive - SECOND_DECAY_DAYS;

  hits += Math.floor(
    extraDays / DECAY_INTERVAL_AFTER_SECOND
  );

  return hits;
}

function getNextDecayAtDays(daysInactive: number): number | null {
  const hits = getDecayHits(daysInactive);
  const decayPoints =
    hits * DECAY_POINTS_PER_HIT;

  if (decayPoints >= FREEZE_DECAY_TOTAL) {
    return null;
  }

  if (daysInactive < FIRST_DECAY_DAYS) {
    return FIRST_DECAY_DAYS;
  }

  if (daysInactive < SECOND_DECAY_DAYS) {
    return SECOND_DECAY_DAYS;
  }

  return (
    SECOND_DECAY_DAYS +
    hits * DECAY_INTERVAL_AFTER_SECOND
  );
}

export function calculateDecay(
  lastCombatActivityAt: Date | null,
  now = new Date()
): DecayResult {
  if (!lastCombatActivityAt) {
    return {
      state: "WARNING",
      daysInactive: 999,
      decayHits: 0,
      decayPoints: 0,
      nextDecayAtDays: FIRST_DECAY_DAYS,
      recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
      frozen: false,
      message: "No verified combat activity found. Athlete needs review.",
    };
  }

  const daysInactive = Math.floor(
    (now.getTime() - lastCombatActivityAt.getTime()) / DAY_MS
  );

  const decayHits = getDecayHits(daysInactive);

  const decayPoints = Math.min(
    decayHits * DECAY_POINTS_PER_HIT,
    FREEZE_DECAY_TOTAL
  );

  if (decayPoints >= FREEZE_DECAY_TOTAL) {
    return {
      state: "FROZEN",
      daysInactive,
      decayHits,
      decayPoints,
      nextDecayAtDays: null,
      recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
      frozen: true,
      message: "Athlete frozen after reaching 150 decay points.",
    };
  }

  if (decayPoints > 0) {
    return {
      state: "DECAY_ACTIVE",
      daysInactive,
      decayHits,
      decayPoints,
      nextDecayAtDays: getNextDecayAtDays(daysInactive),
      recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
      frozen: false,
      message: `Athlete has ${decayPoints} decay points from inactivity.`,
    };
  }

  if (daysInactive >= WARNING_DAYS) {
    return {
      state: "WARNING",
      daysInactive,
      decayHits: 0,
      decayPoints: 0,
      nextDecayAtDays: FIRST_DECAY_DAYS,
      recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
      frozen: false,
      message: "Athlete inactivity warning.",
    };
  }

  return {
    state: "CLEAR",
    daysInactive,
    decayHits: 0,
    decayPoints: 0,
    nextDecayAtDays: FIRST_DECAY_DAYS,
    recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
    frozen: false,
    message: "Athlete is active.",
  };
}

export function countsAsDecayRecoveryDay(activityType: string): boolean {
  const type = String(activityType || "").toLowerCase();

  return (
    type.includes("attendance") ||
    type.includes("combat") ||
    type.includes("practice") ||
    type.includes("open_mat") ||
    type.includes("daily_grind") ||
    type.includes("tournament")
  );
}