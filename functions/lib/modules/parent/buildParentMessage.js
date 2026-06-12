"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildParentMessage = buildParentMessage;
const parentSignalTypes_1 = require("./parentSignalTypes");
function buildParentMessage(input) {
    const athleteName = input.athleteName || "Your athlete";
    switch (input.type) {
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
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_FAILED:
            return {
                title: "Additional Preparation Required",
                message: `${athleteName} completed testing. Additional preparation has been assigned before the next attempt.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.PROMOTED:
            return {
                title: "Promotion Earned",
                message: `${athleteName} advanced${input.nextTier ? ` to ${input.nextTier}` : ""}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.ATTENDANCE_LOGGED:
            return {
                title: "Attendance Recorded",
                message: `${athleteName}'s attendance has been recorded.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.COACH_NOTE:
            return {
                title: "Coach Note",
                message: input.note ||
                    `A coach note has been added for ${athleteName}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.FREEZE_WARNING:
            return {
                title: "Progress Freeze Warning",
                message: `${athleteName} may need attention before progress is paused.`,
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
