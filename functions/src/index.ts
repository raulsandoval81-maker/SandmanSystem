import * as admin from "firebase-admin";

admin.initializeApp();

/* =========================
   HEALTH / DEBUG
========================= */

export { ping } from "./modules/ping";
export { testXpWrite } from "./modules/testXpWrite";
export { testAthleteXp } from "./modules/testAthleteXp";

/* =========================
   XP SYSTEM
========================= */

export { incrementXp } from "./modules/incrementXp";
export { xpHttp } from "./modules/xpHttp";

export { promoteTier } from "./modules/promoteTier";
export { freezeAthlete } from "./modules/freezeAthlete";

export { scheduleTesting } from "./modules/scheduleTesting";
export { startTesting } from "./modules/startTesting";
export { getTestingHistory } from "./modules/getTestingHistory";

export {
  sendTournamentPing,
} from "./modules/parent/sendTournamentPing";

export { testPromotionEngine } from "./modules/testPromotionEngine";

export { testStripeEngine } from "./modules/testStripeEngine";

export { testProgressionEngine } from "./modules/testProgressionEngine";

export { testCertificatePayloadEngine } from "./modules/testCertificatePayloadEngine";

export { testAthleteNormalizer } from "./modules/testAthleteNormalizer";

export { testAthleteLoader } from "./modules/testAthleteLoader";
/* =========================
   PARENT PORTAL
========================= */

export { getMyAthlete }
  from "./modules/parent/getMyAthlete";

export { getParentInbox }
  from "./modules/parent/getParentInbox";

export { markParentInboxRead }
  from "./modules/parent/markParentInboxRead";

export { saveCoachNote }
  from "./modules/parent/saveCoachNote";

export { retestAthlete } from "./modules/retestAthlete";

export { sendTestDayPings } from "./modules/parent/sendTestDayPings";

export { linkParentToAthlete } from "./modules/parent/linkParentToAthlete";
/*
  createParentSignal()
  is an internal helper.

  Do NOT export unless you intend
  to call it directly from Firebase.
*/

/* =========================
   ATHLETE
========================= */

export {
  getAthleteProfileFeed
} from "./modules/athlete/getAthleteProfileFeed";

/* =========================
   ARENA
========================= */

export { logArenaHttp }
  from "./modules/logArenaHttp";

/* =========================
   INTAKE
========================= */

export { approveIntakeCall }
  from "./modules/approveIntakeCall";

export { createAthleteFromIntakeCall }
  from "./modules/createAthleteFromIntakeCall";

export { approveAndActivate }
  from "./approveAndActivate";

  export { createCoachAthleteCall }
  from "./modules/createCoachAthleteCall";

/* =========================
   ONBOARDING
========================= */

export { consumeOnboardingToken }
  from "./modules/consumeOnboardingToken";

export { onboardingConfirmStep1 }
  from "./onboardingConfirmStep1";

/* =========================
   COMMUNICATIONS
========================= */

export {
  submitContact,
  submitVolunteer,
} from "./handlers/forms";

export { sendGatekeeperEmail }
  from "./modules/sendGatekeeperEmail";