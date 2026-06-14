export type TestingEventType =
  | "TEST_SCHEDULED"
  | "TEST_STARTED"
  | "TEST_PASSED"
  | "TEST_FAILED"
   |"RETEST_READY"
  | "PROMOTED";

export type TestingEventPayload = {
  uid: string;
  type: TestingEventType;
  score?: number | null;
  tier?: string | null;
  nextTier?: string | null;
  scheduledDate?: string | null;
  coachUid?: string | null;
  parentUid?: string | null;
  publicName?: string | null;
};