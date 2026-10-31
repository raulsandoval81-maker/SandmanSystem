import { readFile } from "node:fs/promises";

export const PRODUCTION_PROJECT_ID = "sandmandashboard";
export const STAGING_PROJECT_ID = "sandman-combat-staging";
export const STAGING_PROJECT_NUMBER = "991554514268";
export const STAGING_WIF_PROVIDER = `projects/${STAGING_PROJECT_NUMBER}/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging`;
export const TRUSTED_WORKFLOW_REF = "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main";
const APPROVED_FUNCTION_SETS = Object.freeze([
  Object.freeze(["savePracticeSessionMemory", "closePracticeSession"]),
  Object.freeze(["savePracticeSessionMemory"]),
  Object.freeze(["updatePracticeCheckIn"]),
  Object.freeze([
    "searchPracticeAttendanceAthletes",
    "getPracticeAttendanceReview",
    "updatePracticeCheckIn",
    "finalizePracticeAttendance",
  ]),
  Object.freeze([
    "recordProposalPrepaidCash",
    "recordProposalPriorPayment",
    "approveProposalRenewalAutopay",
    "createProposalAutopaySetup",
  ]),
  Object.freeze([
    "recordProposalPriorPayment",
    "recordHistoricalCashDisposition",
    "issueProposalClientReview",
    "getProposalClientReview",
    "acceptProposalClientReview",
    "createProposalCheckout",
    "stripeBillingWebhook",
  ]),
]);
export const APPROVED_FUNCTIONS = Object.freeze([...new Set(APPROVED_FUNCTION_SETS.flat())]);

