import { readFile } from "node:fs/promises";

export const PRODUCTION_PROJECT_ID = "sandmandashboard";
export const STAGING_PROJECT_ID = "sandman-combat-staging";
export const STAGING_PROJECT_NUMBER = "991554514268";
export const STAGING_WIF_PROVIDER = `projects/${STAGING_PROJECT_NUMBER}/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-github-actions`;
export const TRUSTED_WORKFLOW_REF = "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main";
export const APPROVED_FUNCTIONS = Object.freeze(["savePracticeSessionMemory", "closePracticeSession"]);

const exactSha = /^[0-9a-f]{40}$/;

export async function loadRelease(releaseId, manifestPath = new URL("./approved-exact-sha-releases.json", import.meta.url)) {
  const releases = JSON.parse(await readFile(manifestPath, "utf8"));
  const release = releases[releaseId];
  if (!release) throw new Error("Release ID is not approved by the trusted tooling revision.");
  return Object.freeze({ releaseId, ...release });
}

export function validateRelease(release, context = {}) {
  if (release.repository !== "raulsandoval81-maker/SandmanSystem" || context.repository !== release.repository) {
    throw new Error("Repository identity is not authorized.");
  }
  if (context.workflowRef !== TRUSTED_WORKFLOW_REF) throw new Error("Workflow must run from trusted main.");
  if (!exactSha.test(String(release.applicationSha || ""))) throw new Error("Application source must be a full immutable SHA.");
  if (context.checkedOutSha !== release.applicationSha) throw new Error("Application checkout does not match the approved SHA.");
  if (release.projectId !== STAGING_PROJECT_ID || release.projectId === PRODUCTION_PROJECT_ID || context.projectId !== STAGING_PROJECT_ID) {
    throw new Error("Only the exact staging Firebase project is authorized.");
  }
  if (release.hostingSite !== STAGING_PROJECT_ID) throw new Error("Hosting site is not the isolated staging site.");
  if (context.confirmProject !== STAGING_PROJECT_ID) throw new Error("Explicit staging project confirmation is required.");
  if (context.wifProvider !== STAGING_WIF_PROVIDER) throw new Error("Wrong staging WIF provider.");
  if (context.hostingDeployer !== release.hostingDeployer) throw new Error("Wrong Hosting deployer identity.");
  if (context.functionDeployer !== release.functionDeployer) throw new Error("Wrong function deployer identity.");
  if (context.functionRuntime !== release.functionRuntime) throw new Error("Wrong function runtime identity.");
  if (context.authorizationAvailable !== true) throw new Error("Protected deployment authorization is unavailable.");
  const functions = [...(release.functions || [])];
  if (functions.length !== APPROVED_FUNCTIONS.length || functions.some((name, index) => name !== APPROVED_FUNCTIONS[index])) {
    throw new Error("Unexpected function target in approved release.");
  }
  return release;
}

export function validateRemotePreflight(release, { marker, runtimeByFunction } = {}) {
  if (!marker || marker.projectId !== STAGING_PROJECT_ID || marker.environment !== "staging" || marker.syntheticDataOnly !== true) {
    throw new Error("Staging synthetic-data marker is missing or invalid.");
  }
  for (const functionName of APPROVED_FUNCTIONS) {
    const actual = runtimeByFunction?.[functionName];
    if (!actual) throw new Error(`Runtime identity is unverified for ${functionName}.`);
    if (actual !== release.currentRuntime && actual !== release.functionRuntime) {
      throw new Error(`Runtime identity is unauthorized for ${functionName}.`);
    }
  }
  return true;
}

export function requireRuntimeMigrationApproval(release, runtimeByFunction, confirmation) {
  const migrationNeeded = APPROVED_FUNCTIONS.some((name) => runtimeByFunction[name] !== release.functionRuntime);
  if (!migrationNeeded) return false;
  if (!release.runtimeMigrationRequiresApproval || confirmation !== `MIGRATE_RUNTIME:${release.releaseId}:${STAGING_PROJECT_ID}`) {
    throw new Error("Runtime identity migration requires separate explicit approval.");
  }
  return true;
}
