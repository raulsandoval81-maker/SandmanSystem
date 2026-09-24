export const DECAY_RELAUNCH_ID = "2026-production-decay-relaunch";

export const DECAY_RELAUNCH_REASON = "2026 production decay relaunch";

export const DECAY_RELAUNCH_BASELINE = new Date("2026-09-23T07:00:00.000Z");

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(converted.getTime()) ? converted : null;
  }
  const converted = new Date(value as string | number | Date);
  return Number.isFinite(converted.getTime()) ? converted : null;
}

export function resolveDecayActivityAnchor(athlete: any): Date | null {
  const baseline = toDate(athlete?.decay?.decayBaselineAt);
  if (!baseline) return null;

  const activity = toDate(
    athlete?.lastAttendanceAt || athlete?.lastCombatActivityAt
  );
  return activity && activity > baseline ? activity : baseline;
}