const exactSha = /^[0-9a-f]{40}$/;
const BILLING_RELEASE_IDS = new Set(["billing-pr354-014198ea", "billing-pr376-dff3e6d3"]);
const BILLING_FULL_RELEASE_ID = "billing-pr394-deploy-7befb7f2";

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
  if (release.requiredAncestorSha && !exactSha.test(String(release.requiredAncestorSha))) {
    throw new Error("Required application ancestor must be a full immutable SHA.");
  }
  if (release.requiredAncestorSha && (!Array.isArray(release.allowedChangedFiles) || !release.allowedChangedFiles.length)) {
    throw new Error("An ancestor-pinned release requires an explicit changed-file allowlist.");
  }
  if (context.checkedOutSha !== release.applicationSha) throw new Error("Application checkout does not match the approved SHA.");
  if (release.projectId !== STAGING_PROJECT_ID || release.projectId === PRODUCTION_PROJECT_ID || context.projectId !== STAGING_PROJECT_ID) {
    throw new Error("Only the exact staging Firebase project is authorized.");
  }
  if (release.hostingSite !== STAGING_PROJECT_ID) throw new Error("Hosting site is not the isolated staging site.");
  // A validation-only checkpoint can examine pinned immutable source, but can
  // never authorize Cloud resources, payment secrets or a deployment.
  const billingValidationId = "billing-pr394-7befb7f2";
  const isBillingValidation =
    release.releaseId === billingValidationId &&
    release.sourcePr === 394 &&
    release.applicationSha === "7befb7f2dba6debb0e32c9336cda99ad897712de" &&
    release.requiredAncestorSha === "dff3e6d31c551b39fb3df3be5631c1331651efd6" &&
    release.validationOnly === true &&
    release.hosting === false &&
    Array.isArray(release.functions) && release.functions.length === 0 &&
    Array.isArray(release.newFunctions) && release.newFunctions.length === 0 &&
    !release.functionSecrets;
  if (release.releaseId === BILLING_FULL_RELEASE_ID) {
    // Candidate can validate immutable artifacts only, never authorize deployment.
    const mandatoryFunctions = [
      "recordProposalPriorPayment", "recordHistoricalCashDisposition",
      "issueProposalClientReview", "getProposalClientReview",
      "acceptProposalClientReview", "createProposalCheckout", "stripeBillingWebhook",
    ];
    const mandatorySecrets = {
      issueProposalClientReview: ["RESEND_API_KEY"],
      createProposalCheckout: ["STRIPE_SECRET_KEY"],
      stripeBillingWebhook: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    };
    if (release.sourcePr !== 394 ||
        release.applicationSha !== "7befb7f2dba6debb0e32c9336cda99ad897712de" ||
        release.requiredAncestorSha !== "dff3e6d31c551b39fb3df3be5631c1331651efd6" ||
        release.validationOnly !== true ||
        release.hosting !== true ||
        JSON.stringify(release.hostingFiles) !== JSON.stringify([
          "public/management/billing/billing.js", "public/connect/proposals/review/review.js",
        ]) ||
        JSON.stringify(release.functions) !== JSON.stringify(mandatoryFunctions) ||
        JSON.stringify(release.newFunctions) !== JSON.stringify(mandatoryFunctions.slice(1)) ||
        JSON.stringify(release.functionSecrets) !== JSON.stringify(mandatorySecrets) ||
        release.functionRuntime !== "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com" ||
        release.bootstrap?.approvalRequired !== true ||
        release.bootstrap?.routineDeployMayCreate !== false) {
      throw new Error("PR394 staging candidate must remain exact and deployment-disabled.");
    }
  }
  if (release.releaseId === billingValidationId && !isBillingValidation) {
    throw new Error("PR394 validation checkpoint must remain isolated and deployment-disabled.");
  }
  if (release.hosting === false && release.releaseId !== "attendance-admin-init-pr308-0b06a778" &&
      !isBillingValidation) {
    throw new Error("Hosting-disabled releases require their own reviewed authorization.");
  }
  if (release.releaseId === "attendance-admin-init-pr308-0b06a778" &&
      (release.hosting !== false || release.functions?.length !== 1 ||
       release.functions[0] !== "updatePracticeCheckIn" ||
       (release.hostingFiles || []).length || release.hostingBaselineSha)) {
    throw new Error("PR308 is attendance-callable-only and must not deploy Hosting.");
  }
  if (context.confirmProject !== STAGING_PROJECT_ID) throw new Error("Explicit staging project confirmation is required.");
  if (context.wifProvider !== STAGING_WIF_PROVIDER) throw new Error("Wrong staging WIF provider.");
  if (context.hostingDeployer !== release.hostingDeployer) throw new Error("Wrong Hosting deployer identity.");
  if (context.functionDeployer !== release.functionDeployer) throw new Error("Wrong function deployer identity.");
  if (context.functionRuntime !== release.functionRuntime) throw new Error("Wrong function runtime identity.");
  if (context.authorizationAvailable !== true) throw new Error("Protected deployment authorization is unavailable.");
  if (release.hostingBaselineSha || release.hostingFiles) {
    if (!exactSha.test(String(release.hostingBaselineSha || ""))) throw new Error("Hosting baseline must be a full immutable SHA.");
    if (!Array.isArray(release.hostingFiles) || !release.hostingFiles.length ||
        release.hostingFiles.some(file => !/^public\/[A-Za-z0-9._/-]+$/.test(file) || file.includes(".."))) {
      throw new Error("Hosting overlay requires an explicit safe file allowlist.");
    }
    // CP7's remote engine was already reviewed and staged in the prior exact-SHA
    // release. Permit only this unchanged inherited file, independently verified
    // against the prior application SHA by the protected workflow.
    const inherited = release.inheritedHostingFiles || [];
    const inheritedEngine = "public/coaches/execution/engine/practice-remote-control.mjs";
    const approvedCompanionInheritance = release.releaseId === "coach-companion-final-pr305-5ec93994"
      && inherited.length === 1 && inherited[0] === inheritedEngine
      && release.requiredAncestorSha === "11539235059ed69a226aa2b6b5a58fee9007d9b5"
      && release.sourcePr === 305;
    const approvedPromotionsInheritance = release.releaseId === "promotions-final-pr325-c4df1254"
      && inherited.length === 2
      && inherited[0] === "public/connect/admissions-requests/admissions-requests.js"
      && inherited[1] === "public/connect/try-a-class/try-a-class.js"
      && release.requiredAncestorSha === "bc732da79132d32aee977fcb3e7afd771a51ef74"
      && release.sourcePr === 325;
    // One-time carry-forward of the exact previously deployed promotions overlay.
    // Each inherited source is pinned to the git blob SHA from the prior approved release.
    const previousPromotion = "promotions-final-pr325-c4df1254";
    const carryForwardFiles = [
      "public/connect/admissions-requests/admissions-requests.js",
      "public/connect/admissions-requests/index.html",
      "public/connect/try-a-class/try-a-class.js",
      "public/promotions/winter-wrestling/index.html",
      "public/promotions/winter-wrestling/winter-wrestling.js",
    ];
    const approvedClipboardCarryForward = release.releaseId === "clipboard-notes-pr372-e445688c"
      && release.sourcePr === 372
      && release.applicationSha === "e445688c4884f7434f21b341d43acebd93c465cd"
      && release.hostingBaselineSha === "b48c9c061a03ddc2dc34e5f4a7ec21006364767a"
      && release.inheritedHostingReleaseId === previousPromotion
      && inherited.length === carryForwardFiles.length
      && inherited.every((file, index) => file === carryForwardFiles[index])
      && Object.keys(release.inheritedHostingFileGitShas || {}).length === carryForwardFiles.length
      && carryForwardFiles.every(file => /^[0-9a-f]{40}$/.test(release.inheritedHostingFileGitShas?.[file] || ""));
    const priorBilling = "billing-pr354-014198ea";
    const billingCarryForwardFiles = [
      "public/connect/admissions/calculator/calculator.js",
      "public/intake-management/management.intake.js",
      "public/management/billing/paid-in-full-state.js",
      "public/management/enrollment-flow/enrollment-flow.js",
      "public/management/pricing/index.html",
      "public/management/pricing/pricing-estimate-model.js",
      "public/management/pricing/pricing.js",
    ];
    const approvedBillingCarryForward = release.releaseId === "billing-pr376-dff3e6d3"
      && release.sourcePr === 376
      && release.applicationSha === "dff3e6d31c551b39fb3df3be5631c1331651efd6"
      && release.requiredAncestorSha === "0476e6b677e331edcd4848e335042d63ca617f2d"
      && release.inheritedHostingReleaseId === priorBilling
      && inherited.length === billingCarryForwardFiles.length
      && inherited.every((file, index) => file === billingCarryForwardFiles[index])
      && Object.keys(release.inheritedHostingFileGitShas || {}).length === billingCarryForwardFiles.length
      && billingCarryForwardFiles.every(file => /^[0-9a-f]{40}$/.test(release.inheritedHostingFileGitShas?.[file] || ""));
    // PR394 Hosting-only promotion carries forward precisely the seven client files
    // in the previously verified PR376 staging Hosting artifact. Only the
    // Billing screen and family review client are replaced from PR394.
    const approvedBilling394HostingCarryForward = release.releaseId === "billing-pr394-hosting-7befb7f2"
      && release.sourcePr === 394
      && release.applicationSha === "7befb7f2dba6debb0e32c9336cda99ad897712de"
      && release.requiredAncestorSha === "dff3e6d31c551b39fb3df3be5631c1331651efd6"
      && release.hostingBaselineSha === "a44b602caef08c7e719cc7425436507d3f9b3c51"
      && release.inheritedHostingReleaseId === "billing-pr376-dff3e6d3"
      && JSON.stringify(release.hostingFiles) === JSON.stringify([
        ...["public/connect/admissions/calculator/calculator.js",
          "public/intake-management/management.intake.js",
          "public/management/billing/billing.js",
          "public/management/billing/paid-in-full-state.js",
          "public/management/enrollment-flow/enrollment-flow.js",
          "public/management/pricing/index.html",
          "public/management/pricing/pricing-estimate-model.js",
          "public/management/pricing/pricing.js"],
        "public/connect/proposals/review/review.js",
      ])
      && inherited.length === billingCarryForwardFiles.length
      && inherited.every((file, index) => file === billingCarryForwardFiles[index])
      && Object.keys(release.inheritedHostingFileGitShas || {}).length === inherited.length
      && inherited.every(file => /^[0-9a-f]{40}$/.test(release.inheritedHostingFileGitShas?.[file] || ""))
      && release.functions?.length === 0 && release.newFunctions?.length === 0
      && release.recovery?.functionsUnchanged === true;
    if (inherited.length && !approvedCompanionInheritance && !approvedPromotionsInheritance &&
        !approvedClipboardCarryForward && !approvedBillingCarryForward && !approvedBilling394HostingCarryForward) {
      throw new Error("Unapproved inherited Hosting source.");
    }
    if (release.hostingFiles.some(file => !release.allowedChangedFiles.includes(file) && !inherited.includes(file))) {
      throw new Error("Hosting overlay contains a file outside the reviewed application diff.");
    }
  }
  const functions = [...(release.functions || [])];
  const isApprovedCallableSet = APPROVED_FUNCTION_SETS.some(approved =>
    functions.length === approved.length
      && functions.every((name, index) => name === approved[index]));
  if (functions.length && !isApprovedCallableSet) {
    throw new Error("Unexpected function target in approved release.");
  }
  if (release.functionScope === "savePracticeSessionMemory-only" &&
      (functions.length !== 1 || functions[0] !== "savePracticeSessionMemory")) {
    throw new Error("Unexpected function target in approved release.");
  }
  const newFunctions = [...(release.newFunctions || [])];
  const approvedNewFunctions = (BILLING_RELEASE_IDS.has(release.releaseId) || release.releaseId === BILLING_FULL_RELEASE_ID)
    ? functions
    : ["searchPracticeAttendanceAthletes"];
  if (newFunctions.some(name => !approvedNewFunctions.includes(name) || !functions.includes(name))) {
    throw new Error("Unexpected new function target in approved release.");
  }
  const functionSecrets = release.functionSecrets || {};
  const secretFunctions = Object.keys(functionSecrets);
  if (secretFunctions.some(name => !functions.includes(name)) ||
      Object.values(functionSecrets).some(keys => !Array.isArray(keys) ||
        keys.some(key => !["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"].includes(key)))) {
    throw new Error("Unexpected staging function secret configuration.");
  }
  if (BILLING_RELEASE_IDS.has(release.releaseId) &&
      JSON.stringify(functionSecrets) !== JSON.stringify({ createProposalAutopaySetup: ["STRIPE_SECRET_KEY"] })) {
    throw new Error("Billing staging release requires the exact Stripe test secret binding.");
  }
  if (release.functionDeploymentTool === "gcloud-gen2") {
    if (!release.functionBuild?.endsWith(`@${STAGING_PROJECT_ID}.iam.gserviceaccount.com`)) throw new Error("Dedicated build identity is required.");
    const bootstrapFunctions = release.bootstrap?.functions || (release.bootstrap?.function ? [release.bootstrap.function] : []);
    if (newFunctions.length && (release.bootstrap?.approvalRequired !== true || release.bootstrap?.routineDeployMayCreate !== false ||
        bootstrapFunctions.length !== newFunctions.length ||
        bootstrapFunctions.some((name, index) => name !== newFunctions[index]))) {
      throw new Error("New callable bootstrap must be separately approved.");
    }
    const partialFunctions = Object.keys(release.partialBootstrap || {});
    if (partialFunctions.some(name => !newFunctions.includes(name)) ||
        (BILLING_RELEASE_IDS.has(release.releaseId) &&
          JSON.stringify(partialFunctions) !== JSON.stringify(["recordProposalPrepaidCash"]))) {
      throw new Error("Unexpected partial callable bootstrap state.");
    }
    const buildChecks = release.buildPermissionResources || {};
    for (const permission of ["artifactregistry.repositories.downloadArtifacts", "artifactregistry.repositories.uploadArtifacts", "logging.logEntries.create", "storage.objects.get", "storage.objects.list"]) {
      if (!String(buildChecks[permission] || "").includes(STAGING_PROJECT_ID) && !String(buildChecks[permission] || "").includes(STAGING_PROJECT_NUMBER)) {
        throw new Error(`Build permission resource is not staging-scoped: ${permission}.`);
      }
    }
  }
  return release;
}

