export const RECOVERY_DAYS_REQUIRED = 2;

function clean(value) {
  return String(value ?? "").trim();
}

export function resolveQualifyingRecoveryPractice({ decay = {}, practiceKey = "", qualifies = false } = {}) {
  const state = clean(decay.state).toUpperCase();
  const key = clean(practiceKey);
  const recoveryLog = [...new Set(
    (Array.isArray(decay.recoveryLog) ? decay.recoveryLog : []).map(clean).filter(Boolean)
  )];
  const rawCompleted = Number(decay.recoveryDaysCompleted || 0);
  const completedBefore = Number.isFinite(rawCompleted)
    ? Math.min(RECOVERY_DAYS_REQUIRED, Math.max(0, Math.floor(rawCompleted)))
    : 0;
  const duplicate = Boolean(key && recoveryLog.includes(key));
  const counts = state === "DECAY_ACTIVE" && qualifies && Boolean(key) && !duplicate;
  const completedAfter = counts
    ? Math.min(RECOVERY_DAYS_REQUIRED, completedBefore + 1)
    : completedBefore;
  return Object.freeze({
    counts,
    duplicate,
    completedBefore,
    completedAfter,
    recoveryDaysRequired: RECOVERY_DAYS_REQUIRED,
    clearsRecoveryLock: counts && completedAfter === RECOVERY_DAYS_REQUIRED,
    recoveryLogAfter: counts ? [...recoveryLog, key] : recoveryLog,
  });
}
