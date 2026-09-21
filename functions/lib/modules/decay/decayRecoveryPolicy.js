"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_DAYS_REQUIRED = void 0;
exports.uniqueRecoveryKeys = uniqueRecoveryKeys;
exports.normalizeRecoveryProgress = normalizeRecoveryProgress;
exports.resolveQualifyingRecoveryPractice = resolveQualifyingRecoveryPractice;
exports.shouldSuppressCombatAwardForRecovery = shouldSuppressCombatAwardForRecovery;
exports.hasCanonicalRecoveryEvidence = hasCanonicalRecoveryEvidence;
exports.RECOVERY_DAYS_REQUIRED = 2;
function clean(value) {
    return String(value ?? "").trim();
}
function uniqueRecoveryKeys(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.map(clean).filter(Boolean))];
}
function normalizeRecoveryProgress(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 0;
    return Math.min(exports.RECOVERY_DAYS_REQUIRED, Math.floor(parsed));
}
function resolveQualifyingRecoveryPractice(args) {
    const state = clean(args.decay?.state).toUpperCase();
    const practiceKey = clean(args.practiceKey);
    const recoveryLog = uniqueRecoveryKeys(args.decay?.recoveryLog);
    const completedBefore = normalizeRecoveryProgress(args.decay?.recoveryDaysCompleted);
    const duplicate = Boolean(practiceKey && recoveryLog.includes(practiceKey));
    const counts = state === "DECAY_ACTIVE" && args.qualifies && Boolean(practiceKey) && !duplicate;
    const completedAfter = counts
        ? Math.min(exports.RECOVERY_DAYS_REQUIRED, completedBefore + 1)
        : completedBefore;
    return Object.freeze({
        counts,
        duplicate,
        suppressCombatXp: state === "DECAY_ACTIVE" && args.qualifies,
        completedBefore,
        completedAfter,
        recoveryDaysRequired: exports.RECOVERY_DAYS_REQUIRED,
        clearsRecoveryLock: counts && completedAfter === exports.RECOVERY_DAYS_REQUIRED,
        recoveryLogAfter: counts ? [...recoveryLog, practiceKey] : recoveryLog,
    });
}
function shouldSuppressCombatAwardForRecovery(args) {
    const kind = clean(args.awardKind).toUpperCase();
    if (kind === "STRENGTH" || kind === "HONOR")
        return false;
    const state = clean(args.decay?.state).toUpperCase();
    if (state === "DECAY_ACTIVE")
        return true;
    if (state !== "CLEAR" || kind !== "ATTENDANCE")
        return false;
    const sessionId = clean(args.attendanceSessionId);
    return Boolean(sessionId)
        && sessionId === clean(args.decay?.recoveryCompletedAttendanceSessionId);
}
function hasCanonicalRecoveryEvidence(decay) {
    return normalizeRecoveryProgress(decay?.recoveryDaysCompleted) >= exports.RECOVERY_DAYS_REQUIRED
        && uniqueRecoveryKeys(decay?.recoveryLog).length >= exports.RECOVERY_DAYS_REQUIRED;
}
