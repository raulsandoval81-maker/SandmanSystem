import { readFile } from "node:fs/promises";

export const PRODUCTION_PROJECT_ID = "sandmandashboard";
export const STAGING_PROJECT_ID = "sandman-combat-staging";
export const STAGING_PROJECT_NUMBER = "991554514268";
export const STAGING_WIF_PROVIDER = `projects/${STAGING_PROJECT_NUMBER}/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging`;
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
    if (actual !== release.functionRuntime) {
      throw new Error(`Runtime identity is unauthorized for ${functionName}.`);
    }
  }
  return true;
}

function userEnvironment(environment = {}) {
  return Object.fromEntries(Object.entries(environment)
    .filter(([key]) => key.startsWith("SANDMAN_"))
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function functionConfiguration(description = {}) {
  const service = description.serviceConfig || {};
  return {
    region: String(description.name || "").split("/")[3] || "",
    environment: description.environment,
    runtime: description.buildConfig?.runtime,
    entryPoint: description.buildConfig?.entryPoint,
    serviceAccountEmail: service.serviceAccountEmail,
    availableCpu: service.availableCpu,
    availableMemory: service.availableMemory,
    timeoutSeconds: service.timeoutSeconds,
    maxInstanceCount: service.maxInstanceCount,
    maxInstanceRequestConcurrency: service.maxInstanceRequestConcurrency,
    ingressSettings: service.ingressSettings,
    environmentVariables: userEnvironment(service.environmentVariables),
    secretEnvironmentVariables: service.secretEnvironmentVariables || [],
  };
}

export function validateFunctionConfiguration(release, functionName, description) {
  if (!APPROVED_FUNCTIONS.includes(functionName)) throw new Error(`Function ${functionName} is not allowlisted.`);
  const expected = release.expectedFunctionConfiguration || {};
  const actual = functionConfiguration(description);
  const wanted = {
    region: expected.region,
    environment: expected.environment,
    runtime: expected.runtime,
    entryPoint: functionName,
    serviceAccountEmail: release.functionRuntime,
    availableCpu: expected.availableCpu,
    availableMemory: expected.availableMemory,
    timeoutSeconds: expected.timeoutSeconds,
    maxInstanceCount: expected.maxInstanceCount,
    maxInstanceRequestConcurrency: expected.maxInstanceRequestConcurrency,
    ingressSettings: expected.ingressSettings,
    environmentVariables: expected.environmentVariables,
    secretEnvironmentVariables: [],
  };
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`Staging configuration mismatch for ${functionName}.`);
  }
  return actual;
}

function normalizedPolicy(policy = {}) {
  return [...(policy.bindings || [])]
    .map(binding => ({ role: binding.role, members: [...(binding.members || [])].sort(), condition: binding.condition || null }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function verifyPreservedDeployment(release, functionName, before, after, functionIamBefore, functionIamAfter, runIamBefore, runIamAfter) {
  const expectedBefore = validateFunctionConfiguration(release, functionName, before);
  const expectedAfter = validateFunctionConfiguration(release, functionName, after);
  if (JSON.stringify(expectedBefore) !== JSON.stringify(expectedAfter)) {
    throw new Error(`Runtime configuration changed for ${functionName}.`);
  }
  if (JSON.stringify(normalizedPolicy(functionIamBefore)) !== JSON.stringify(normalizedPolicy(functionIamAfter))) {
    throw new Error(`Cloud Functions IAM changed for ${functionName}.`);
  }
  if (JSON.stringify(normalizedPolicy(runIamBefore)) !== JSON.stringify(normalizedPolicy(runIamAfter))) {
    throw new Error(`Cloud Run IAM changed for ${functionName}.`);
  }
  return true;
}
