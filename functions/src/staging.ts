import * as admin from "firebase-admin";

admin.initializeApp();

// The isolated staging deployment intentionally exposes only the supervised
// Wrestling callable. Production continues to use src/index.ts unchanged.
export { skillCheckCoachCall } from "./modules/skillCheckCoachCall";
