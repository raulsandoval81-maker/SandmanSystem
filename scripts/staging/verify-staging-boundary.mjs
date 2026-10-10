import { readFile } from "node:fs/promises";

export const PRODUCTION_PROJECT_ID = "sandmandashboard";

export async function verifyStagingBoundary(env = process.env) {
  const projectId = String(env.SANDMAN_STAGING_PROJECT_ID || "").trim();
  const expectedEmail = String(env.SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL || "").trim();
  const credentialPath = String(env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!projectId || projectId === PRODUCTION_PROJECT_ID) throw new Error("A non-production SANDMAN_STAGING_PROJECT_ID is required.");
  if (env.SANDMAN_STAGING_ACK !== projectId) throw new Error("SANDMAN_STAGING_ACK must exactly match the staging project ID.");
  if (!expectedEmail || !credentialPath) throw new Error("Explicit staging credential path and service-account email are required.");

  let credential;
  try { credential = JSON.parse(await readFile(credentialPath, "utf8")); }
  catch { throw new Error("The staging credential file must contain valid service-account JSON."); }
  if (credential.type !== "service_account") throw new Error("Only an explicit staging service-account credential is accepted.");
  if (credential.project_id !== projectId || credential.project_id === PRODUCTION_PROJECT_ID) throw new Error("Credential project identity does not match the authorized staging project.");
  if (credential.client_email !== expectedEmail) throw new Error("Credential service-account identity does not match the authorized staging account.");
  if (!String(credential.private_key || "").includes("PRIVATE KEY")) throw new Error("Staging service-account credential is incomplete.");
  return { projectId, serviceAccountEmail: expectedEmail, credential };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await verifyStagingBoundary();
  console.log(`Verified isolated staging boundary for ${result.projectId} as ${result.serviceAccountEmail}.`);
}
