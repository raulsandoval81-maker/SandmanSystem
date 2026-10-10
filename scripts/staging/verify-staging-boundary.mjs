import { readFile } from "node:fs/promises";

export const PRODUCTION_PROJECT_ID = "sandmandashboard";
export const STAGING_PROJECT_ID = "sandman-combat-staging";
export const STAGING_PROJECT_NUMBER = "991554514268";
export const STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT = "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com";
export const STAGING_WIF_PROVIDER = `projects/${STAGING_PROJECT_NUMBER}/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-github-actions`;

export async function verifyStagingBoundary(env = process.env) {
  const projectId = String(env.SANDMAN_STAGING_PROJECT_ID || "").trim();
  const expectedEmail = String(env.SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL || "").trim();
  const runtimeServiceAccount = String(env.SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT || "").trim();
  const credentialPath = String(env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (projectId !== STAGING_PROJECT_ID || projectId === PRODUCTION_PROJECT_ID) throw new Error("The exact approved staging project ID is required.");
  if (env.SANDMAN_STAGING_ACK !== projectId) throw new Error("SANDMAN_STAGING_ACK must exactly match the staging project ID.");
  if (runtimeServiceAccount !== STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT) throw new Error("The exact approved staging Wrestling runtime service account is required.");
  if (!expectedEmail || !credentialPath) throw new Error("Explicit staging credential path and service-account email are required.");

  let credential;
  try { credential = JSON.parse(await readFile(credentialPath, "utf8")); }
  catch { throw new Error("The staging credential file must contain valid Google credential JSON."); }
  if (credential.type === "service_account") {
    if (credential.project_id !== projectId || credential.project_id === PRODUCTION_PROJECT_ID) throw new Error("Credential project identity does not match the authorized staging project.");
    if (credential.client_email !== expectedEmail) throw new Error("Credential service-account identity does not match the authorized staging account.");
    if (!String(credential.private_key || "").includes("PRIVATE KEY")) throw new Error("Staging service-account credential is incomplete.");
  } else if (credential.type === "external_account") {
    const audience = `//iam.googleapis.com/${STAGING_WIF_PROVIDER}`;
    if (credential.audience !== audience) throw new Error("WIF credential provider does not match the authorized staging provider.");
    const match = String(credential.service_account_impersonation_url || "").match(/^https:\/\/iamcredentials\.googleapis\.com\/v1\/projects\/-\/serviceAccounts\/(.+):generateAccessToken$/);
    if (!match || decodeURIComponent(match[1]) !== expectedEmail) throw new Error("WIF credential service-account identity does not match the authorized staging account.");
  } else {
    throw new Error("Only the staging service account or approved WIF external credential is accepted.");
  }
  return { projectId, serviceAccountEmail: expectedEmail, runtimeServiceAccount, credential };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await verifyStagingBoundary();
  console.log(`Verified isolated staging boundary for ${result.projectId} as ${result.serviceAccountEmail}.`);
}
