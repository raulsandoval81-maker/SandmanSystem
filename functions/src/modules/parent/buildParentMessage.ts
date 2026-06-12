import {
  PARENT_SIGNAL_TYPES,
  ParentSignalType
} from "./parentSignalTypes";

type BuildParentMessageInput = {
  type: ParentSignalType;
  athleteName?: string;
  testingDate?: string;
  nextTier?: string;
  note?: string;
};

export function buildParentMessage(
  input: BuildParentMessageInput
) {
  const athleteName =
    input.athleteName || "Your athlete";

  switch (input.type) {
    case PARENT_SIGNAL_TYPES.TEST_SCHEDULED:
      return {
        title: "Testing Scheduled",
        message:
          `${athleteName} has been scheduled for testing${
            input.testingDate ? ` on ${input.testingDate}` : ""
          }.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_STARTED:
      return {
        title: "Testing Started",
        message:
          `${athleteName} has begun the testing process.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_PASSED:
      return {
        title: "Testing Passed",
        message:
          `${athleteName} completed testing successfully.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_FAILED:
      return {
        title: "Additional Preparation Required",
        message:
          `${athleteName} completed testing. Additional preparation has been assigned before the next attempt.`,
      };

    case PARENT_SIGNAL_TYPES.PROMOTED:
      return {
        title: "Promotion Earned",
        message:
          `${athleteName} advanced${
            input.nextTier ? ` to ${input.nextTier}` : ""
          }.`,
      };

    case PARENT_SIGNAL_TYPES.ATTENDANCE_LOGGED:
      return {
        title: "Attendance Recorded",
        message:
          `${athleteName}'s attendance has been recorded.`,
      };

    case PARENT_SIGNAL_TYPES.COACH_NOTE:
      return {
        title: "Coach Note",
        message:
          input.note ||
          `A coach note has been added for ${athleteName}.`,
      };

    case PARENT_SIGNAL_TYPES.FREEZE_WARNING:
      return {
        title: "Progress Freeze Warning",
        message:
          `${athleteName} may need attention before progress is paused.`,
      };

    case PARENT_SIGNAL_TYPES.LEVEL_READY:
      return {
        title: "Ready for Next Step",
        message:
          `${athleteName} is ready for the next level step.`,
      };

    default:
      return {
        title: "Parent Update",
        message:
          `${athleteName} has a new update.`,
      };
  }
}