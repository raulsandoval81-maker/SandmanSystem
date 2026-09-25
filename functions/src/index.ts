import * as admin from "firebase-admin";

admin.initializeApp();

/* =========================
   HEALTH / DEBUG
========================= */

export { ping } from "./modules/ping";
export { testAthleteXp } from "./modules/testAthleteXp";

/* =========================
   XP SYSTEM
========================= */

export { incrementXp } from "./modules/incrementXp";
export { xpHttp } from "./modules/xpHttp";

export { promoteTier } from "./modules/promotion/promoteTierAction";
export { passAthleteTest } from "./modules/passAthleteTest";
export { freezeAthlete } from "./modules/freezeAthlete";
export { finalizeTestingSession } from "./modules/finalizeTestingSession";

export { scheduleTesting } from "./modules/scheduleTesting";
export { startTesting } from "./modules/startTesting";
export { getTestingHistory } from "./modules/getTestingHistory";


export { testRecognitionQueue } from "./modules/testRecognitionQueue";
export { scheduledDecaySweep } from "./modules/decay/scheduledDecaySweep";
/* =========================
   PARENT PORTAL
========================= */

export {
  sendTournamentPing,
} from "./modules/parent/sendTournamentPing";

export {
  getMyAthlete,
} from "./modules/parent/getMyAthlete";

export {
  getParentInbox,
} from "./modules/parent/getParentInbox";

export {
  markParentInboxRead,
} from "./modules/parent/markParentInboxRead";

export {
  saveCoachNote,
} from "./modules/parent/saveCoachNote";

export {
  sendTestDayPings,
} from "./modules/parent/sendTestDayPings";

export {
  linkParentToAthlete,
} from "./modules/parent/linkParentToAthlete";

/*
  createParentSignal()
  is an internal helper.

  Do NOT export unless you intend
  to call it directly from Firebase.
*/

/* =========================
   ENGINE TESTING
========================= */

export { testAthleteNormalizer } from "./modules/testAthleteNormalizer";

export { testCertificatePayloadEngine }
  from "./modules/testCertificatePayloadEngine";

export { testProgressionEngine }
  from "./modules/testProgressionEngine";

export { markStripeCertificateIssued }
  from "./modules/markStripeCertificateIssued";


export { coachAction } from "./modules/coachAction";
export { skillCheckCoachCall } from "./modules/skillCheckCoachCall";
  /* =========================
   ATHLETE
========================= */

export {
  getAthleteProfileFeed,
} from "./modules/athlete/getAthleteProfileFeed";

export {
  getAthleteSkillsSummary,
} from "./modules/athlete/getAthleteSkillsSummary";

/* =========================
   ARENA
========================= */

export {
  logArenaHttp,
} from "./modules/logArenaHttp";

/* =========================
   INTAKE
========================= */

export {
  approveIntakeCall,
} from "./modules/approveIntakeCall";

export {
  createAthleteFromIntakeCall,
} from "./modules/createAthleteFromIntakeCall";

export {
  approveAndActivate,
} from "./approveAndActivate";

export {
  createCoachAthleteCall,
} from "./modules/createCoachAthleteCall";


export {
  addDisciplineCoachCall,
} from "./modules/addDisciplineCoachCall";

/* =========================
   ONBOARDING
========================= */

export {
  consumeOnboardingToken,
} from "./modules/consumeOnboardingToken";

export {
  onboardingConfirmStep1,
} from "./onboardingConfirmStep1";

/* =========================
   COMMUNICATIONS
========================= */

export {
  submitContact,
  submitVolunteer,
} from "./handlers/forms";

export {
  sendGatekeeperEmail,
  sendGatekeeperEmailV2,
} from "./modules/gatekeeper/sendGatekeeperEmail";

export {
  retestAthlete,
} from "./modules/retestAthlete";
/* =========================
   BILLING
========================= */

export {
  createBillingCheckoutCall,
} from "./billing/checkoutCall";

export {
  stripeBillingWebhook,
} from "./billing/webhook";

/* =========================
   PROPOSALS
========================= */

export {
  createProposalDraft,
} from "./proposals/createProposalDraft";

export {
  updateProposalDraft,
} from "./proposals/updateProposalDraft";

export {
  submitProposalForReview,
} from "./proposals/submitProposalForReview";

export {
  approveProposal,
} from "./proposals/approveProposal";


export {
  createProposalCheckout,
} from "./proposals/createProposalCheckout";

export { createAthleteOnboardingToken } from "./modules/createAthleteOnboardingToken";
export { issueAccessInvitation } from "./access/issueAccessInvitation";
export { consumeAccessInvitation } from "./access/consumeAccessInvitation";
export { transitionAthleteAccessMode } from "./access/transitionAthleteAccessMode";
export { searchManagementMembers } from "./access/searchManagementMembers";
export { cornermanRoster } from "./modules/cornermanRoster";
export { getAthleteScheduleScope } from "./schedules/getAthleteScheduleScope";
export { upsertAthleteCrossTrainingAssignment } from "./schedules/upsertAthleteCrossTrainingAssignment";
export { listCompetitionEvents } from "./competitions/listCompetitionEvents";
export { upsertCompetitionEvent } from "./competitions/upsertCompetitionEvent";
export { setCompetitionPublication } from "./competitions/setCompetitionPublication";
export { listMyCompetitionEvents } from "./competitions/listMyCompetitionEvents";
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
} from "./practice/practiceSessions";
export { listManagementAttendance } from "./practice/listManagementAttendance";
export { getAthleteSessionHistory } from "./practice/getAthleteSessionHistory";
export { getAdminOversightSummary } from "./admin/getAdminOversightSummary";
export { updateStaffGovernance } from "./admin/updateStaffGovernance";

export {
  issueProposalClientReview,
} from "./proposals/issueProposalClientReview";

export {
  getProposalClientReview,
} from "./proposals/getProposalClientReview";

export {
  acceptProposalClientReview,
} from "./proposals/acceptProposalClientReview";

export {
  requestProposalClientChanges,
} from "./proposals/requestProposalClientChanges";

export {
  returnProposalToDraft,
} from "./proposals/returnProposalToDraft";

export {
  deleteTestProposal,
} from "./proposals/deleteTestProposal";

/* =========================
   ATHLETE ASSESSMENTS
========================= */

export {
  createAthleteAssessmentPin,
  listAthleteAssessmentPins,
  returnAthleteAssessmentPin,
  recordAthleteAssessmentPlacement,
} from "./assessments/athleteAssessmentPins";

export {
  finalizeExperienceValidation,
  createManagementXpAdjustment,
} from "./management/managementXpTools";


export {
  sendManagementMessageEmail,
} from "./modules/management/sendManagementMessageEmail";

export {
  markManagementMessageResponded,
} from "./modules/management/markManagementMessageResponded";

export {
  storeClosedMessageIntelligence,
} from "./modules/management/storeClosedMessageIntelligence";

export { createManagementPassCheckout } from "./modules/management/createManagementPassCheckout";
export { confirmManagementPassAttendance } from "./modules/management/confirmManagementPassAttendance";
