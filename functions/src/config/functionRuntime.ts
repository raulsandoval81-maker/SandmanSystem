export const STAGING_PROJECT_ID = "sandman-combat-staging";
export const STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT =
  "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com";

type RuntimeEnvironment = Record<string, string | undefined>;

export function resolveSkillCheckRuntimeOptions(
  env: RuntimeEnvironment = process.env
): {serviceAccount?: string} {
  const projectId = String(env.SANDMAN_STAGING_PROJECT_ID || "").trim();
  const acknowledgement = String(env.SANDMAN_STAGING_ACK || "").trim();
  const runtimeServiceAccount = String(
    env.SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT || ""
  ).trim();

  // Production and ordinary local discovery retain the existing default
  // identity. A runtime override is accepted only inside the exact staging
  // boundary used by the guarded PR #25 deployment workflow.
  if (!projectId && !runtimeServiceAccount) return {};

  if (projectId !== STAGING_PROJECT_ID || acknowledgement !== STAGING_PROJECT_ID) {
    throw new Error("Wrestling runtime overrides are allowed only for the approved staging project.");
  }
  if (runtimeServiceAccount !== STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT) {
    throw new Error("The approved staging Wrestling runtime service account is required.");
  }

  return {serviceAccount: runtimeServiceAccount};
}
