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
    case PARENT_SIGNAL_TYPES.ATTENDANCE_LOGGED:
      return {
        title: "Daily Grind",
        message:
          `${athleteName}'s training attendance has been recorded.`,
      };

    case PARENT_SIGNAL_TYPES.XP_MILESTONE:
      return {
        title: "XP Milestone • Stripe Earned",
        message:
          `${athleteName} earned a new stripe.`,
      };

    case PARENT_SIGNAL_TYPES.TEMPLE_ENTERED:
      return {
        title: "Temple Watch",
        message:
          `${athleteName} has entered Temple Watch.`,
      };

    case PARENT_SIGNAL_TYPES.TESTING_ELIGIBLE:
      return {
        title: "Testing Eligible",
        message:
          `${athleteName} has completed the required XP and is eligible for testing.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_SCHEDULED:
      return {
        title: "Testing Scheduled",
        message:
          `${athleteName} has been scheduled for testing${
            input.testingDate ? ` on ${input.testingDate}` : ""
          }.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_DAY:
      return {
        title: "Test Day",
        message:
          `${athleteName} tests today. Please arrive prepared and on time.`,
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

    case PARENT_SIGNAL_TYPES.COOLDOWN_STARTED:
      return {
        title: "Gratitude Window • 5-Day Cooldown",
        message:
          `${athleteName} has entered a 5-day cooldown period following successful testing.`,
      };

    case PARENT_SIGNAL_TYPES.PROMOTED:
      return {
        title: "Promotion Earned",
        message:
          `${athleteName} advanced${
            input.nextTier ? ` to ${input.nextTier}` : ""
          }.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_FAILED:
      return {
        title: "Additional Preparation Required",
        message:
          `${athleteName} completed testing. Additional preparation has been assigned before the next attempt.`,
      };

    case PARENT_SIGNAL_TYPES.TEST_FREEZE:
      return {
        title: "Preparation Period Started",
        message:
          `${athleteName} has entered a preparation period before the next testing opportunity.`,
      };

    case PARENT_SIGNAL_TYPES.RETEST_READY:
      return {
        title: "Retest Ready",
        message:
          `${athleteName} is ready for the next testing opportunity.`,
      };

    case PARENT_SIGNAL_TYPES.COACH_NOTE:
      return {
        title: "Coach Note",
        message:
          input.note ||
          `A coach note has been added for ${athleteName}.`,
      };

    case PARENT_SIGNAL_TYPES.DECAY_WARNING:
      return {
        title: "Decay Warning",
        message:
          `${athleteName} has received a decay warning. Requirements should be addressed to avoid additional consequences.`,
      };

    case PARENT_SIGNAL_TYPES.DECAY_POINTS:
      return {
        title: "Decay Points Applied",
        message:
          `${athleteName} has received decay points as part of the accountability system.`,
      };

    case PARENT_SIGNAL_TYPES.PROGRAM_FROZEN:
      return {
        title: "Program Frozen",
        message:
          `${athleteName}'s progression is currently frozen while requirements are resolved.`,
      };

    case PARENT_SIGNAL_TYPES.MINOR_INFRACTION:
      return {
        title: "Minor Infraction",
        message:
          `${athleteName} received a minor infraction (-25 XP).`,
      };

    case PARENT_SIGNAL_TYPES.SEMI_MAJOR_INFRACTION:
      return {
        title: "Semi-Major Infraction",
        message:
          `${athleteName} received a semi-major infraction (-100 XP).`,
      };

    case PARENT_SIGNAL_TYPES.MAJOR_INFRACTION:
      return {
        title: "Major Infraction",
        message:
          `${athleteName} received a major infraction (-200 XP).`,
      };

    default:
      return {
        title: "Parent Update",
        message:
          `${athleteName} has a new update.`,
      };
  }
}