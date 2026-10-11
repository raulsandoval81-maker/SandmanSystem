import { spawnSync } from "node:child_process";
import { verifyStagingBoundary } from "./verify-staging-boundary.mjs";
import { validateStagingWebConfig } from "./validate-staging-config.mjs";

const boundary = await verifyStagingBoundary();
const web = validateStagingWebConfig();
if (boundary.projectId !== web.projectId) throw new Error("Credential and Web App staging projects do not match.");
if (process.env.SANDMAN_STAGING_DEPLOY_CONFIRM !== `DEPLOY:${boundary.projectId}`) {
  throw new Error("SANDMAN_STAGING_DEPLOY_CONFIRM must explicitly name the isolated staging project.");
}

const prepared = spawnSync(process.execPath, ["scripts/staging/prepare-staging-hosting.mjs"], { stdio: "inherit", env: process.env });
if (prepared.status !== 0) process.exit(prepared.status ?? 1);
const deployed = spawnSync("npx", [
  "--yes", "firebase-tools@15.11.0", "deploy", "--config", "firebase.staging.json",
  "--project", boundary.projectId, "--only", "hosting,functions:skillCheckCoachCall,firestore:rules",
  "--non-interactive",
], { stdio: "inherit", env: process.env, shell: false });
process.exit(deployed.status ?? 1);
