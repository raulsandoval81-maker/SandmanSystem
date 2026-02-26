import * as admin from "firebase-admin";
admin.initializeApp();

// ---- Health / Debug
export { ping } from "./modules/ping";
export { testXpWrite } from "./modules/testXpWrite";
export { testAthleteXp } from "./modules/testAthleteXp";

// ---- XP Core
export { incrementXp } from "./modules/incrementXp"; // onCall (app)
export { xpHttp } from "./modules/xpHttp";           // onRequest (weekend)
export { promoteTier } from "./modules/promoteTier";

// ---- Arena (log-only in V1)
export { logArenaHttp } from "./modules/logArenaHttp";

// ---- Intake (TOKEN FLOW)
export { approveIntakeCall } from "./modules/approveIntakeCall"; 
export { createAthleteFromIntakeCall } from "./modules/createAthleteFromIntakeCall";
export { approveAndActivate } from "./approveAndActivate";

// ---- Onboarding (single-use token)
export { consumeOnboardingToken } from "./modules/consumeOnboardingToken";
