export const STAGING_PROJECT_ID = "sandman-combat-staging";
export const STAGING_RUNTIME_SERVICE_ACCOUNTS = Object.freeze({
  attendance: "sandman-attendance-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  practice: "sandman-practice-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  progression: "sandman-progression-runtime@sandman-combat-staging.iam.gserviceaccount.com",
});

export type StagingFunctionGroup = keyof typeof STAGING_RUNTIME_SERVICE_ACCOUNTS;

type RuntimeEnvironment = Record<string, string | undefined>;

export type StagingCallableRuntimeOptions = {
  serviceAccount?: string;
};

function firebaseConfigProjectId(value: string | undefined): string {
  if (!value) return "";
  try {
    return String(JSON.parse(value).projectId || "").trim();
  } catch {
    return "";
  }
}

export function resolveStagingCallableRuntimeOptions(
  group: StagingFunctionGroup,
  env: RuntimeEnvironment = process.env
): StagingCallableRuntimeOptions {
  const projectId = String(env.SANDMAN_STAGING_PROJECT_ID || "").trim();
  const acknowledgement = String(env.SANDMAN_STAGING_ACK || "").trim();
  const runtimeEnvironmentNames: Record<StagingFunctionGroup, string> = {
    attendance: "SANDMAN_ATTENDANCE_RUNTIME_SERVICE_ACCOUNT",
    practice: "SANDMAN_PRACTICE_RUNTIME_SERVICE_ACCOUNT",
    progression: "SANDMAN_PROGRESSION_RUNTIME_SERVICE_ACCOUNT",
  };
  const runtimeServiceAccount = String(env[runtimeEnvironmentNames[group]] || "").trim();
  const expectedRuntimeServiceAccount = STAGING_RUNTIME_SERVICE_ACCOUNTS[group];
  const platformProjectId = String(
    env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT ||
    firebaseConfigProjectId(env.FIREBASE_CONFIG)
  ).trim();
  const stagingWasRequested = Boolean(
    projectId || acknowledgement || runtimeServiceAccount ||
    platformProjectId === STAGING_PROJECT_ID
  );

  // Production, test and ordinary local discovery retain their existing
  // defaults. Once any staging marker is present, every staging identity must
  // match exactly so discovery cannot fall back to the default Compute account.
  if (!stagingWasRequested) return {};

  if (projectId !== STAGING_PROJECT_ID || acknowledgement !== STAGING_PROJECT_ID) {
    throw new Error("Wrestling runtime overrides are allowed only for the approved staging project.");
  }
  if (runtimeServiceAccount !== expectedRuntimeServiceAccount) {
    throw new Error(`The approved staging ${group} runtime service account is required.`);
  }
  if (platformProjectId && platformProjectId !== STAGING_PROJECT_ID) {
    throw new Error("The platform project does not match the approved staging project.");
  }

  return {serviceAccount: runtimeServiceAccount};
}

export const resolveSkillCheckRuntimeOptions =
  (env: RuntimeEnvironment = process.env) =>
    resolveStagingCallableRuntimeOptions("progression", env);
