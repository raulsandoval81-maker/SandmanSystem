import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
} from "./verify-staging-boundary.mjs";

export const STAGING_CONFIG_PATH = "firebase.staging.json";
export const STAGING_HOSTING_SITE = "sandman-combat-staging";
export const ALLOWED_STAGING_DEPLOY_TARGETS = Object.freeze([
  "hosting",
  "functions:skillCheckCoachCall",
  "functions:openPracticeSession",
  "functions:createOrRecoverCanonicalPractice",
  "functions:getPracticeAttendanceReview",
  "functions:updatePracticeCheckIn",
  "functions:finalizePracticeAttendance",
  "functions:completePracticeDailyGrind",
  "functions:savePracticeAthleteInput",
  "functions:getPracticeSession",
  "functions:closePracticeSession",
  "functions:savePracticeSessionMemory",
  "functions:saveDailyPracticeLog",
  "firestore:rules",
]);

export async function assertStagingDeploymentPlan({
  projectId,
  acknowledgement,
  confirmation,
  targets = ALLOWED_STAGING_DEPLOY_TARGETS,
  firebasercPath = ".firebaserc",
  stagingConfigPath = STAGING_CONFIG_PATH,
} = {}) {
  if (projectId !== STAGING_PROJECT_ID || projectId === PRODUCTION_PROJECT_ID) {
    throw new Error("Deployment plan must target the exact approved staging project.");
  }
  if (acknowledgement !== STAGING_PROJECT_ID
      || confirmation !== `DEPLOY:${STAGING_PROJECT_ID}`) {
    throw new Error("Explicit staging acknowledgement and deployment confirmation are required.");
  }
  if (!Array.isArray(targets) || !targets.length
      || targets.some(target => !ALLOWED_STAGING_DEPLOY_TARGETS.includes(target))
      || new Set(targets).size !== targets.length) {
    throw new Error("Deployment targets must be a unique subset of the approved staging surface.");
  }
  const [rc, config] = await Promise.all([
    readFile(firebasercPath, "utf8").then(JSON.parse),
    readFile(stagingConfigPath, "utf8").then(JSON.parse),
  ]);
  if (rc?.projects?.default !== PRODUCTION_PROJECT_ID
      || rc?.projects?.staging !== STAGING_PROJECT_ID) {
    throw new Error("Firebase aliases do not match the reviewed production/staging identities.");
  }
  if (config?.hosting?.site !== STAGING_HOSTING_SITE
      || config?.hosting?.target || config?.hosting?.public !== ".firebase-staging/public") {
    throw new Error("Staging Hosting must name the isolated staging site and generated public root.");
  }
  if (config?.functions?.source !== "functions/.firebase-staging"
      || config?.firestore?.rules !== "firestore.rules") {
    throw new Error("Staging Functions or Firestore configuration is outside the reviewed boundary.");
  }
  return {projectId,configPath:stagingConfigPath,targets:[...targets],hostingSite:STAGING_HOSTING_SITE};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = await assertStagingDeploymentPlan({
    projectId: process.env.SANDMAN_STAGING_PROJECT_ID,
    acknowledgement: process.env.SANDMAN_STAGING_ACK,
    confirmation: process.env.SANDMAN_STAGING_DEPLOY_CONFIRM,
  });
  console.log(JSON.stringify({...plan,validated:true},null,2));
}
