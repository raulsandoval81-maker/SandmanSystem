"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DECAY_RELAUNCH_BASELINE = exports.DECAY_RELAUNCH_REASON = exports.DECAY_RELAUNCH_ID = void 0;
exports.resolveDecayActivityAnchor = resolveDecayActivityAnchor;
exports.DECAY_RELAUNCH_ID = "2026-production-decay-relaunch";
exports.DECAY_RELAUNCH_REASON = "2026 production decay relaunch";
exports.DECAY_RELAUNCH_BASELINE = new Date("2026-09-23T07:00:00.000Z");
function toDate(value) {
    if (!value)
        return null;
    if (typeof value.toDate === "function") {
        const converted = value.toDate();
        return Number.isFinite(converted.getTime()) ? converted : null;
    }
    const converted = new Date(value);
    return Number.isFinite(converted.getTime()) ? converted : null;
}
function resolveDecayActivityAnchor(athlete) {
    const baseline = toDate(athlete?.decay?.decayBaselineAt);
    if (!baseline)
        return null;
    const activity = toDate(athlete?.lastAttendanceAt || athlete?.lastCombatActivityAt);
    return activity && activity > baseline ? activity : baseline;
}
