"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildParentMessage = buildParentMessage;
const parentSignalTypes_1 = require("./parentSignalTypes");
function buildParentMessage(input) {
    const athleteName = input.athleteName || "Your athlete";
    switch (input.type) {
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.ATTENDANCE_LOGGED:
            return {
                title: "Attendance Recorded",
                message: `${athleteName}'s attendance has been recorded.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.XP_MILESTONE:
            return {
                title: "XP Milestone • Stripe Earned",
                message: `${athleteName} earned a new stripe.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TESTING_ELIGIBLE:
            return {
                title: "Testing Eligible",
                message: `${athleteName} has completed the required stripes and is eligible for testing.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_SCHEDULED:
            return {
                title: "Testing Scheduled",
                message: `${athleteName} has been scheduled for testing${input.testingDate ? ` on ${input.testingDate}` : ""}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_STARTED:
            return {
                title: "Testing Started",
                message: `${athleteName} has begun the testing process.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_PASSED:
            return {
                title: "Testing Passed",
                message: `${athleteName} completed testing successfully.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.COOLDOWN_STARTED:
            return {
                title: "Gratitude Window • 5-Day Cooldown",
                message: `${athleteName} has entered a 5-day cooldown period following successful testing. XP progression is locked and regular training is paused during this period.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_FAILED:
            return {
                title: "Additional Preparation Required",
                message: `${athleteName} completed testing. Additional preparation has been assigned before the next attempt.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.PREPARATION_WINDOW:
            return {
                title: "Preparation Window • 5-Day Minimum",
                message: `${athleteName} has entered a preparation window before the next testing opportunity. XP progression is locked, but training may continue during this period.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.PROMOTED:
            return {
                title: "Promotion Earned",
                message: `${athleteName} advanced${input.nextTier ? ` to ${input.nextTier}` : ""}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.COACH_NOTE:
            return {
                title: "Coach Note",
                message: input.note ||
                    `A coach note has been added for ${athleteName}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.FREEZE_WARNING:
            return {
                title: "Progress Freeze",
                message: `${athleteName}'s XP progression is temporarily locked. Training may continue while requirements are resolved.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.LEVEL_READY:
            return {
                title: "Ready for Next Step",
                message: `${athleteName} is ready for the next level step.`,
            };
        default:
            return {
                title: "Parent Update",
                message: `${athleteName} has a new update.`,
            };
    }
}
