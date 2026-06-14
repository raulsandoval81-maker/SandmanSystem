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

/*
  createParentSignal()
  is an internal helper.

  Do NOT export unless you intend
  to call it directly from Firebase.
*/

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