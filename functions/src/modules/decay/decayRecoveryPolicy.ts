export const RECOVERY_DAYS_REQUIRED = 2;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function uniqueRecoveryKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(clean).filter(Boolean))];
}

export function normalizeRecoveryProgress(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(RECOVERY_DAYS_REQUIRED, Math.floor(parsed));
}

export function resolveQualifyingRecoveryPractice(args: {
  decay: any;
  practiceKey: string;
  qualifies: boolean;
}) {
  const state = clean(args.decay?.state).toUpperCase();
  const practiceKey = clean(args.practiceKey);
  const recoveryLog = uniqueRecoveryKeys(args.decay?.recoveryLog);
  const completedBefore = normalizeRecoveryProgress(args.decay?.recoveryDaysCompleted);
  const duplicate = Boolean(practiceKey && recoveryLog.includes(practiceKey));
  const counts = state === "DECAY_ACTIVE" && args.qualifies && Boolean(practiceKey) && !duplicate;
  const completedAfter = counts
    ? Math.min(RECOVERY_DAYS_REQUIRED, completedBefore + 1)
    : completedBefore;
  return Object.freeze({
    counts,
    duplicate,
    suppressCombatXp: state === "DECAY_ACTIVE" && args.qualifies,
    completedBefore,
    completedAfter,
    recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
    clearsRecoveryLock: counts && completedAfter === RECOVERY_DAYS_REQUIRED,
    recoveryLogAfter: counts ? [...recoveryLog, practiceKey] : recoveryLog,
  });
}

export function shouldSuppressCombatAwardForRecovery(args: {
  decay: any;
  awardKind: string;
  attendanceSessionId?: string;
}) {
  const kind = clean(args.awardKind).toUpperCase();
  if (kind === "STRENGTH" || kind === "HONOR") return false;
  const state = clean(args.decay?.state).toUpperCase();
  if (state === "DECAY_ACTIVE") return true;
  if (state !== "CLEAR" || kind !== "ATTENDANCE") return false;
  const sessionId = clean(args.attendanceSessionId);
  return Boolean(sessionId)
    && sessionId === clean(args.decay?.recoveryCompletedAttendanceSessionId);
}

export function hasCanonicalRecoveryEvidence(decay: any): boolean {
  return normalizeRecoveryProgress(decay?.recoveryDaysCompleted) >= RECOVERY_DAYS_REQUIRED
    && uniqueRecoveryKeys(decay?.recoveryLog).length >= RECOVERY_DAYS_REQUIRED;
}
