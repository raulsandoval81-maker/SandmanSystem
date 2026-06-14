"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARENT_SIGNAL_TYPES = void 0;
exports.PARENT_SIGNAL_TYPES = {
    // Daily Activity
    ATTENDANCE_LOGGED: "ATTENDANCE_LOGGED",
    XP_MILESTONE: "XP_MILESTONE",
    // Testing Journey
    TEMPLE_ENTERED: "TEMPLE_ENTERED",
    TESTING_ELIGIBLE: "TESTING_ELIGIBLE",
    TEST_SCHEDULED: "TEST_SCHEDULED",
    TEST_DAY: "TEST_DAY",
    TEST_STARTED: "TEST_STARTED",
    // Successful Path
    TEST_PASSED: "TEST_PASSED",
    COOLDOWN_STARTED: "COOLDOWN_STARTED",
    PROMOTED: "PROMOTED",
    // Retest Path
    TEST_FAILED: "TEST_FAILED",
    PREPARATION_WINDOW: "PREPARATION_WINDOW",
    RETEST_READY: "RETEST_READY",
    // Communication
    COACH_NOTE: "COACH_NOTE",
    // System Status
    FREEZE_WARNING: "FREEZE_WARNING",
};
