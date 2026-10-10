import { PRODUCTION_PROJECT_ID } from "./verify-staging-boundary.mjs";

export function validateStagingWebConfig(env = process.env) {
  const projectId = String(env.SANDMAN_STAGING_PROJECT_ID || "").trim();
  if (!projectId || projectId === PRODUCTION_PROJECT_ID) throw new Error("A non-production SANDMAN_STAGING_PROJECT_ID is required.");
  if (env.SANDMAN_STAGING_ACK !== projectId) throw new Error("SANDMAN_STAGING_ACK must exactly match the staging project ID.");
  let config;
  try { config = JSON.parse(env.SANDMAN_STAGING_WEB_CONFIG || ""); }
  catch { throw new Error("SANDMAN_STAGING_WEB_CONFIG must be valid Firebase web-app JSON."); }
  if (config.projectId !== projectId) throw new Error("Web config projectId does not match the approved staging project.");
  for (const key of ["apiKey", "authDomain", "projectId", "appId"]) {
    if (!String(config[key] || "").trim()) throw new Error(`Staging web config is missing ${key}.`);
  }
  return { projectId, config };
}
