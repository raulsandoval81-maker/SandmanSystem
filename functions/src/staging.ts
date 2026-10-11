import * as admin from "firebase-admin";

admin.initializeApp();

// The isolated staging deployment exposes only the supervised Wrestling
// callable plus the canonical practice lifecycle needed for end-to-end
// staging validation. Production continues to use src/index.ts unchanged.
export { skillCheckCoachCall } from "./modules/skillCheckCoachCall";

export {
  openPracticeSession,
  createOrRecoverCanonicalPractice,
  getPracticeAttendanceReview,
  updatePracticeCheckIn,
  finalizePracticeAttendance,
  completePracticeDailyGrind,
  savePracticeAthleteInput,
  getPracticeSession,
  closePracticeSession,
  savePracticeSessionMemory,
  saveDailyPracticeLog,
} from "./practice/practiceSessions";