export function validateRemotePreflight(release, { marker, runtimeByFunction } = {}) {
  if (!marker || marker.projectId !== STAGING_PROJECT_ID || marker.environment !== "staging" || marker.syntheticDataOnly !== true) {
    throw new Error("Staging synthetic-data marker is missing or invalid.");
  }
  for (const functionName of release.functions || []) {
    const actual = runtimeByFunction?.[functionName];
    if (!actual) throw new Error(`Runtime identity is unverified for ${functionName}.`);
    if (actual === "__absent__" && (release.newFunctions || []).includes(functionName)) continue;
    if (release.partialBootstrap?.[functionName]?.runtimeServiceAccount === actual) continue;
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

function secretKeys(secretEnvironmentVariables = []) {
  return secretEnvironmentVariables.map(value => String(value?.key || "")).filter(Boolean).sort();
}

export function functionConfiguration(description = {}) {
  const service = description.serviceConfig || {};
  return {
    region: String(description.name || "").split("/")[3] || "",
    environment: description.environment,
    runtime: description.buildConfig?.runtime,
    entryPoint: description.buildConfig?.entryPoint,
    serviceAccountEmail: service.serviceAccountEmail,
    buildServiceAccount: description.buildConfig?.serviceAccount,
    availableCpu: service.availableCpu,
    availableMemory: service.availableMemory,
    timeoutSeconds: service.timeoutSeconds,
    maxInstanceCount: service.maxInstanceCount,
    maxInstanceRequestConcurrency: service.maxInstanceRequestConcurrency,
    ingressSettings: service.ingressSettings,
    environmentVariables: userEnvironment(service.environmentVariables),
    secretEnvironmentVariables: secretKeys(service.secretEnvironmentVariables),
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
    buildServiceAccount: release.expectedInvokerIamDisabled === true ? `projects/${STAGING_PROJECT_ID}/serviceAccounts/${release.functionBuild}` : actual.buildServiceAccount,
    availableCpu: expected.availableCpu,
    availableMemory: expected.availableMemory,
    timeoutSeconds: expected.timeoutSeconds,
    maxInstanceCount: expected.maxInstanceCount,
    maxInstanceRequestConcurrency: expected.maxInstanceRequestConcurrency,
    ingressSettings: expected.ingressSettings,
    environmentVariables: userEnvironment(expected.environmentVariables),
    secretEnvironmentVariables: [...(release.functionSecrets?.[functionName] || [])].sort(),
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

export function validatePartialBootstrapState(release, functionName, description, serviceDescription, functionIam, runIam) {
  const expected = release.partialBootstrap?.[functionName];
  if (!expected) return false;
  const source = description?.buildConfig?.source?.storageSource || {};
  const actual = {
    state: description?.state,
    updateTime: description?.updateTime,
    revision: description?.serviceConfig?.revision,
    sourceGeneration: String(source.generation || ""),
    firebaseFunctionsHash: description?.labels?.["firebase-functions-hash"],
    runtimeServiceAccount: description?.serviceConfig?.serviceAccountEmail,
  };
  if (JSON.stringify(actual) !== JSON.stringify({
    state: expected.state,
    updateTime: expected.updateTime,
    revision: expected.revision,
    sourceGeneration: expected.sourceGeneration,
    firebaseFunctionsHash: expected.firebaseFunctionsHash,
    runtimeServiceAccount: expected.runtimeServiceAccount,
  })) throw new Error(`Partial bootstrap evidence mismatch for ${functionName}.`);
  const annotations = serviceDescription?.metadata?.annotations || {};
  if (annotations["run.googleapis.com/invoker-iam-disabled"] === "true" ||
      normalizedPolicy(functionIam).length || normalizedPolicy(runIam).length) {
    throw new Error(`Partial bootstrap IAM state mismatch for ${functionName}.`);
  }
  return true;
}

export function verifyInvokerPolicy(release, functionName, serviceDescription, functionIam, runIam) {
  if (release.expectedInvokerIamDisabled !== true) return true;
  if (!APPROVED_FUNCTIONS.includes(functionName)) throw new Error("Unapproved callable.");
  const annotations = serviceDescription?.metadata?.annotations || {};
  if (annotations["run.googleapis.com/invoker-iam-disabled"] !== "true") {
    throw new Error(`Invoker IAM baseline mismatch for ${functionName}.`);
  }
  if (normalizedPolicy(functionIam).length || normalizedPolicy(runIam).length) {
    throw new Error(`Unexpected IAM bindings for ${functionName}.`);
  }
  return true;
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
