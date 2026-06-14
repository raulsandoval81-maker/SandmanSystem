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
                message: `${athleteName}'s training attendance has been recorded.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.DAILY_GRIND_LOGGED: {
            const amount = Number(input.amount || 0);
            let message = `${athleteName} earned +${amount} XP today.`;
            if (amount >= 15) {
                message =
                    `${athleteName} earned +15 XP today for Full-Time Grind and Overtime effort.`;
            }
            else if (amount >= 10) {
                message =
                    `${athleteName} earned +10 XP today for Full-Time Grind.`;
            }
            else {
                message =
                    `${athleteName} earned +5 XP today for Part-Time Grind.`;
            }
            return {
                title: "Daily Grind Logged",
                message,
            };
        }
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.XP_MILESTONE: {
            const stripe = Number(input.stripeCount || 0);
            let note = "Progress is being earned.";
            if (stripe === 1) {
                note = "The climb has begun.";
            }
            else if (stripe === 2) {
                note = "Momentum is building.";
            }
            else if (stripe === 3) {
                note = "Testing is within reach.";
            }
            return {
                title: "XP Milestone • Stripe Earned",
                message: `${athleteName} earned Stripe ${stripe}.\n\n${note}`,
            };
        }
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEMPLE_ENTERED:
            return {
                title: "Temple Watch",
                message: `${athleteName} has entered Temple Watch.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TESTING_ELIGIBLE:
            return {
                title: "Testing Eligible",
                message: `${athleteName} has earned all 4 required stripes and is now eligible for testing.\n\nEvery step was earned.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_SCHEDULED:
            return {
                title: "Testing Scheduled",
                message: `${athleteName} has been scheduled for testing${input.testingDate ? ` on ${input.testingDate}` : ""}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_DAY:
            return {
                title: "Test Day",
                message: `${athleteName} tests today. Please arrive prepared and on time.`,
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
                message: `${athleteName} has entered a 5-day cooldown period following successful testing.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.PROMOTED:
            return {
                title: "Promotion Earned",
                message: `${athleteName} advanced${input.nextTier ? ` to ${input.nextTier}` : ""}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_FAILED:
            return {
                title: "Additional Preparation Required",
                message: `${athleteName} completed testing. Additional preparation has been assigned before the next attempt.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_FREEZE:
            return {
                title: "Preparation Period Started",
                message: `${athleteName} has entered a preparation period before the next testing opportunity.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.RETEST_READY:
            return {
                title: "Retest Ready",
                message: `${athleteName} is ready for the next testing opportunity.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.COACH_NOTE:
            return {
                title: "Coach Note",
                message: input.note ||
                    `A coach note has been added for ${athleteName}.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.DECAY_WARNING:
            return {
                title: "Decay Warning",
                message: `${athleteName} has received a decay warning. Requirements should be addressed to avoid additional consequences.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.DECAY_POINTS:
            return {
                title: "Decay Points Applied",
                message: `${athleteName} has received decay points as part of the accountability system.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.PROGRAM_FROZEN:
            return {
                title: "Program Frozen",
                message: `${athleteName}'s progression is currently frozen while requirements are resolved.`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.MINOR_INFRACTION:
            return {
                title: "Minor Infraction",
                message: `${athleteName} received a minor infraction (-25 XP).`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.SEMI_MAJOR_INFRACTION:
            return {
                title: "Semi-Major Infraction",
                message: `${athleteName} received a semi-major infraction (-100 XP).`,
            };
        case parentSignalTypes_1.PARENT_SIGNAL_TYPES.MAJOR_INFRACTION:
            return {
                title: "Major Infraction",
                message: `${athleteName} received a major infraction (-200 XP).`,
            };
        default:
            return {
                title: "Parent Update",
                message: `${athleteName} has a new update.`,
            };
    }
}
