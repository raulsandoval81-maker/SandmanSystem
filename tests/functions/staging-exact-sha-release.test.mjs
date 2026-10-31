import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  APPROVED_FUNCTIONS,
  STAGING_WIF_PROVIDER,
  TRUSTED_WORKFLOW_REF,
  functionConfiguration,
  loadRelease,
  validateRelease,
  validateFunctionConfiguration,
  validatePartialBootstrapState,
  validateRemotePreflight,
  verifyPreservedDeployment,
} from "../../scripts/staging/exact-sha-release-policy.mjs";
import {
  BUILD_ACCOUNT_PERMISSIONS,
  GCLOUD_DEPLOYER_PERMISSIONS,
  bootstrapPlan,
  deploymentPlan,
  permissionPlan,
  rollbackEvidence,
} from "../../scripts/staging/gcloud-function-release.mjs";
import {
  evaluateTestIamPermissionsResponse,
  evaluateTroubleshooterResponse,
  permissionChecks,
  policyTroubleshooterPrincipal,
  sanitizeErrorBody,
  summarizePermissionResults,
  verifyPermissionChecks,
} from "../../scripts/staging/verify-release-permissions.mjs";

test("attendance release accepts correctly configured environment variables regardless of manifest key order", async () => {
  const attendance = await loadRelease("cross-academy-pr253-e9980457");
  const cfg = attendance.expectedFunctionConfiguration;
  const name = "getPracticeAttendanceReview";
  const env = Object.fromEntries(Object.entries(cfg.environmentVariables).sort(([a], [b]) => a.localeCompare(b)));
  const description = {
    name: `projects/sandman-combat-staging/locations/us-central1/functions/${name}`,
    environment: "GEN_2",
    buildConfig: { runtime: "nodejs22", entryPoint: name,
      serviceAccount: `projects/sandman-combat-staging/serviceAccounts/${attendance.functionBuild}` },
    serviceConfig: {
      serviceAccountEmail: attendance.functionRuntime,
      availableCpu: cfg.availableCpu,
      availableMemory: cfg.availableMemory,
      timeoutSeconds: cfg.timeoutSeconds,
      maxInstanceCount: cfg.maxInstanceCount,
      maxInstanceRequestConcurrency: cfg.maxInstanceRequestConcurrency,
      ingressSettings: cfg.ingressSettings,
      environmentVariables: env,
    },
  };
  assert.equal(validateFunctionConfiguration(attendance, name, description).entryPoint, name);
  description.serviceConfig.environmentVariables.SANDMAN_STAGING_ACK = "wrong-project";
  assert.throws(() => validateFunctionConfiguration(attendance, name, description), /configuration mismatch/);
});

test("cross-academy release pins the dedicated attendance deployer for diagnostics, preflight, and deployments", async () => {
  const attendance = await loadRelease("cross-academy-pr253-e9980457");
  assert.equal(attendance.functionDeployer, "sandman-attendance-deployer@sandman-combat-staging.iam.gserviceaccount.com");
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  const selector = "inputs.release_id == 'cross-academy-pr253-e9980457'";
  assert.equal(workflow.split(selector).length - 1, 7);
  assert.match(workflow, /release\.functionDeployer !== \(\["cross-academy-pr253-e9980457", "guest-self-checkin-pr280-ef643228", "attendance-admin-init-pr308-0b06a778"\]\.includes\(process\.env\.RELEASE_ID\)/);
});

const release = await loadRelease("hybrid-pr99-5ed90c5c");
const practiceGroupsRelease = await loadRelease("practice-groups-pr113-27adc626");
const wrestlingWavesRelease = await loadRelease("r2c-wrestling-waves-pr115-18d46b08");
const hybridHandoffRelease = await loadRelease("hybrid-handoff-pr117-4a8402b9");
const stageFourRelease = await loadRelease("hybrid-stage4-pr120-8a122108");
const correctedStageFourRelease = await loadRelease("hybrid-stage4-fixed-pr122-7c625858");
const combatSetupRelease = await loadRelease("combat-setup-pr125-8a5ae0f2");
const correctedCombatRelease = await loadRelease("combat-setup-fixed-pr127-fcd6f016");
const finalCombatRelease = await loadRelease("combat-setup-regexfix-pr129-b7545f30");
const pr131Release = await loadRelease("combat-setup-final-pr131-ea296f66");
const pr133HandoffRelease = await loadRelease("hybrid-handoff-pr133-8af57906");
const pr138CombatRelease = await loadRelease("combat-setup-pr138-ca4e23be");
const pr150GroupsRelease = await loadRelease("tier-aware-groups-pr150-36374e8d");
const pr152UnifiedRelease = await loadRelease("unified-hybrid-pr152-0c2dc9d8");
const pr155AlignedRelease = await loadRelease("unified-hybrid-pr155-34fa3550");
const pr158AlignedRelease = await loadRelease("unified-hybrid-pr158-93379221");
const pr161ConsolidatedRelease = await loadRelease("hybrid-four-groups-pr161-0e25eb7e");
const pr163CorrectedRelease = await loadRelease("hybrid-four-groups-pr163-9dbc15b0");
const pr167AttendanceRelease = await loadRelease("attendance-step2-pr167-5682e26d");
const pr169HybridAckRelease = await loadRelease("hybrid-ack-pr169-4942bbdf");
const pr171ConsolidatedRelease = await loadRelease("groups-hybrid-pr171-e3316876");
const pr175ClipboardRelease = await loadRelease("clipboard-handoff-pr175-3ac894ff");
const pr177AttendanceRelease = await loadRelease("attendance-rims-pr177-29511f23");
const pr179ClipboardRelease = await loadRelease("clipboard-groups-pr179-56428746");
const pr181HybridRelease = await loadRelease("clipboard-hybrid-pr181-afe54629");
const pr183FixedRelease = await loadRelease("clipboard-hybrid-fix-pr183-dd89f6d3");
const pr185FixedRelease = await loadRelease("clipboard-hybrid-pr185-1848238c");
const pr187ValidatorRelease = await loadRelease("clipboard-hybrid-pr187-f4ff13f7");
const pr189CleanupRelease = await loadRelease("clipboard-cleanup-pr189-9484b8ab");
const pr191RedirectRelease = await loadRelease("clipboard-redirect-pr191-55e27c81");
const pr193WavesRelease = await loadRelease("clipboard-waves-pr193-c750a4cb");
const pr253CrossAcademyRelease = await loadRelease("cross-academy-pr253-e9980457");
const pr280GuestSelfCheckInRelease = await loadRelease("guest-self-checkin-pr280-ef643228");
const pr354BillingRelease = await loadRelease("billing-pr354-014198ea");
const pr376BillingRelease = await loadRelease("billing-pr376-dff3e6d3");
const context = (overrides = {}) => ({
  repository: release.repository,
  workflowRef: TRUSTED_WORKFLOW_REF,
  checkedOutSha: release.applicationSha,
  projectId: release.projectId,
  confirmProject: release.projectId,
  wifProvider: STAGING_WIF_PROVIDER,
  hostingDeployer: release.hostingDeployer,
  functionDeployer: release.functionDeployer,
  functionRuntime: release.functionRuntime,
  authorizationAvailable: true,
  ...overrides,
});
const marker = { projectId: release.projectId, environment: "staging", syntheticDataOnly: true };
const runtimes = Object.fromEntries(APPROVED_FUNCTIONS.map(name => [name, release.functionRuntime]));
const description = name => ({
  name: `projects/sandman-combat-staging/locations/us-central1/functions/${name}`,
  environment: "GEN_2",
  buildConfig: { runtime: "nodejs22", entryPoint: name },
  serviceConfig: {
    serviceAccountEmail: release.functionRuntime,
    availableCpu: "1", availableMemory: "256Mi", timeoutSeconds: 60,
    maxInstanceCount: 20, maxInstanceRequestConcurrency: 80, ingressSettings: "ALLOW_ALL",
    environmentVariables: {
      FIREBASE_CONFIG: "reserved",
      ...release.expectedFunctionConfiguration.environmentVariables,
    },
  },
});

test("PR354 Billing release pins the merged source, exact overlay, callables, and Stripe test secret", async () => {
  const result = validateRelease(pr354BillingRelease, context({
    checkedOutSha: pr354BillingRelease.applicationSha,
    hostingDeployer: pr354BillingRelease.hostingDeployer,
    functionDeployer: pr354BillingRelease.functionDeployer,
    functionRuntime: pr354BillingRelease.functionRuntime,
  }));
  assert.equal(result.applicationSha, "014198eac846c7109df51eb7a2ca44909a6aed40");
  assert.equal(result.requiredAncestorSha, "787cd495a6b219d99744128cee9360bf54dafdd7");
  assert.equal(result.hostingBaselineSha, "a44b602caef08c7e719cc7425436507d3f9b3c51");
  assert.equal(result.allowedChangedFiles.length, 24);
  assert.equal(result.hostingFiles.length, 8);
  assert.deepEqual(result.functions, [
    "recordProposalPrepaidCash",
    "recordProposalPriorPayment",
    "approveProposalRenewalAutopay",
    "createProposalAutopaySetup",
  ]);
  assert.deepEqual(result.newFunctions, result.functions);
  assert.equal(result.functionDeploymentTool, "gcloud-gen2");
  assert.deepEqual(result.bootstrap.functions, result.functions);
  assert.equal(result.expectedInvokerIamDisabled, true);
  assert.deepEqual(result.functionSecrets, {
    createProposalAutopaySetup: ["STRIPE_SECRET_KEY"],
  });
  assert.equal(validateRemotePreflight(result, {
    marker,
    runtimeByFunction: Object.fromEntries(result.functions.map(name => [name, "__absent__"])),
  }), true);

  const setupDescription = description("createProposalAutopaySetup");
  setupDescription.buildConfig.serviceAccount =
    `projects/sandman-combat-staging/serviceAccounts/${result.functionBuild}`;
  setupDescription.serviceConfig.secretEnvironmentVariables = [{ key: "STRIPE_SECRET_KEY" }];
  assert.equal(validateFunctionConfiguration(result, "createProposalAutopaySetup", setupDescription).entryPoint,
    "createProposalAutopaySetup");
  setupDescription.serviceConfig.secretEnvironmentVariables.push({ key: "LIVE_STRIPE_KEY" });
  assert.throws(() => validateFunctionConfiguration(result, "createProposalAutopaySetup", setupDescription),
    /configuration mismatch/);

  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(workflow, /billing-pr354-014198ea/);
  assert.match(workflow, /stripe_mode !== "test"/);
  assert.match(workflow, /recordProposalPrepaidCash\|recordProposalPriorPayment\|approveProposalRenewalAutopay\|createProposalAutopaySetup/);
  const permissionPreflight = permissionChecks(result);
  assert.ok(permissionPreflight.some(check => check.permissions.includes("cloudfunctions.functions.create")));
  assert.equal(permissionPreflight.filter(check => check.permissions?.includes("iam.serviceAccounts.actAs")).length, 2);
  assert.ok(permissionPreflight.some(check => check.permissions?.includes("run.services.update") &&
    check.resource.endsWith("/services/recordproposalprepaidcash")));
  assert.ok(permissionPreflight.some(check =>
    check.category === "billing-deployer-artifact-download" &&
    check.method === "TEST_IAM" &&
    check.principal === result.functionDeployer &&
    check.permissions.length === 1 &&
    check.permissions[0] === "artifactregistry.repositories.downloadArtifacts" &&
    check.url.endsWith("/repositories/gcf-artifacts:testIamPermissions")));
  assert.equal(permissionPreflight.filter(check => check.category === "build-account").length, 4);
});

test("PR376 corrected Billing release is immutable and preserves the reviewed recovery boundary", async () => {
  const result = validateRelease(pr376BillingRelease, context({
    checkedOutSha: pr376BillingRelease.applicationSha,
    hostingDeployer: pr376BillingRelease.hostingDeployer,
    functionDeployer: pr376BillingRelease.functionDeployer,
    functionRuntime: pr376BillingRelease.functionRuntime,
  }));
  assert.equal(result.applicationSha, "dff3e6d31c551b39fb3df3be5631c1331651efd6");
  assert.equal(result.requiredAncestorSha, "0476e6b677e331edcd4848e335042d63ca617f2d");
  assert.equal(result.sourcePr, 376);
  assert.equal(result.allowedChangedFiles.length, 10);
  assert.deepEqual(result.hostingFiles, pr354BillingRelease.hostingFiles);
  assert.equal(result.inheritedHostingReleaseId, "billing-pr354-014198ea");
  assert.equal(result.inheritedHostingFiles.length, 7);
  assert.equal(Object.keys(result.inheritedHostingFileGitShas).length, 7);
  assert.deepEqual(result.functions, pr354BillingRelease.functions);
  assert.deepEqual(result.newFunctions, result.functions);
  assert.deepEqual(result.functionSecrets, {
    createProposalAutopaySetup: ["STRIPE_SECRET_KEY"],
  });
  assert.notDeepEqual(result.partialBootstrap, pr354BillingRelease.partialBootstrap);
  assert.equal(result.partialBootstrap.recordProposalPrepaidCash.failedRun, 186);
  assert.equal(result.partialBootstrap.recordProposalPrepaidCash.revision, "recordproposalprepaidcash-00003-tuw");
  assert.equal(result.partialBootstrap.recordProposalPrepaidCash.runtimeServiceAccount,
    pr354BillingRelease.partialBootstrap.recordProposalPrepaidCash.runtimeServiceAccount);
  assert.equal(result.partialBootstrap.recordProposalPrepaidCash.firebaseFunctionsHash,
    pr354BillingRelease.partialBootstrap.recordProposalPrepaidCash.firebaseFunctionsHash);
  assert.deepEqual(result.buildPermissionResources, pr354BillingRelease.buildPermissionResources);
  assert.deepEqual(result.expectedFunctionConfiguration, pr354BillingRelease.expectedFunctionConfiguration);
  assert.equal(result.expectedInvokerIamDisabled, true);

  const runtimeByFunction = Object.fromEntries(result.functions.map(name => [name, "__absent__"]));
  runtimeByFunction.recordProposalPrepaidCash = result.partialBootstrap.recordProposalPrepaidCash.runtimeServiceAccount;
  assert.equal(validateRemotePreflight(result, { marker, runtimeByFunction }), true);

  const checks = permissionChecks(result);
  assert.ok(checks.some(check => check.permissions.includes("cloudfunctions.functions.create")));
  assert.ok(checks.some(check => check.permissions?.includes("run.services.update") &&
    check.resource.endsWith("/services/recordproposalprepaidcash")));
  assert.ok(checks.some(check => check.category === "billing-invoker-bootstrap" &&
    check.permissions?.includes("run.services.setIamPolicy") &&
    check.resource.endsWith("/services/recordproposalprepaidcash")));
  assert.equal(checks.filter(check => check.category === "build-account").length, 4);

  const cashPlan = deploymentPlan(result, "recordProposalPrepaidCash", "/tmp/immutable-functions", "update",
    { bootstrapVerified: true });
  assert.ok(cashPlan.args.includes("--clear-secrets"));
  const stripePlan = deploymentPlan(result, "createProposalAutopaySetup", "/tmp/immutable-functions", "update",
    { bootstrapVerified: true });
  assert.ok(stripePlan.args.includes("--set-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest"));
  const permissions = permissionPlan(result, "bootstrap");
  assert.ok(permissions.deployer.includes("run.services.update"));
  assert.ok(!permissions.deployer.includes("run.services.setIamPolicy"));

  assert.throws(() => validateRelease({ ...result, inheritedHostingFiles: ["public/unreviewed.js"] }, context({
    checkedOutSha: result.applicationSha,
  })), /Unapproved inherited Hosting source/);
  assert.throws(() => validateRelease({ ...result, partialBootstrap: {} }, context({
    checkedOutSha: result.applicationSha,
  })), /Unexpected partial callable bootstrap state/);

  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(workflow, /billing-pr376-dff3e6d3/);
});

test("PR354 Billing recovery uses the reviewed no-invoker-IAM bootstrap without policy writes", () => {
  const cashPlan = deploymentPlan(pr354BillingRelease, "recordProposalPrepaidCash", "/tmp/immutable-functions", "update",
    { bootstrapVerified: true });
  assert.ok(cashPlan.args.includes("--clear-secrets"));
  assert.ok(!cashPlan.args.some(arg => arg.includes("allow-unauthenticated")));
  const stripePlan = deploymentPlan(pr354BillingRelease, "createProposalAutopaySetup", "/tmp/immutable-functions", "update",
    { bootstrapVerified: true });
  assert.ok(stripePlan.args.includes("--set-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest"));
  const bootstrap = bootstrapPlan(pr354BillingRelease, "/tmp/immutable-functions", "recordProposalPrepaidCash");
  assert.ok(bootstrap.invokerConfiguration.args.includes("--no-invoker-iam-check"));
  assert.ok(!bootstrap.invokerConfiguration.args.some(arg => arg.includes("allow-unauthenticated")));
  const permissions = permissionPlan(pr354BillingRelease, "bootstrap");
  assert.ok(permissions.deployer.includes("run.services.update"));
  assert.ok(!permissions.deployer.includes("run.services.setIamPolicy"));
});

test("PR376 Billing recovery pins run 186's changed partial service and fails closed on drift", () => {
  const partial = pr376BillingRelease.partialBootstrap.recordProposalPrepaidCash;
  assert.equal(partial.failedRun, 186);
  assert.equal(partial.state, "ACTIVE");
  assert.equal(partial.updateTime, "2026-10-30T22:15:09.910193854Z");
  assert.equal(partial.revision, "recordproposalprepaidcash-00003-tuw");
  assert.equal(partial.sourceGeneration, "1793398443214656");
  assert.equal(partial.firebaseFunctionsHash, "6ef605c5798974131134cb96cd4fc85c66ccec76");
  const description = {
    state: partial.state,
    updateTime: partial.updateTime,
    labels: { "firebase-functions-hash": partial.firebaseFunctionsHash },
    buildConfig: { source: { storageSource: {
      bucket: "gcf-v2-sources-991554514268-us-central1",
      object: "recordProposalPrepaidCash/function-source.zip",
      generation: partial.sourceGeneration,
    } } },
    serviceConfig: { revision: partial.revision, serviceAccountEmail: partial.runtimeServiceAccount },
  };
  assert.equal(validatePartialBootstrapState(pr376BillingRelease, "recordProposalPrepaidCash", description,
    { metadata: { annotations: {} } }, { bindings: [] }, { bindings: [] }), true);
  for (const [field, changed] of [
    ["updateTime", "2026-10-29T05:40:36.218901630Z"],
    ["revision", "recordproposalprepaidcash-00001-riz"],
  ]) {
    const drifted = structuredClone(description);
    if (field === "revision") drifted.serviceConfig.revision = changed;
    else drifted[field] = changed;
    assert.throws(() => validatePartialBootstrapState(pr376BillingRelease, "recordProposalPrepaidCash",
      drifted, { metadata: { annotations: {} } }, {}, {}), /evidence mismatch/);
  }
  assert.throws(() => validatePartialBootstrapState(pr376BillingRelease, "recordProposalPrepaidCash", description,
    { metadata: { annotations: { "run.googleapis.com/invoker-iam-disabled": "true" } } }, {}, {}),
    /IAM state mismatch/);
});

test("PR354 Billing recovery pins run 169's partial service and preserves deletion as a separate approval", () => {
  const partial = pr354BillingRelease.partialBootstrap.recordProposalPrepaidCash;
  const description = {
    state: partial.state,
    updateTime: partial.updateTime,
    labels: { "firebase-functions-hash": partial.firebaseFunctionsHash },
    buildConfig: { source: { storageSource: {
      bucket: "gcf-v2-sources-991554514268-us-central1",
      object: "recordProposalPrepaidCash/function-source.zip",
      generation: partial.sourceGeneration,
    } } },
    serviceConfig: { revision: partial.revision, serviceAccountEmail: partial.runtimeServiceAccount },
  };
  assert.equal(validatePartialBootstrapState(pr354BillingRelease, "recordProposalPrepaidCash", description,
    { metadata: { annotations: {} } }, { etag: "ACAB" }, { etag: "ACAB" }), true);
  const drifted = structuredClone(description);
  drifted.serviceConfig.revision = "unexpected-revision";
  assert.throws(() => validatePartialBootstrapState(pr354BillingRelease, "recordProposalPrepaidCash", drifted,
    { metadata: { annotations: {} } }, {}, {}), /evidence mismatch/);
  assert.throws(() => validatePartialBootstrapState(pr354BillingRelease, "recordProposalPrepaidCash", description,
    { metadata: { annotations: { "run.googleapis.com/invoker-iam-disabled": "true" } } }, {}, {}), /IAM state mismatch/);

  const descriptions = Object.fromEntries(pr354BillingRelease.functions.map(name => [name, { absent: true }]));
  descriptions.recordProposalPrepaidCash = description;
  const evidence = rollbackEvidence(pr354BillingRelease, descriptions);
  const cash = evidence.functions.find(value => value.name === "recordProposalPrepaidCash");
  assert.equal(cash.priorState, "release-created-partial");
  assert.equal(cash.failedRun, 169);
  assert.equal(cash.rollback, "delete-partial-new-function-with-separate-approval");
});

test("approved application source is a full immutable SHA", () => {
  assert.equal(validateRelease(release, context()).applicationSha, "5ed90c5c8eb609e86319a5b5b188642764157dd8");
});

test("PR 113 is independently pinned to its exact SHA and PR 99 ancestor", () => {
  const result = validateRelease(practiceGroupsRelease, context({
    checkedOutSha: practiceGroupsRelease.applicationSha,
    hostingDeployer: practiceGroupsRelease.hostingDeployer,
    functionDeployer: practiceGroupsRelease.functionDeployer,
    functionRuntime: practiceGroupsRelease.functionRuntime,
  }));
  assert.equal(result.applicationSha, "27adc626925d0ebb5449fc2cffb87c787e0af381");
  assert.equal(result.requiredAncestorSha, "5ed90c5c8eb609e86319a5b5b188642764157dd8");
  assert.deepEqual(result.functions, []);
  assert.equal(result.hosting, true);
  assert.equal(result.allowedChangedFiles.length, 9);
});

test("PR 115 is independently pinned to its exact SHA and PR 113 ancestor", () => {
  const result = validateRelease(wrestlingWavesRelease, context({
    checkedOutSha: wrestlingWavesRelease.applicationSha,
    hostingDeployer: wrestlingWavesRelease.hostingDeployer,
    functionDeployer: wrestlingWavesRelease.functionDeployer,
    functionRuntime: wrestlingWavesRelease.functionRuntime,
  }));
  assert.equal(result.applicationSha, "18d46b08c152fd296ef95cc302aabc94fd472085");
  assert.equal(result.requiredAncestorSha, "27adc626925d0ebb5449fc2cffb87c787e0af381");
  assert.equal(result.sourcePr, 115);
  assert.deepEqual(result.functions, []);
  assert.equal(result.hosting, true);
  assert.deepEqual(result.allowedChangedFiles, [
    "public/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-crosswalk.js",
    "public/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-policy.js",
    "public/coaches/execution/session-builder/hybrid-planning-policy.js",
    "public/coaches/execution/session-builder/session-builder.js",
    "scripts/generate-youth-wrestling-browser-manifest.mjs",
    "tests/functions/road2champion-wrestling-tier-waves.test.mjs",
  ]);
});

test("PR 117 is pinned to the PR 115 ancestor and only handoff files", () => {
  const result = validateRelease(hybridHandoffRelease, context({
    checkedOutSha: hybridHandoffRelease.applicationSha,
    hostingDeployer: hybridHandoffRelease.hostingDeployer,
    functionDeployer: hybridHandoffRelease.functionDeployer,
    functionRuntime: hybridHandoffRelease.functionRuntime,
  }));
  assert.equal(result.applicationSha, "4a8402b914b485de46c13eba4c6664054d18a75b");
  assert.equal(result.requiredAncestorSha, "18d46b08c152fd296ef95cc302aabc94fd472085");
  assert.equal(result.sourcePr, 117);
  assert.equal(result.hosting, true);
  assert.deepEqual(result.functions, []);
  assert.deepEqual(result.allowedChangedFiles, [
    "public/coaches/attendance/session.js",
    "public/coaches/execution/session-builder/session-builder.js",
    "tests/functions/checkin-hybrid-clipboard-route.test.mjs",
  ]);
});

test("PR 120 staging release preserves exact source, ancestor and Hosting-only guard", () => {
  assert.equal(stageFourRelease.sourcePr, 120);
  assert.equal(stageFourRelease.applicationSha, "8a122108c3e2e82f89ba93a99ce167b208e84b09");
  assert.equal(stageFourRelease.requiredAncestorSha, "44180e5c309a0e6388aae2161833c02d13602cc6");
  assert.equal(stageFourRelease.projectId, "sandman-combat-staging");
  assert.equal(stageFourRelease.hosting, true);
  assert.deepEqual(stageFourRelease.functions, []);
  assert.deepEqual(stageFourRelease.allowedChangedFiles, [
    "public/coaches/attendance/hybrid-group-planning.js",
    "public/coaches/attendance/session.html",
    "public/coaches/attendance/session.js",
    "public/coaches/execution/session-builder/session-builder.js",
    "tests/functions/post-attendance-hybrid-placement.test.mjs"
  ]);
});

test("corrected PR122 Stage IV release is pinned without Function changes", () => {
  assert.equal(correctedStageFourRelease.applicationSha, "7c6258589af2cdaef5f8e0dbb3ec599aad74e7a7");
  assert.equal(correctedStageFourRelease.requiredAncestorSha, "44180e5c309a0e6388aae2161833c02d13602cc6");
  assert.equal(correctedStageFourRelease.sourcePr, 122);
  assert.equal(correctedStageFourRelease.projectId, "sandman-combat-staging");
  assert.equal(correctedStageFourRelease.hosting, true);
  assert.deepEqual(correctedStageFourRelease.functions, []);
  assert.deepEqual(correctedStageFourRelease.allowedChangedFiles, stageFourRelease.allowedChangedFiles);
});

test("Combat Setup PR125 is a pinned Hosting-only staging release", () => {
  assert.equal(combatSetupRelease.applicationSha, "8a5ae0f232aaa7e93eda814185ebabd2e8e3b5e1");
  assert.equal(combatSetupRelease.requiredAncestorSha, "7c6258589af2cdaef5f8e0dbb3ec599aad74e7a7");
  assert.equal(combatSetupRelease.sourcePr, 125);
  assert.equal(combatSetupRelease.projectId, "sandman-combat-staging");
  assert.equal(combatSetupRelease.hosting, true);
  assert.deepEqual(combatSetupRelease.functions, []);
  assert.deepEqual(combatSetupRelease.allowedChangedFiles, [
    "public/coaches/execution/session-builder/index.html",
    "public/coaches/execution/session-builder/session-builder.js",
    "public/coaches/execution/session-builder/session-entry-policy.js",
    "tests/functions/combined-practice-setup.test.mjs",
    "tests/functions/verified-coach-training-environments.test.mjs"
  ]);
});

test("corrected PR127 Combat release retains staging-only Hosting guard", () => {
  assert.equal(correctedCombatRelease.applicationSha, "fcd6f016d29a436a43c984b93edfa8e7aa664546");
  assert.equal(correctedCombatRelease.requiredAncestorSha, "7c6258589af2cdaef5f8e0dbb3ec599aad74e7a7");
  assert.equal(correctedCombatRelease.sourcePr, 127);
  assert.equal(correctedCombatRelease.projectId, "sandman-combat-staging");
  assert.equal(correctedCombatRelease.hosting, true);
  assert.deepEqual(correctedCombatRelease.functions, []);
  assert.deepEqual(correctedCombatRelease.allowedChangedFiles,
    [...combatSetupRelease.allowedChangedFiles, "tests/functions/checkin-hybrid-clipboard-route.test.mjs"].sort());
});

test("corrected PR129 Combat release pins only the approved staging revision", () => {
  assert.equal(finalCombatRelease.applicationSha, "b7545f30bf0a4eba009c5d94edc7464e82275345");
  assert.equal(finalCombatRelease.requiredAncestorSha, correctedCombatRelease.requiredAncestorSha);
  assert.equal(finalCombatRelease.sourcePr, 129);
  assert.equal(finalCombatRelease.projectId, "sandman-combat-staging");
  assert.equal(finalCombatRelease.hosting, true);
  assert.deepEqual(finalCombatRelease.functions, []);
  assert.deepEqual(finalCombatRelease.allowedChangedFiles, correctedCombatRelease.allowedChangedFiles);
});

test("PR131 Combat release pins the repaired Setup test on staging Hosting only", () => {
  assert.equal(pr131Release.applicationSha, "ea296f66538aa93e11a7c793433c6eaf9732370e");
  assert.equal(pr131Release.requiredAncestorSha, finalCombatRelease.requiredAncestorSha);
  assert.equal(pr131Release.sourcePr, 131);
  assert.equal(pr131Release.projectId, "sandman-combat-staging");
  assert.equal(pr131Release.hosting, true);
  assert.deepEqual(pr131Release.functions, []);
  assert.deepEqual(pr131Release.allowedChangedFiles, finalCombatRelease.allowedChangedFiles);
});

test("PR133 HYBRID handoff release stays scoped to staged Hosting changes", () => {
  assert.equal(pr133HandoffRelease.applicationSha, "8af57906ed241e32a80e151ae844dff7c0b4bb6c");
  assert.equal(pr133HandoffRelease.requiredAncestorSha, pr131Release.applicationSha);
  assert.equal(pr133HandoffRelease.sourcePr, 133);
  assert.equal(pr133HandoffRelease.projectId, "sandman-combat-staging");
  assert.equal(pr133HandoffRelease.hosting, true);
  assert.deepEqual(pr133HandoffRelease.functions, []);
  assert.deepEqual(pr133HandoffRelease.allowedChangedFiles, [
    "public/coaches/execution/session-builder/session-builder.js",
    "tests/functions/hybrid-clipboard-handoff-recovery.test.mjs"
  ]);
});

test("PR138 Combat release pins the reviewed lineage as Hosting-only", () => {
  assert.equal(pr138CombatRelease.applicationSha, "ca4e23bec9ae63f162d690b20249133281755ea9");
  assert.equal(pr138CombatRelease.requiredAncestorSha, finalCombatRelease.applicationSha);
  assert.equal(pr138CombatRelease.sourcePr, 138);
  assert.equal(pr138CombatRelease.projectId, "sandman-combat-staging");
  assert.equal(pr138CombatRelease.hosting, true);
  assert.deepEqual(pr138CombatRelease.functions, []);
  assert.deepEqual(pr138CombatRelease.allowedChangedFiles, [
    "public/coaches/attendance/session.js",
    "public/coaches/execution/session-builder/index.html",
    "public/coaches/execution/session-builder/session-builder.css",
    "public/coaches/execution/session-builder/session-builder.js",
    "tests/functions/attendance-submitted-resume.test.mjs",
    "tests/functions/combined-practice-setup.test.mjs",
    "tests/functions/hybrid-clipboard-handoff-recovery.test.mjs"
  ]);
});

test("PR150 tier-aware groups release pins the merged five-file Hosting-only change", () => {
  const result = validateRelease(pr150GroupsRelease, context({
    checkedOutSha: pr150GroupsRelease.applicationSha,
    hostingDeployer: pr150GroupsRelease.hostingDeployer,
    functionDeployer: pr150GroupsRelease.functionDeployer,
    functionRuntime: pr150GroupsRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 150);
  assert.equal(result.applicationSha, "36374e8d806513503868ae8a664cddae7780eea9");
  assert.equal(result.requiredAncestorSha, "21824f473f0b942ed3353bd00a0015c966c98148");
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.hosting, true);
  assert.deepEqual(result.functions, []);
  assert.deepEqual(result.allowedChangedFiles, [
    "public/coaches/attendance/attendance.css",
    "public/coaches/attendance/practice-group-policy.js",
    "public/coaches/attendance/session.html",
    "public/coaches/attendance/session.js",
    "tests/functions/practice-group-policy.test.mjs",
  ]);
});

test("PR152 unified HYBRID release pins the merge lineage and exact deployment scope", () => {
  const result = validateRelease(pr152UnifiedRelease, context({
    checkedOutSha: pr152UnifiedRelease.applicationSha,
    hostingDeployer: pr152UnifiedRelease.hostingDeployer,
    functionDeployer: pr152UnifiedRelease.functionDeployer,
    functionRuntime: pr152UnifiedRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 152);
  assert.equal(result.applicationSha, "0c2dc9d8063b7a4e6bb2405bd46306c3bbc6a445");
  assert.equal(result.requiredAncestorSha, "d4720ee180ff0508b4402aa3231d0c77b8cb1d8d");
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.hosting, true);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/deploy-sandman-hosting.yml",
    "functions/src/practice/practiceSessions.ts",
    "public/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-crosswalk.js",
    "public/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-policy.js",
    "public/coaches/attendance/attendance.css",
    "public/coaches/attendance/hybrid-group-planning.js",
    "public/coaches/attendance/session.html",
    "public/coaches/attendance/session.js",
    "public/coaches/execution/big-clock-2.0/big-clock-2.0.js",
    "public/coaches/execution/clipboard-2.0/clipboard-2.0.js",
    "public/coaches/execution/clipboard-2.0/index.html",
    "public/coaches/execution/session-builder/hybrid-planning-policy.js",
    "public/coaches/execution/session-builder/index.html",
    "public/coaches/execution/session-builder/session-builder.css",
    "public/coaches/execution/session-builder/session-builder.js",
    "public/coaches/execution/session-builder/session-entry-policy.js",
    "tests/functions/attendance-step3-status.test.mjs",
    "tests/functions/attendance-submitted-resume.test.mjs",
    "tests/functions/checkin-hybrid-clipboard-route.test.mjs",
    "tests/functions/combined-practice-setup.test.mjs",
    "tests/functions/hybrid-clipboard-handoff-recovery.test.mjs",
    "tests/functions/hybrid-review-presentation.test.mjs",
    "tests/functions/hybrid-session-planning-policy.test.mjs",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/road2champion-wrestling-tier-waves.test.mjs",
    "tests/functions/verified-coach-training-environments.test.mjs"
  ]);
});

test("PR155 staging retry is isolated and pinned to the corrected immutable SHA", () => {
  const result = validateRelease(pr155AlignedRelease, context({
    checkedOutSha: pr155AlignedRelease.applicationSha,
    hostingDeployer: pr155AlignedRelease.hostingDeployer,
    functionDeployer: pr155AlignedRelease.functionDeployer,
    functionRuntime: pr155AlignedRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 155);
  assert.equal(result.applicationSha, "34fa3550d17c351492d629cbd61b0a3ea25bb59e");
  assert.equal(result.requiredAncestorSha, "0c2dc9d8063b7a4e6bb2405bd46306c3bbc6a445");
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/session-builder-entry-policy.test.mjs",
    "tests/functions/session-builder-session-memory.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs",
  ]);
});

test("PR158 corrected source remains pinned to staging and the two practice Functions", () => {
  const result = validateRelease(pr158AlignedRelease, context({
    checkedOutSha: pr158AlignedRelease.applicationSha,
    hostingDeployer: pr158AlignedRelease.hostingDeployer,
    functionDeployer: pr158AlignedRelease.functionDeployer,
    functionRuntime: pr158AlignedRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 158);
  assert.equal(result.applicationSha, "9337922168002df4533596c4f991d94ff8041d83");
  assert.equal(result.requiredAncestorSha, "34fa3550d17c351492d629cbd61b0a3ea25bb59e");
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/session-builder-entry-policy.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
});

test("PR160/161 consolidated staging release preserves immutable safety boundaries", () => {
  const result = validateRelease(pr161ConsolidatedRelease, context({
    checkedOutSha: pr161ConsolidatedRelease.applicationSha,
    hostingDeployer: pr161ConsolidatedRelease.hostingDeployer,
    functionDeployer: pr161ConsolidatedRelease.functionDeployer,
    functionRuntime: pr161ConsolidatedRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 161);
  assert.equal(result.applicationSha, "0e25eb7e81670d2e958950b0b95198ae7978c486");
  assert.equal(result.requiredAncestorSha, "9337922168002df4533596c4f991d94ff8041d83");
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
  assert.equal(result.allowedChangedFiles.length, 12);
});

test("PR163 corrected source remains restricted to staging", () => {
  const result = validateRelease(pr163CorrectedRelease, context({
    checkedOutSha: pr163CorrectedRelease.applicationSha,
    hostingDeployer: pr163CorrectedRelease.hostingDeployer,
    functionDeployer: pr163CorrectedRelease.functionDeployer,
    functionRuntime: pr163CorrectedRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 163);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
});

test("PR167 attendance transition release uses exact staged source and five-file allowlist", () => {
  const result = validateRelease(pr167AttendanceRelease, context({
    checkedOutSha: pr167AttendanceRelease.applicationSha,
    hostingDeployer: pr167AttendanceRelease.hostingDeployer,
    functionDeployer: pr167AttendanceRelease.functionDeployer,
    functionRuntime: pr167AttendanceRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 167);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "5682e26d1f3780bd18591f9d477c323ad0cc9140");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/session.js",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR169 HYBRID acknowledgment release remains restricted to staging and five reviewed files", () => {
  const result = validateRelease(pr169HybridAckRelease, context({
    checkedOutSha: pr169HybridAckRelease.applicationSha,
    hostingDeployer: pr169HybridAckRelease.hostingDeployer,
    functionDeployer: pr169HybridAckRelease.functionDeployer,
    functionRuntime: pr169HybridAckRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 169);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "4942bbdf4869a56bf6697558c8b2a20bd0dd9c7a");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/session.js",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("merged PR171 and PR172 consolidated release uses verified six-file staging diff", () => {
  const result = validateRelease(pr171ConsolidatedRelease, context({
    checkedOutSha: pr171ConsolidatedRelease.applicationSha,
    hostingDeployer: pr171ConsolidatedRelease.hostingDeployer,
    functionDeployer: pr171ConsolidatedRelease.functionDeployer,
    functionRuntime: pr171ConsolidatedRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 171);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "e331687695b7484989311c06d05b31fff008c04a");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/attendance.css",
    "public/coaches/attendance/session.js",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("merged PR174 and PR175 staging handoff has the exact seven-file allowlist", () => {
  const result = validateRelease(pr175ClipboardRelease, context({
    checkedOutSha: pr175ClipboardRelease.applicationSha,
    hostingDeployer: pr175ClipboardRelease.hostingDeployer,
    functionDeployer: pr175ClipboardRelease.functionDeployer,
    functionRuntime: pr175ClipboardRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 175);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "3ac894ff68ef238dc5a38a03a1ad3c8499e8a8da");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/attendance.css",
    "public/coaches/attendance/session.js",
    "public/coaches/execution/session-builder/session-builder.js",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR177 attendance visuals stage only the approved seven-file diff", () => {
  const result = validateRelease(pr177AttendanceRelease, context({
    checkedOutSha: pr177AttendanceRelease.applicationSha,
    hostingDeployer: pr177AttendanceRelease.hostingDeployer,
    functionDeployer: pr177AttendanceRelease.functionDeployer,
    functionRuntime: pr177AttendanceRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 177);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "29511f23307ed5ae59a4d3344c6673895a9c6010");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/attendance.css",
    "public/coaches/attendance/session.html",
    "public/coaches/attendance/session.js",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR179 clipboard disclosure is restricted to staging and approved changed files", () => {
  const result = validateRelease(pr179ClipboardRelease, context({
    checkedOutSha: pr179ClipboardRelease.applicationSha,
    hostingDeployer: pr179ClipboardRelease.hostingDeployer,
    functionDeployer: pr179ClipboardRelease.functionDeployer,
    functionRuntime: pr179ClipboardRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 179);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "56428746e92de994abdcaff7b17d07adcaff5131");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/execution/clipboard-2.0/clipboard-2.0.css",
    "public/coaches/execution/clipboard-2.0/clipboard-2.0.js",
    "public/coaches/execution/clipboard-2.0/index.html",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR181 HYBRID Clipboard deployment is scoped to staging exact SHA", () => {
  const result = validateRelease(pr181HybridRelease, context({
    checkedOutSha: pr181HybridRelease.applicationSha,
    hostingDeployer: pr181HybridRelease.hostingDeployer,
    functionDeployer: pr181HybridRelease.functionDeployer,
    functionRuntime: pr181HybridRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 181);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "afe54629a650a2d11d5e57c35858a36c15fed4e1");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/session.js",
    "public/coaches/execution/clipboard-2.0/clipboard-2.0.css",
    "public/coaches/execution/clipboard-2.0/clipboard-2.0.js",
    "public/coaches/execution/clipboard-2.0/index.html",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR183 corrected Clipboard validation stages only the exact approved source", () => {
  const result = validateRelease(pr183FixedRelease, context({
    checkedOutSha: pr183FixedRelease.applicationSha,
    hostingDeployer: pr183FixedRelease.hostingDeployer,
    functionDeployer: pr183FixedRelease.functionDeployer,
    functionRuntime: pr183FixedRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 183);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "dd89f6d3ffa346b71df8ee6e17133883b937b6f4");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/hybrid-session-planning-policy.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR185 three corrected routing tests remain staging-only at exact source SHA", () => {
  const result = validateRelease(pr185FixedRelease, context({
    checkedOutSha: pr185FixedRelease.applicationSha,
    hostingDeployer: pr185FixedRelease.hostingDeployer,
    functionDeployer: pr185FixedRelease.functionDeployer,
    functionRuntime: pr185FixedRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 185);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "1848238cb37241aa53469981c6d758434ca05304");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/attendance-step3-status.test.mjs",
    "tests/functions/attendance-submitted-resume.test.mjs",
    "tests/functions/hybrid-review-presentation.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR187 validator correction is restricted to staging exact SHA", () => {
  const result = validateRelease(pr187ValidatorRelease, context({
    checkedOutSha: pr187ValidatorRelease.applicationSha,
    hostingDeployer: pr187ValidatorRelease.hostingDeployer,
    functionDeployer: pr187ValidatorRelease.functionDeployer,
    functionRuntime: pr187ValidatorRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 187);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "f4ff13f7a845e2fa4db16e0b412c5ef6e54f117b");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR189 Attendance cleanup stages only the approved six-file SHA", () => {
  const result = validateRelease(pr189CleanupRelease, context({
    checkedOutSha: pr189CleanupRelease.applicationSha,
    hostingDeployer: pr189CleanupRelease.hostingDeployer,
    functionDeployer: pr189CleanupRelease.functionDeployer,
    functionRuntime: pr189CleanupRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 189);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "9484b8ab15e54cdef0913cf9be1fdeb4669d7ab1");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/attendance/session.html",
    "public/coaches/execution/session-builder/session-builder.js",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR191 pre-render HYBRID redirect uses only the approved staging SHA", () => {
  const result = validateRelease(pr191RedirectRelease, context({
    checkedOutSha: pr191RedirectRelease.applicationSha,
    hostingDeployer: pr191RedirectRelease.hostingDeployer,
    functionDeployer: pr191RedirectRelease.functionDeployer,
    functionRuntime: pr191RedirectRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 191);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "55e27c8146b064a08fdbd0cc47ea7cba979ba294");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/staging-exact-sha-release.yml",
    "public/coaches/execution/session-builder/index.html",
    "scripts/staging/approved-exact-sha-releases.json",
    "tests/functions/post-attendance-hybrid-placement.test.mjs",
    "tests/functions/staging-exact-sha-release.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("PR193 automatic HYBRID Wave coordination pins staging-only source", () => {
  const result = validateRelease(pr193WavesRelease, context({
    checkedOutSha: pr193WavesRelease.applicationSha,
    hostingDeployer: pr193WavesRelease.hostingDeployer,
    functionDeployer: pr193WavesRelease.functionDeployer,
    functionRuntime: pr193WavesRelease.functionRuntime
  }));
  assert.equal(result.sourcePr, 193);
  assert.equal(result.projectId, "sandman-combat-staging");
  assert.equal(result.applicationSha, "c750a4cbe953c03e498d223295c5bd6279a80217");
  assert.deepEqual(result.allowedChangedFiles, [
    "public/coaches/execution/clipboard-2.0/clipboard-2.0.js",
    "public/coaches/execution/clipboard-2.0/index.html",
    "tests/functions/post-attendance-hybrid-placement.test.mjs"
  ]);
  assert.deepEqual(result.functions, ["savePracticeSessionMemory", "closePracticeSession"]);
});

test("invalid and unapproved source revisions are rejected", async () => {
  assert.throws(() => validateRelease(release, context({ checkedOutSha: "a".repeat(40) })), /approved SHA/);
  await assert.rejects(loadRelease("unreviewed-release"), /not approved/);
});

test("PR253 cross-academy release pins the exact source, Hosting client, and attendance callables", () => {
  const result = validateRelease(pr253CrossAcademyRelease, context({
    checkedOutSha: pr253CrossAcademyRelease.applicationSha,
    hostingDeployer: pr253CrossAcademyRelease.hostingDeployer,
    functionDeployer: pr253CrossAcademyRelease.functionDeployer,
    functionRuntime: pr253CrossAcademyRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 253);
  assert.equal(result.applicationSha, "e998045771fd2f0d92cba5615185175fd8299dfd");
  assert.equal(result.requiredAncestorSha, "d052d1de915faf0ed16eca4c0134f00fd2b78289");
  assert.equal(result.hosting, true);
  assert.ok(result.allowedChangedFiles.includes("public/coaches/attendance/session.js"));
  assert.deepEqual(result.functions, [
    "searchPracticeAttendanceAthletes",
    "getPracticeAttendanceReview",
    "updatePracticeCheckIn",
    "finalizePracticeAttendance",
  ]);
  assert.deepEqual(result.newFunctions, ["searchPracticeAttendanceAthletes"]);
  assert.equal(result.functionDeploymentTool, "gcloud-gen2");
  assert.deepEqual(result.bootstrap, {
    function: "searchPracticeAttendanceAthletes", approvalRequired: true, routineDeployMayCreate: false,
  });
  assert.equal(validateRemotePreflight(result, {
    marker,
    runtimeByFunction: Object.fromEntries(result.functions.map(name => [
      name,
      result.newFunctions.includes(name) ? "__absent__" : result.functionRuntime,
    ])),
  }), true);
  assert.throws(() => validateRelease({
    ...result,
    functions: result.functions.slice(0, -1),
  }, context({
    checkedOutSha: result.applicationSha,
    hostingDeployer: result.hostingDeployer,
    functionDeployer: result.functionDeployer,
    functionRuntime: result.functionRuntime,
  })), /Unexpected function/);
  assert.throws(() => validateRelease({
    ...result,
    newFunctions: ["finalizePracticeAttendance"],
  }, context({
    checkedOutSha: result.applicationSha,
    hostingDeployer: result.hostingDeployer,
    functionDeployer: result.functionDeployer,
    functionRuntime: result.functionRuntime,
  })), /Unexpected new function/);
});

test("PR280 guest self-check-in has a separate exact authorization and one callable", () => {
  const result = validateRelease(pr280GuestSelfCheckInRelease, context({
    checkedOutSha: pr280GuestSelfCheckInRelease.applicationSha,
    hostingDeployer: pr280GuestSelfCheckInRelease.hostingDeployer,
    functionDeployer: pr280GuestSelfCheckInRelease.functionDeployer,
    functionRuntime: pr280GuestSelfCheckInRelease.functionRuntime,
  }));
  assert.equal(result.sourcePr, 280);
  assert.equal(result.applicationSha, "ef643228c4a54a4324ef2058a5134888caf1417e");
  assert.equal(result.requiredAncestorSha, "be72d6d4d8dd6f009a28a2475ccfc1ef304596fc");
  assert.deepEqual(result.functions, ["updatePracticeCheckIn"]);
  assert.deepEqual(result.newFunctions, []);
  assert.equal(result.hostingBaselineSha, pr253CrossAcademyRelease.applicationSha);
  assert.deepEqual(result.hostingFiles, [
    "public/coaches/attendance/session.html",
    "public/coaches/attendance/session.js",
  ]);
  assert.equal(validateRemotePreflight(result, {
    marker,
    runtimeByFunction: { updatePracticeCheckIn: result.functionRuntime },
  }), true);
});

test("PR280 rejects broadened callables and Hosting overlays", () => {
  const releaseContext = context({
    checkedOutSha: pr280GuestSelfCheckInRelease.applicationSha,
    hostingDeployer: pr280GuestSelfCheckInRelease.hostingDeployer,
    functionDeployer: pr280GuestSelfCheckInRelease.functionDeployer,
    functionRuntime: pr280GuestSelfCheckInRelease.functionRuntime,
  });
  assert.throws(() => validateRelease({
    ...pr280GuestSelfCheckInRelease,
    functions: ["updatePracticeCheckIn", "getPracticeAttendanceReview"],
  }, releaseContext), /Unexpected function/);
  assert.throws(() => validateRelease({
    ...pr280GuestSelfCheckInRelease,
    hostingFiles: [...pr280GuestSelfCheckInRelease.hostingFiles, "public/index.html"],
  }, releaseContext), /outside the reviewed application diff/);
});

test("PR305 Coach Companion remote control is pinned to seven files and one callable", async () => {
  const result = await loadRelease("coach-companion-remote-pr305-11539235");
  const releaseContext = context({
    checkedOutSha: result.applicationSha,
    hostingDeployer: result.hostingDeployer,
    functionDeployer: result.functionDeployer,
    functionRuntime: result.functionRuntime,
  });
  assert.equal(validateRelease(result, releaseContext), result);
  assert.equal(result.sourcePr, 305);
  assert.equal(result.applicationSha, "11539235059ed69a226aa2b6b5a58fee9007d9b5");
  assert.equal(result.requiredAncestorSha, "3c0c583090cbb809b9626b3a11d2cf133445df6e");
  assert.deepEqual(result.allowedChangedFiles, [
    "functions/src/practice/practiceSessions.ts",
    "public/coaches/execution/big-clock-2.0/big-clock-2.0.js",
    "public/coaches/execution/big-clock-2.0/index.html",
    "public/coaches/execution/coach-companion/coach-companion.js",
    "public/coaches/execution/coach-companion/index.html",
    "public/coaches/execution/engine/practice-remote-control.mjs",
    "tests/functions/coach-companion-remote-control.test.mjs",
  ]);
  assert.deepEqual(result.hostingFiles, result.allowedChangedFiles.filter(file => file.startsWith("public/")));
  assert.deepEqual(result.functions, ["savePracticeSessionMemory"]);
  assert.deepEqual(result.newFunctions, []);
  assert.equal(result.hostingSite, "sandman-combat-staging");
  assert.equal(result.expectedFunctionConfiguration.region, "us-central1");
  assert.equal(result.expectedFunctionConfiguration.runtime, "nodejs22");
  assert.equal(validateRemotePreflight(result, {
    marker,
    runtimeByFunction: { savePracticeSessionMemory: result.functionRuntime },
  }), true);
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(workflow, /coach-companion-remote-pr305-11539235/);
  assert.match(workflow, /tests\/functions\/coach-companion-remote-control\.test\.mjs/);
});

test("PR305 rejects a second callable or unrelated Hosting file", async () => {
  const result = await loadRelease("coach-companion-remote-pr305-11539235");
  const releaseContext = context({
    checkedOutSha: result.applicationSha,
    hostingDeployer: result.hostingDeployer,
    functionDeployer: result.functionDeployer,
    functionRuntime: result.functionRuntime,
  });
  assert.throws(() => validateRelease({
    ...result,
    functions: ["savePracticeSessionMemory", "closePracticeSession"],
  }, releaseContext), /Unexpected function/);
  assert.throws(() => validateRelease({
    ...result,
    hostingFiles: [...result.hostingFiles, "public/index.html"],
  }, releaseContext), /outside the reviewed application diff/);
});

test("PR305 validation uses Clipboard-first routing and four-group safeguards", async () => {
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  const lines = workflow.split("\n");
  const conditionBefore = pattern => {
    const assertionIndex = lines.findIndex(line => line.includes(pattern));
    assert.notEqual(assertionIndex, -1, `missing workflow assertion: ${pattern}`);
    return lines.slice(0, assertionIndex).findLast(line => line.trimStart().startsWith("if test \"${RELEASE_ID}\""));
  };
  const releaseId = "coach-companion-remote-pr305-11539235";
  assert.match(conditionBefore("/coaches/execution/clipboard-2.0/?session="), new RegExp(releaseId));
  assert.match(conditionBefore("NORMAL_TRAINING_GROUP_CAPACITY = 3"), new RegExp(releaseId));
  const result = await loadRelease(releaseId);
  assert.equal(result.applicationSha, "11539235059ed69a226aa2b6b5a58fee9007d9b5");
});

test("PR308 staging attendance cold-start recovery is immutable and function-only", async () => {
  const release = await loadRelease("attendance-admin-init-pr308-0b06a778");
  const approved = context({
    checkedOutSha: release.applicationSha,
    hostingDeployer: release.hostingDeployer,
    functionDeployer: release.functionDeployer,
    functionRuntime: release.functionRuntime,
  });
  assert.equal(validateRelease(release, approved), release);
  assert.equal(release.applicationSha, "0b06a778e66f532589695ef96642f41b7c092985");
  assert.deepEqual(release.allowedChangedFiles, [
    "functions/src/services/staffAuthorization.ts",
    "tests/functions/staging-practice-admin-initialization.test.mjs",
  ]);
  assert.equal(release.hosting, false);
  assert.deepEqual(release.functions, ["updatePracticeCheckIn"]);
  assert.deepEqual(release.newFunctions, []);
  assert.throws(() => validateRelease({ ...release, hosting: true }, approved), /must not deploy Hosting/);
  assert.throws(() => validateRelease({ ...release, functions: ["savePracticeSessionMemory"] }, approved), /attendance-callable-only/);
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(workflow, /attendance-admin-init-pr308-0b06a778/);
  assert.match(workflow, /Explicitly skip Hosting for attendance-only recovery/);
  assert.match(workflow, /Assert Hosting was not modified for attendance-only recovery/);
  const packager = await readFile("scripts/staging/prepare-exact-sha-release.mjs", "utf8");
  assert.match(packager, /"attendance-admin-init-pr308-0b06a778"\]\.includes\(release\.releaseId\)/);
  assert.match(packager, /module\.exports = \{ updatePracticeCheckIn: require\("\.\/lib\/practice\/practiceSessions\.js"\)\.updatePracticeCheckIn \};/);
  assert.match(workflow, /if: \$\{\{ inputs\.release_id != 'attendance-admin-init-pr308-0b06a778' \}\}/);
  assert.match(workflow, /function-deploy-receipt-/);

});

test("PR325 final Winter Wrestling release is immutable and five-file Hosting-only", async () => {
  const result = await loadRelease("promotions-final-pr325-c4df1254");
  const approved = context({
    repository: result.repository,
    checkedOutSha: result.applicationSha,
    projectId: result.projectId,
    confirmProject: result.projectId,
    hostingDeployer: result.hostingDeployer,
    functionDeployer: result.functionDeployer,
    functionRuntime: result.functionRuntime,
  });
  assert.equal(validateRelease(result, approved), result);
  assert.equal(result.sourcePr, 325);
  assert.equal(result.applicationSha, "6eba4d30395f7eaa100c5f3326c0a89033f6a689");
  assert.equal(result.requiredAncestorSha, "bc732da79132d32aee977fcb3e7afd771a51ef74");
  assert.deepEqual(result.allowedChangedFiles, [
    ".github/workflows/release-winter-wrestling-production.yml",
    "public/connect/admissions-requests/index.html",
    "public/promotions/winter-wrestling/index.html",
    "public/promotions/winter-wrestling/winter-wrestling.js",
    "scripts/production/winter-wrestling-production-release.json",
    "tests/functions/promotions-routing-contract.test.mjs",
    "tests/functions/winter-wrestling-production-release.test.mjs",
  ]);
  assert.deepEqual(result.hostingFiles, [
    "public/connect/admissions-requests/admissions-requests.js",
    "public/connect/admissions-requests/index.html",
    "public/connect/try-a-class/try-a-class.js",
    "public/promotions/winter-wrestling/index.html",
    "public/promotions/winter-wrestling/winter-wrestling.js",
  ]);
  assert.deepEqual(result.inheritedHostingFiles, [
    "public/connect/admissions-requests/admissions-requests.js",
    "public/connect/try-a-class/try-a-class.js",
  ]);
  assert.deepEqual(result.functions, []);
  assert.deepEqual(result.newFunctions, []);
  assert.throws(() => validateRelease({
    ...result,
    inheritedHostingFiles: [...result.inheritedHostingFiles, "public/index.html"],
  }, approved), /Unapproved inherited Hosting source/);
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(workflow, /promotions-final-pr325-c4df1254/);
  assert.match(workflow, /node --test application-source\/tests\/functions\/promotions-routing-contract\.test\.mjs/);
});

test("production project is rejected", () => {
  assert.throws(() => validateRelease(release, context({ projectId: "sandmandashboard" })), /staging Firebase project/);
});

test("wrong WIF provider and deployer identities are rejected", () => {
  assert.throws(() => validateRelease(release, context({ wifProvider: "projects/1/other" })), /WIF provider/);
  assert.throws(() => validateRelease(release, context({ hostingDeployer: "personal@example.com" })), /Hosting deployer/);
  assert.throws(() => validateRelease(release, context({ functionDeployer: "personal@example.com" })), /function deployer/);
});

test("unexpected function target is rejected", () => {
  assert.throws(() => validateRelease({ ...release, functions: [...release.functions, "openPracticeSession"] }, context()), /Unexpected function/);
});

test("Hosting-only releases skip callable runtime preflight but preserve the synthetic marker gate", () => {
  assert.equal(validateRemotePreflight(practiceGroupsRelease, { marker, runtimeByFunction: {} }), true);
  assert.equal(validateRemotePreflight(wrestlingWavesRelease, { marker, runtimeByFunction: {} }), true);
  assert.throws(() => validateRemotePreflight(practiceGroupsRelease, {
    marker: { ...marker, syntheticDataOnly: false }, runtimeByFunction: {},
  }), /marker/);
});

test("missing or incorrect synthetic marker is rejected", () => {
  assert.throws(() => validateRemotePreflight(release, { runtimeByFunction: runtimes }), /marker/);
  assert.throws(() => validateRemotePreflight(release, { marker: { ...marker, syntheticDataOnly: false }, runtimeByFunction: runtimes }), /marker/);
});

test("unverified and unauthorized runtime identities are rejected", () => {
  assert.throws(() => validateRemotePreflight(release, { marker, runtimeByFunction: {} }), /unverified/);
  assert.throws(() => validateRemotePreflight(release, { marker, runtimeByFunction: { ...runtimes, closePracticeSession: "other@example.com" } }), /unauthorized/);
});

test("unavailable protected authorization is rejected", () => {
  assert.throws(() => validateRelease(release, context({ authorizationAvailable: false })), /authorization is unavailable/);
});

test("existing callable runtime settings are exact and runtime migration is rejected", () => {
  for (const name of APPROVED_FUNCTIONS) {
    assert.equal(validateFunctionConfiguration(release, name, description(name)).entryPoint, name);
    const changed = structuredClone(description(name));
    changed.serviceConfig.serviceAccountEmail = "sandman-practice-runtime@sandman-combat-staging.iam.gserviceaccount.com";
    assert.throws(() => validateFunctionConfiguration(release, name, changed), /configuration mismatch/);
  }
  assert.equal(functionConfiguration(description(APPROVED_FUNCTIONS[0])).region, "us-central1");
});

test("workflow keeps trusted tooling separate from application source and exact targets", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /path: trusted-tooling/);
  assert.match(workflow, /path: application-source/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.application_sha \}\}/);
  assert.match(workflow, /merge-base --is-ancestor/);
  assert.match(workflow, /approved-release-files/);
  assert.match(workflow, /r2c-wrestling-waves-pr115-18d46b08/);
  assert.match(workflow, /combat-setup-pr138-ca4e23be/);
  assert.match(workflow, /tier-aware-groups-pr150-36374e8d/);
  assert.match(workflow, /unified-hybrid-pr152-0c2dc9d8/);
  assert.match(workflow, /unified-hybrid-pr155-34fa3550/);
  assert.match(workflow, /unified-hybrid-pr158-93379221/);
  assert.match(workflow, /hybrid-four-groups-pr161-0e25eb7e/);
  assert.match(workflow, /hybrid-four-groups-pr163-9dbc15b0/);
  assert.match(workflow, /attendance-step2-pr167-5682e26d/);
  assert.match(workflow, /hybrid-ack-pr169-4942bbdf/);
  assert.match(workflow, /groups-hybrid-pr171-e3316876/);
  assert.match(workflow, /clipboard-handoff-pr175-3ac894ff/);
  assert.match(workflow, /attendance-rims-pr177-29511f23/);
  assert.match(workflow, /clipboard-groups-pr179-56428746/);
  assert.match(workflow, /clipboard-hybrid-pr181-afe54629/);
  assert.match(workflow, /clipboard-hybrid-fix-pr183-dd89f6d3/);
  assert.match(workflow, /clipboard-hybrid-pr185-1848238c/);
  assert.match(workflow, /clipboard-hybrid-pr187-f4ff13f7/);
  assert.match(workflow, /clipboard-cleanup-pr189-9484b8ab/);
  assert.match(workflow, /clipboard-redirect-pr191-55e27c81/);
  assert.match(workflow, /cross-academy-pr253-e9980457/);
  assert.match(workflow, /road2champion-wrestling-tier-waves\.test\.mjs/);
  assert.match(workflow, /hybrid-clipboard-handoff-recovery\.test\.mjs/);
  assert.match(workflow, /attendance-submitted-resume\.test\.mjs/);
  assert.match(workflow, /MAX_TRAINING_GROUPS = 4/);
  assert.match(workflow, /fourGroupAcknowledgement/);
  assert.match(workflow, /! grep -q 'trainingGroups\.slice\(0, 3\)'/);
  assert.match(workflow, /road2champion-wrestling-tier-wave-crosswalk\.js/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /if test "\$\{RELEASE_ID\}" = "xp-client-auth-pr240-ee96af6a"; then\s+\(\s+cd application-source\s+node --test\s+\\/);
  assert.match(workflow, /--only hosting/);
  assert.match(workflow, /savePracticeSessionMemory/);
  assert.match(workflow, /closePracticeSession/);
  assert.doesNotMatch(workflow, /firestore:rules|storage:rules|--only functions(?!:)/);
});

test("PR240 validation selects direct Clipboard routing and four-group safeguards", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const lines = workflow.split("\n");
  const conditionBefore = assertion => {
    const assertionIndex = lines.findIndex(line => line.includes(assertion));
    assert.ok(assertionIndex > 0, `Missing workflow assertion: ${assertion}`);
    return lines[assertionIndex - 1];
  };

  assert.match(
    conditionBefore("grep -Fq '/coaches/execution/clipboard-2.0/?session='"),
    /xp-client-auth-pr240-ee96af6a/
  );
  assert.match(
    conditionBefore("grep -q 'NORMAL_TRAINING_GROUP_CAPACITY = 3'"),
    /xp-client-auth-pr240-ee96af6a/
  );
  assert.equal(
    lines.filter(line => line.includes("grep -q 'autoBlocked = selectedMode === \"auto\"'")).length,
    1
  );
});

test("PR253 validation uses modern Attendance branches and manifest-driven callable safeguards", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const lines = workflow.split("\n");
  const conditionBefore = assertion => {
    const assertionIndex = lines.findIndex(line => line.includes(assertion));
    assert.ok(assertionIndex > 0, `Missing workflow assertion: ${assertion}`);
    return lines[assertionIndex - 1];
  };

  assert.match(conditionBefore("grep -Fq '/coaches/execution/clipboard-2.0/?session='"), /cross-academy-pr253-e9980457/);
  assert.match(conditionBefore("grep -q 'NORMAL_TRAINING_GROUP_CAPACITY = 3'"), /cross-academy-pr253-e9980457/);
  assert.match(workflow, /function_matrix=.*JSON\.stringify/);
  assert.match(workflow, /fromJSON\(needs\.validate-source\.outputs\.function_matrix\)/);
  assert.match(workflow, /r\.functions\.map\(n=>\{const d=JSON\.parse/);
  assert.match(workflow, /d\.absent\?"__absent__"/);
  assert.match(workflow, /if \(before\.absent\)/);
  assert.match(workflow, /searchPracticeAttendanceAthletes\|getPracticeAttendanceReview\|updatePracticeCheckIn\|finalizePracticeAttendance/);
  assert.match(workflow, /tests\/functions\/cross-training-policy\.test\.mjs/);
  assert.match(workflow, /tests\/functions\/practice-attendance-lanes\.test\.mjs/);
});

test("workflow separates validation from protected explicit deployment", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /- validate\s*\n/);
  assert.match(workflow, /- diagnose\s*\n/);
  assert.match(workflow, /^\s+- deploy\s*$/m);
  const diagnoseJob = workflow.match(/^  diagnose-authorization:\n([\s\S]*?)(?=^  validate-source:)/m)?.[1];
  const validateJob = workflow.match(/^  validate-source:\n([\s\S]*?)(?=^  preflight:)/m)?.[1];
  const functionsJob = workflow.match(/^  deploy-functions:\n([\s\S]*?)(?=^  deploy-hosting:)/m)?.[1];
  const hostingJob = workflow.match(/^  deploy-hosting:\n([\s\S]*)$/m)?.[1];
  assert.ok(diagnoseJob, "Diagnostic job definition exists");
  assert.ok(validateJob, "Validation job definition exists");
  assert.ok(functionsJob, "Functions job definition exists");
  assert.ok(hostingJob, "Hosting job definition exists");
  assert.match(diagnoseJob, /^    if: \$\{\{ inputs\.action == 'diagnose' \}\}/m);
  assert.match(validateJob, /^    if: \$\{\{ inputs\.action == 'validate' \|\| inputs\.action == 'deploy' \}\}/m);
  assert.doesNotMatch(validateJob, /inputs\.action == 'bootstrap-billing'/);
  assert.match(functionsJob, /^    if: \$\{\{ inputs\.action == 'deploy' \}\}/m);
  assert.match(hostingJob, /^    if: \$\{\{ inputs\.action == 'deploy' \}\}/m);
  assert.match(functionsJob, /needs\.validate-source\.outputs\.deploy_functions == 'true'/);
  assert.match(workflow, /environment: staging/);
});

test("diagnostic action stays read-only inside the trusted workflow identity", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const diagnoseJob = workflow.match(/^  diagnose-authorization:\n([\s\S]*?)(?=^  validate-source:)/m)?.[1];
  assert.ok(diagnoseJob);
  assert.match(diagnoseJob, /GITHUB_WORKFLOW_REF.*staging-exact-sha-release\.yml@refs\/heads\/main/);
  assert.match(diagnoseJob, /environment: staging/);
  assert.match(diagnoseJob, /inputs\.release_id == 'cross-academy-pr253-e9980457'/);
  assert.match(diagnoseJob, /sandman-attendance-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(diagnoseJob, /sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(diagnoseJob, /service_account: \$\{\{ \(inputs\.release_id == 'cross-academy-pr253-e9980457'/);
  assert.equal((diagnoseJob.match(/EXPECTED_FUNCTION_DEPLOYER:/g) || []).length, 2);
  assert.equal((diagnoseJob.match(/const expected = process\.env\.EXPECTED_FUNCTION_DEPLOYER/g) || []).length, 2);
  assert.doesNotMatch(diagnoseJob, /const expected = "sandman-practice-deployer/);
  assert.match(diagnoseJob, /value\.type !== "external_account" \|\| impersonationTarget !== expected/);
  assert.match(diagnoseJob, /authenticated_principal: impersonationTarget/);
  assert.match(diagnoseJob, /value\.email !== expected/);
  assert.doesNotMatch(diagnoseJob, /gcloud auth list/);
  assert.match(diagnoseJob, /firebase\.projects\.get/);
  assert.match(diagnoseJob, /serviceusage\.services\.use/);
  assert.match(diagnoseJob, /x-goog-user-project: sandman-combat-staging/);
  assert.match(diagnoseJob, /normal_request/);
  assert.match(diagnoseJob, /explicit_quota_project_request/);
  assert.match(diagnoseJob, /message: sanitizedMessage\(body\.error\.message\)/);
  assert.match(diagnoseJob, /redacted\.slice\(0, 512\)/);
  assert.doesNotMatch(diagnoseJob, /firebase-tools|firebase deploy|gcloud functions deploy|add-iam-policy-binding|set-iam-policy/);
});

test("Functions job preserves external configuration and targets one named callable", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const fnJob = workflow.match(/^  deploy-functions:\n([\s\S]*?)(?=^  deploy-hosting:)/m)?.[1];
  assert.ok(fnJob);
  assert.match(fnJob, /firebase-tools@15\.11\.0 deploy/);
  assert.match(fnJob, /functions:default:\$\{\{ matrix\.function_name \}\}/);
  assert.match(fnJob, /gcloud-function-release\.mjs deploy/);
  const build = await readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
  const entry = await readFile(new URL("../../scripts/staging/staging-release-entry.cjs", import.meta.url), "utf8");
  assert.match(build, /firebase\.functions\.json/);
  assert.match(entry, /preserveExternalChanges: true/);
  assert.match(entry, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(workflow, /callableTrigger/);
  assert.match(workflow, /get-iam-policy/);
});

test("artifact preparation omits Functions for a Hosting-only immutable release", async () => {
  const build = await readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
  assert.match(build, /if \(release\.functions\.length\)/);
  assert.match(build, /hosting: release\.hosting !== false/);
});

test("callable discovery isolates incompatible WIF credentials and restores them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sandman-wif-discovery-"));
  try {
    await mkdir(path.join(root, "lib"), { recursive: true });
    await mkdir(path.join(root, "node_modules/firebase-functions/v2"), { recursive: true });
    const entryTemplate = await readFile(new URL("../../scripts/staging/staging-release-entry.cjs", import.meta.url), "utf8");
    await writeFile(path.join(root, "staging-release-entry.cjs"),
      entryTemplate.replace("__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__", release.functionRuntime));
    await writeFile(path.join(root, "node_modules/firebase-functions/v2/options.js"),
      `exports.setGlobalOptions = options => { if (options.preserveExternalChanges !== true || options.serviceAccount !== ${JSON.stringify(release.functionRuntime)}) throw new Error("runtime options changed"); };\n`);
    await writeFile(path.join(root, "lib/staging.js"), [
      'if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("Admin SDK saw WIF credential file");',
      'if (process.env.GOOGLE_GHA_CREDS_PATH) throw new Error("Admin SDK saw GitHub credential path");',
      'if (process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) throw new Error("Admin SDK saw Cloud SDK override");',
      'exports.savePracticeSessionMemory = { __endpoint: { callableTrigger: {} } };',
      'exports.closePracticeSession = { __endpoint: { callableTrigger: {} } };',
      '',
    ].join("\n"));
    const runner = [
      'const entry = require("./staging-release-entry.cjs");',
      'for (const name of ["savePracticeSessionMemory", "closePracticeSession"]) if (!entry[name]?.__endpoint?.callableTrigger) process.exit(64);',
      'for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_GHA_CREDS_PATH", "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE"]) if (process.env[name] !== "/tmp/external-account.json") process.exit(65);',
    ].join("\n");
    const result = spawnSync(process.execPath, ["-e", runner], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GOOGLE_APPLICATION_CREDENTIALS: "/tmp/external-account.json",
        GOOGLE_GHA_CREDS_PATH: "/tmp/external-account.json",
        CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: "/tmp/external-account.json",
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated endpoints pin dedicated runtime/build identities without App Engine default access", async () => {
  const entry = await readFile(new URL("../../scripts/staging/staging-release-entry.cjs", import.meta.url), "utf8");
  const build = await readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(entry, /serviceAccount: "__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__"/);
  assert.match(build, /replace\("__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__", release\.functionRuntime\)/);
  assert.match(workflow, /:testIamPermissions/);
  assert.match(workflow, /iam\.serviceAccounts\.actAs/);
  assert.doesNotMatch(workflow, /sandman-combat-staging@appspot\.gserviceaccount\.com/);
  const verifier = await readFile(new URL("../../scripts/staging/verify-release-permissions.mjs", import.meta.url), "utf8");
  assert.match(verifier, /policytroubleshooter\.googleapis\.com\/v3\/iam:troubleshoot/);
  assert.match(verifier, /buildPermissionResources/);
  assert.match(workflow, /r\.functionRuntime/);
  assert.match(workflow, /Missing aggregate service-account permissions/);
  assert.match(verifier, /service-account-actAs/);
  assert.doesNotMatch(workflow, /add-iam-policy-binding|set-iam-policy|roles\/iam\.serviceAccountUser/);
});

test("PR253 gcloud plan is immutable, exact, and never uses the App Engine default identity", () => {
  const name = "getPracticeAttendanceReview";
  const plan = deploymentPlan(pr253CrossAcademyRelease, name, "/tmp/immutable-functions");
  const joined = plan.args.join(" ");
  assert.equal(plan.executable, "gcloud");
  assert.match(joined, /functions deploy getPracticeAttendanceReview --gen2/);
  assert.match(joined, /--project=sandman-combat-staging/);
  assert.match(joined, /--run-service-account=sandman-attendance-runtime@/);
  assert.match(joined, /--build-service-account=projects\/sandman-combat-staging\/serviceAccounts\/sandman-attendance-build@/);
  assert.match(joined, /--update-env-vars=/);
  assert.doesNotMatch(joined, /--set-env-vars=/);
  assert.doesNotMatch(joined, /appspot|sandmandashboard|--allow-unauthenticated/);
  assert.throws(() => deploymentPlan(pr253CrossAcademyRelease, "xpHttp", "/tmp/functions"), /allowlist/);
  assert.throws(() => deploymentPlan(pr253CrossAcademyRelease, "searchPracticeAttendanceAthletes", "/tmp/functions"), /bootstrap/);
  assert.equal(deploymentPlan(pr253CrossAcademyRelease, "searchPracticeAttendanceAthletes", "/tmp/functions", "update", { bootstrapVerified: true }).functionName,
    "searchPracticeAttendanceAthletes");
});

test("new callable bootstrap is a separate approval plan preserving callable application auth", () => {
  const plan = bootstrapPlan(pr253CrossAcademyRelease, "/tmp/immutable-functions");
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.deploy.mode, "bootstrap");
  assert.equal(plan.deploy.functionName, "searchPracticeAttendanceAthletes");
  assert.equal(plan.preserveCallableApplicationAuth, true);
  assert.ok(plan.invokerConfiguration.args.includes("--no-invoker-iam-check"));
  assert.ok(!plan.deploy.args.includes("--allow-unauthenticated"));
});

test("aggregate permission plan covers deployer, runtime, build, and build execution", () => {
  const plan = permissionPlan(pr253CrossAcademyRelease);
  assert.deepEqual(plan.deployer, [...GCLOUD_DEPLOYER_PERMISSIONS].sort());
  assert.deepEqual(plan.build, [...BUILD_ACCOUNT_PERMISSIONS].sort());
  assert.deepEqual(plan.serviceAccounts.map(value => value.account), [
    pr253CrossAcademyRelease.functionRuntime, pr253CrossAcademyRelease.functionBuild,
  ]);
  assert.ok(plan.serviceAccounts.every(value => value.permissions.includes("iam.serviceAccounts.actAs")));
});

test("permission preflight batches supported checks on real staging resources", async () => {
  const checks = permissionChecks(pr253CrossAcademyRelease);
  assert.equal(checks.length, 12);
  assert.equal(checks.filter(value => value.method === "TROUBLESHOOT").length, 5);
  assert.ok(checks.some(value => value.method === "TEST_IAM" &&
    value.permissions.includes("cloudfunctions.functions.update") && value.resource.includes("getPracticeAttendanceReview")));
  assert.ok(checks.some(value => value.method === "TEST_IAM" &&
    value.permissions.includes("iam.serviceAccounts.actAs") && value.resource.startsWith("//iam.googleapis.com/")));
  assert.ok(checks.some(value => value.category === "build-account" &&
    value.resource.startsWith("//artifactregistry.googleapis.com/")));
  assert.ok(checks.some(value => value.method === "GET" && value.permission === "cloudfunctions.locations.list"));
  assert.ok(!checks.some(value => value.resource.includes("preflight-placeholder")));
  assert.ok(!checks.some(value => value.resource.includes("searchPracticeAttendanceAthletes")));
  assert.ok(!checks.some(value => value.permission === "policytroubleshooter.iam.troubleshoot"));
  assert.ok(checks.every(value => value.principal.includes("@") && !value.principal.startsWith("//iam.googleapis.com/")));
  assert.throws(() => permissionChecks({ ...pr253CrossAcademyRelease, projectId: "sandmandashboard" }), /staging-only/);
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const preflight = workflow.match(/^  preflight:\n([\s\S]*?)(?=^  deploy-functions:)/m)?.[1];
  assert.ok(preflight);
  assert.doesNotMatch(preflight, /cloudresourcemanager\.googleapis\.com\/v1\/projects\/sandman-combat-staging:testIamPermissions/);
});

test("Policy Troubleshooter HTTP 400 is an API error, sanitized, retained, and fails closed", async () => {
  const check = permissionChecks(pr253CrossAcademyRelease).find(value => value.method === "TROUBLESHOOT");
  const results = await verifyPermissionChecks([check], {
    accessToken: "not-logged",
    fetchImpl: async () => ({ status: 400, text: async () => JSON.stringify({ error: {
      code: 400, message: "Invalid permission; Authorization: Bearer secret-token", status: "INVALID_ARGUMENT",
    } }) }),
  });
  assert.equal(results[0].result, "API_ERROR");
  assert.equal(results[0].status, 400);
  assert.match(results[0].detail, /INVALID_ARGUMENT/);
  assert.doesNotMatch(results[0].detail, /secret-token/);
  assert.equal(summarizePermissionResults(results).authorized, false);
});

test("missing IAM grants and inconclusive responses are reported separately", () => {
  const check = { category: "routine-deployer", principal: pr253CrossAcademyRelease.functionDeployer,
    permission: "cloudfunctions.functions.update", resource: "//cloudfunctions.googleapis.com/projects/p/locations/r/functions/f" };
  const missing = evaluateTroubleshooterResponse({ status: 200, body: { overallAccessState: "CANNOT_ACCESS" } }, check);
  const malformed = evaluateTroubleshooterResponse({ status: 200, body: { allowPolicyExplanation: {} } }, check);
  assert.equal(missing.result, "MISSING");
  assert.equal(malformed.result, "INCONCLUSIVE");
  assert.deepEqual(malformed.diagnosticEvidence, {
    reason: "missing_overall_access_state", overallAccessState: null, allowAccessState: null, denyAccessState: null,
  });
  const summary = summarizePermissionResults([missing, malformed]);
  assert.deepEqual(summary.totals, { checks: 2, granted: 0, missing: 1, inconclusive: 1, apiErrors: 0,
    resourceNotFound: 0, inspectionDenied: 0 });
  assert.equal(summary.authorized, false);
});

test("successful Policy Troubleshooter v3 authorization uses overallAccessState", async () => {
  const checks = permissionChecks(pr253CrossAcademyRelease).filter(value => value.method === "TROUBLESHOOT").slice(0, 2);
  const seen = [];
  const results = await verifyPermissionChecks(checks, {
    accessToken: "short-lived-token",
    fetchImpl: async (_url, init) => {
      seen.push(JSON.parse(init.body));
      return { status: 200, text: async () => JSON.stringify({ overallAccessState: "CAN_ACCESS" }) };
    },
  });
  assert.equal(summarizePermissionResults(results).authorized, true);
  assert.ok(results.every(value => value.result === "GRANTED"));
  assert.equal(seen[0].accessTuple.principal, pr253CrossAcademyRelease.functionBuild);
  assert.ok(!("access" in results[0]));
});

test("unknown and conditional Policy Troubleshooter states expose only sanitized enum diagnostics", () => {
  const check = { category: "build-account", principal: pr253CrossAcademyRelease.functionBuild,
    permission: "storage.objects.get", resource: "staging-resource" };
  const conditional = evaluateTroubleshooterResponse({ status: 200, body: {
    overallAccessState: "UNKNOWN_CONDITIONAL",
    allowPolicyExplanation: { allowAccessState: "UNKNOWN_INFO", policies: [{ bindings: ["do-not-log"] }] },
    denyPolicyExplanation: { denyAccessState: "DENY_ACCESS_STATE_UNSPECIFIED", policies: [{ rules: ["do-not-log"] }] },
    accessTuple: { principal: "do-not-log@example.com" },
  } }, check);
  assert.equal(conditional.result, "INCONCLUSIVE");
  assert.deepEqual(conditional.diagnosticEvidence, {
    reason: "inconclusive_overall_access_state",
    overallAccessState: "UNKNOWN_CONDITIONAL",
    allowAccessState: "UNKNOWN_INFO",
    denyAccessState: "DENY_ACCESS_STATE_UNSPECIFIED",
  });
  assert.doesNotMatch(JSON.stringify(conditional), /do-not-log/);
  assert.equal(summarizePermissionResults([conditional]).authorized, false);

  const unknown = evaluateTroubleshooterResponse({ status: 200, body: {
    overallAccessState: "FUTURE_STATE Bearer secret-token",
    allowPolicyExplanation: { allowAccessState: "access_token=secret" },
  } }, check);
  assert.equal(unknown.result, "INCONCLUSIVE");
  assert.equal(unknown.diagnosticEvidence.reason, "unknown_overall_access_state");
  assert.doesNotMatch(JSON.stringify(unknown.diagnosticEvidence), /secret-token|access_token=secret/);
  assert.match(unknown.detail, /overallAccessState/);
  assert.equal(summarizePermissionResults([unknown]).authorized, false);
});

test("Billing invoker preflight rejects missing Cloud Run IAM policy permission", async () => {
  const check = permissionChecks(pr376BillingRelease).find(v => v.category === "billing-invoker-bootstrap");
  assert.ok(check);
  assert.ok(check.permissions.includes("run.services.setIamPolicy"));
  const deny = await verifyPermissionChecks([check], { accessToken: "synthetic",
    fetchImpl: async () => ({ status: 200, text: async () =>
      JSON.stringify({ permissions: ["run.services.get", "run.services.update"] }) }) });
  assert.equal(summarizePermissionResults(deny).authorized, false);
  assert.ok(deny.some(v => v.permission === "run.services.setIamPolicy" && v.result === "MISSING"));
});

test("Billing deployer repository image-pull permission fails closed before Cloud Run update", async () => {
  const check = permissionChecks(pr376BillingRelease).find(value =>
    value.category === "billing-deployer-artifact-download");
  assert.ok(check);
  assert.equal(check.resource, "//artifactregistry.googleapis.com/projects/sandman-combat-staging/locations/us-central1/repositories/gcf-artifacts");
  const calls = [];
  const granted = await verifyPermissionChecks([check], { accessToken: "synthetic-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { status: 200, text: async () =>
        JSON.stringify({ permissions: ["artifactregistry.repositories.downloadArtifacts"] }) };
    } });
  assert.equal(granted[0].result, "GRANTED");
  assert.deepEqual(calls[0].body, { permissions: ["artifactregistry.repositories.downloadArtifacts"] });
  const denied = await verifyPermissionChecks([check], { accessToken: "synthetic-token",
    fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify({ permissions: [] }) }) });
  assert.equal(denied[0].result, "MISSING");
  assert.equal(summarizePermissionResults(denied).authorized, false);
  const malformed = await verifyPermissionChecks([check], { accessToken: "synthetic-token",
    fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify({}) }) });
  assert.equal(malformed[0].result, "INCONCLUSIVE");
  assert.equal(summarizePermissionResults(malformed).authorized, false);
});

test("Billing Storage preflight validates the exact scoped policy and denies, never bucket-wide access", async () => {
  const check = permissionChecks(pr354BillingRelease).find(value =>
    value.category === "build-account" && value.permission === "storage.objects.get");
  assert.equal(check.method, "STORAGE_POLICY");
  assert.match(check.resource, /\/objects\/recordProposalPrepaidCash\/function-source\.zip$/);
  const seen = [];
  const policy = { version: 3, bindings: [{
    role: "roles/storage.objectViewer",
    members: [`serviceAccount:${pr354BillingRelease.functionBuild}`],
    condition: { expression: 'resource.name.startsWith("projects/_/buckets/gcf-v2-sources-991554514268-us-central1/objects/")' },
  }] };
  const fetchImpl = async (url, init) => {
    seen.push({ url, method: init.method, body: init.body });
    return { status: 200, text: async () => JSON.stringify(url.includes("getIamPolicy") ? policy : {}) };
  };
  const result = await verifyPermissionChecks([check], { accessToken: "synthetic-short-lived-token", fetchImpl });
  assert.equal(result[0].result, "GRANTED");
  assert.match(result[0].verificationBasis, /not an object access probe/);
  assert.equal(seen.length, 2);
  assert.deepEqual(JSON.parse(seen[0].body), { options: { requestedPolicyVersion: 3 } });
  assert.match(seen[1].url, /\/denypolicies$/);
  for (const altered of [
    { ...policy, bindings: [{ ...policy.bindings[0], condition: undefined }] },
    { ...policy, bindings: [{ ...policy.bindings[0], condition: { expression: 'resource.name.startsWith("projects/_/buckets/")' } }] },
    { ...policy, bindings: [] },
  ]) {
    const results = await verifyPermissionChecks([check], { accessToken: "synthetic",
      fetchImpl: async (url) => ({ status: 200, text: async () =>
        JSON.stringify(url.includes("getIamPolicy") ? altered : {}) }) });
    assert.equal(summarizePermissionResults(results).authorized, false);
  }
  const denied = await verifyPermissionChecks([check], { accessToken: "synthetic",
    fetchImpl: async url => ({ status: 200, text: async () =>
      JSON.stringify(url.includes("getIamPolicy") ? policy : { policies: [{ name: "deny" }] }) }) });
  assert.equal(denied[0].result, "INCONCLUSIVE");
  assert.equal(summarizePermissionResults(denied).authorized, false);
});

test("Billing never promotes condition matches or unknown deny decisions to authorized", () => {
  const check = permissionChecks(pr354BillingRelease).find(value =>
    value.category === "build-account" && value.permission === "storage.objects.get");
  const membership = `serviceAccount:${pr354BillingRelease.functionBuild}`;
  const policy = { explainedPolicies: [{ bindingExplanations: [{
    role: "roles/storage.objectViewer", rolePermission: "ROLE_PERMISSION_INCLUDED",
    memberships: { [membership]: { membership: "MEMBERSHIP_INCLUDED" } },
    condition: { expression: 'resource.name.startsWith("projects/_/buckets/gcf-v2-sources-991554514268-us-central1/objects/")' },
  }] }] };
  for (const state of ["UNKNOWN_CONDITIONAL", "UNKNOWN_INFO"]) {
    const result = evaluateTroubleshooterResponse({ status: 200, body: {
      ...policy, overallAccessState: state,
      allowPolicyExplanation: { allowAccessState: "ALLOW_ACCESS_STATE_GRANTED" },
      denyPolicyExplanation: { denyAccessState: "DENY_ACCESS_STATE_UNKNOWN_INFO" },
    } }, check);
    assert.equal(result.result, "INCONCLUSIVE");
    assert.equal(summarizePermissionResults([result]).authorized, false);
  }
  const denied = evaluateTroubleshooterResponse({ status: 200, body: {
    overallAccessState: "CANNOT_ACCESS",
  } }, check);
  assert.equal(denied.result, "MISSING");
  assert.equal(summarizePermissionResults([denied]).authorized, false);
});

test("missing and malformed Policy Troubleshooter states have distinct fail-closed diagnostics", () => {
  const check = { category: "build-account", principal: pr253CrossAcademyRelease.functionBuild,
    permission: "logging.logEntries.create", resource: "staging-resource" };
  const missing = evaluateTroubleshooterResponse({ status: 200, body: {
    allowPolicyExplanation: { allowAccessState: "CAN_ACCESS" },
    denyPolicyExplanation: { denyAccessState: "DENY_ACCESS_STATE_UNSPECIFIED" },
  } }, check);
  const malformedState = evaluateTroubleshooterResponse({ status: 200, body: {
    overallAccessState: { unsafe: true }, allowPolicyExplanation: { allowAccessState: 1 },
  } }, check);
  const malformedResponse = evaluateTroubleshooterResponse({ status: 200, body: "not-an-object" }, check);
  assert.equal(missing.diagnosticEvidence.reason, "missing_overall_access_state");
  assert.equal(missing.diagnosticEvidence.allowAccessState, "CAN_ACCESS");
  assert.equal(malformedState.diagnosticEvidence.reason, "malformed_overall_access_state");
  assert.equal(malformedState.diagnosticEvidence.overallAccessState, "[MALFORMED_STATE]");
  assert.equal(malformedResponse.diagnosticEvidence.reason, "malformed_response");
  assert.ok([missing, malformedState, malformedResponse].every(value => value.result === "INCONCLUSIVE"));
  assert.equal(summarizePermissionResults([missing, malformedState, malformedResponse]).authorized, false);
});

test("a complete supported authorization response grants the quota-aware preflight", async () => {
  const checks = permissionChecks(pr253CrossAcademyRelease);
  const results = await verifyPermissionChecks(checks, {
    accessToken: "short-lived-token",
    fetchImpl: async (_url, init) => {
      if (init.method === "GET") return { status: 200, text: async () => "{}" };
      const request = JSON.parse(init.body);
      if (request.accessTuple) {
        return { status: 200, text: async () => JSON.stringify({ overallAccessState: "CAN_ACCESS" }) };
      }
      return { status: 200, text: async () => JSON.stringify({ permissions: request.permissions }) };
    },
  });
  assert.equal(checks.filter(value => value.method === "TROUBLESHOOT").length, 5);
  assert.equal(summarizePermissionResults(results).authorized, true);
  assert.ok(results.every(value => value.result === "GRANTED"));
});

test("malformed transport responses and invalid principal formats fail closed", async () => {
  assert.throws(() => policyTroubleshooterPrincipal("//iam.googleapis.com/projects/-/serviceAccounts/x@example.com"), /email address/);
  assert.equal(sanitizeErrorBody("access_token=secret").includes("secret"), false);
  const check = permissionChecks(pr253CrossAcademyRelease).find(value => value.method === "TROUBLESHOOT");
  const results = await verifyPermissionChecks([check], {
    accessToken: "short-lived-token",
    fetchImpl: async () => ({ status: 200, text: async () => "not-json" }),
  });
  assert.equal(results[0].result, "INCONCLUSIVE");
  assert.equal(results[0].diagnosticEvidence.reason, "malformed_response");
  assert.equal(summarizePermissionResults(results).authorized, false);
});

test("batched testIamPermissions identifies granted and genuinely missing permissions", () => {
  const check = { method: "TEST_IAM", category: "routine-deployer", principal: pr253CrossAcademyRelease.functionDeployer,
    permissions: ["cloudfunctions.functions.update", "cloudfunctions.functions.sourceCodeSet"], resource: "real-function" };
  const results = evaluateTestIamPermissionsResponse({ status: 200,
    body: { permissions: ["cloudfunctions.functions.update"] } }, check);
  assert.deepEqual(results.map(value => value.result), ["GRANTED", "MISSING"]);
  assert.equal(summarizePermissionResults(results).authorized, false);
});

test("malformed testIamPermissions responses are inconclusive rather than missing", () => {
  const check = { method: "TEST_IAM", category: "routine-deployer", principal: pr253CrossAcademyRelease.functionDeployer,
    permissions: ["cloudfunctions.functions.update"], resource: "real-function" };
  const [result] = evaluateTestIamPermissionsResponse({ status: 200, body: { unexpected: true } }, check);
  assert.equal(result.result, "INCONCLUSIVE");
  assert.equal(summarizePermissionResults([result]).authorized, false);
});

test("quota errors, invalid resources, and missing resources remain distinct and fail closed", () => {
  const check = { category: "build-account", principal: pr253CrossAcademyRelease.functionBuild,
    permission: "storage.objects.get", resource: "staging-resource" };
  const quota = evaluateTroubleshooterResponse({ status: 429,
    body: { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } } }, check);
  const invalid = evaluateTroubleshooterResponse({ status: 400,
    body: { error: { status: "INVALID_ARGUMENT", message: "invalid resource" } } }, check);
  const absent = evaluateTroubleshooterResponse({ status: 404,
    body: { error: { status: "NOT_FOUND", message: "not deployed" } } }, check);
  assert.equal(quota.result, "API_ERROR");
  assert.equal(invalid.result, "API_ERROR");
  assert.equal(absent.result, "RESOURCE_NOT_FOUND");
  const summary = summarizePermissionResults([quota, invalid, absent]);
  assert.equal(summary.totals.apiErrors, 2);
  assert.equal(summary.totals.resourceNotFound, 1);
  assert.equal(summary.authorized, false);
});

test("all five build-policy inspection denials remain explicit verification errors", async () => {
  const checks = permissionChecks(pr253CrossAcademyRelease).filter(value => value.method === "TROUBLESHOOT");
  const inspectionByResource = new Map([
    ["artifactregistry.googleapis.com", "artifactregistry.repositories.getIamPolicy"],
    ["cloudresourcemanager.googleapis.com", "resourcemanager.projects.getIamPolicy"],
    ["storage.googleapis.com", "storage.buckets.getIamPolicy"],
  ]);
  const results = await verifyPermissionChecks(checks, {
    accessToken: "short-lived-token",
    fetchImpl: async (_url, init) => {
      const { accessTuple } = JSON.parse(init.body);
      const [resourceApi, inspectionPermission] = [...inspectionByResource]
        .find(([api]) => accessTuple.fullResourceName.includes(api));
      assert.ok(resourceApi);
      return { status: 403, text: async () => JSON.stringify({ error: {
        code: 403, status: "PERMISSION_DENIED", message: "Policy inspection denied",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "IAM_PERMISSION_DENIED",
          domain: "iam.googleapis.com", metadata: { permission: inspectionPermission,
            resource: accessTuple.fullResourceName.replace(/^\/\//, "") } }],
      } }) };
    },
  });
  const summary = summarizePermissionResults(results);
  assert.equal(results.length, 5);
  assert.ok(results.every(value => value.result === "INSPECTION_DENIED"));
  assert.deepEqual(new Set(results.map(value => value.inspectionPermission)), new Set([
    "artifactregistry.repositories.getIamPolicy",
    "resourcemanager.projects.getIamPolicy",
    "storage.buckets.getIamPolicy",
  ]));
  assert.equal(summary.totals.inspectionDenied, 5);
  assert.equal(summary.totals.missing, 0);
  assert.equal(summary.totals.apiErrors, 0);
  assert.equal(summary.authorized, false);
});

test("the not-yet-deployed callable is excluded while bootstrap and operation permissions remain required", () => {
  const checks = permissionChecks(pr253CrossAcademyRelease);
  assert.ok(!checks.some(value => value.resource.includes("searchPracticeAttendanceAthletes")));
  const plan = permissionPlan(pr253CrossAcademyRelease);
  assert.ok(plan.deployer.includes("cloudfunctions.operations.get"));
  assert.ok(plan.deployer.includes("cloudfunctions.functions.get"));
  assert.ok(plan.deployer.includes("serviceusage.services.use"));
  assert.deepEqual(pr253CrossAcademyRelease.newFunctions, ["searchPracticeAttendanceAthletes"]);
  assert.equal(pr253CrossAcademyRelease.bootstrap.approvalRequired, true);
});

test("rollback evidence is complete and identifies separately approved deletion for a partial bootstrap", () => {
  const descriptions = Object.fromEntries(pr253CrossAcademyRelease.functions.map(name => [name, {
    updateTime: "2026-10-23T00:00:00Z",
    buildConfig: { serviceAccount: `projects/sandman-combat-staging/serviceAccounts/${pr253CrossAcademyRelease.functionBuild}`,
      source: { storageSource: { bucket: "gcf-v2-sources-991554514268-us-central1", object: `${name}.zip`, generation: "7" } } },
    serviceConfig: { serviceAccountEmail: pr253CrossAcademyRelease.functionRuntime },
  }]));
  descriptions.searchPracticeAttendanceAthletes = { absent: true };
  const evidence = rollbackEvidence(pr253CrossAcademyRelease, descriptions);
  assert.equal(evidence.applicationSha, pr253CrossAcademyRelease.applicationSha);
  assert.equal(evidence.functions.find(value => value.name === "searchPracticeAttendanceAthletes").rollback,
    "delete-new-function-with-separate-approval");
  assert.equal(evidence.functions.find(value => value.name === "finalizePracticeAttendance").source.generation, "7");
  delete descriptions.finalizePracticeAttendance.buildConfig.source;
  assert.throws(() => rollbackEvidence(pr253CrossAcademyRelease, descriptions), /immutable rollback source/);
});

test("post-deployment comparison rejects callable configuration or IAM drift", () => {
  const name = APPROVED_FUNCTIONS[0];
  const before = description(name);
  const policy = { bindings: [{ role: "roles/run.invoker", members: ["allUsers"] }] };
  assert.equal(verifyPreservedDeployment(release, name, before, structuredClone(before), policy, structuredClone(policy), policy, structuredClone(policy)), true);
  const changed = structuredClone(before);
  changed.serviceConfig.timeoutSeconds = 61;
  assert.throws(() => verifyPreservedDeployment(release, name, before, changed, policy, policy, policy, policy), /configuration mismatch|configuration changed/);
  assert.throws(() => verifyPreservedDeployment(release, name, before, before, policy, {}, policy, policy), /Functions IAM changed/);
});

test("Clipboard staging release carries forward the pinned promotions overlay without allowing arbitrary inheritance", async () => {
  const release = await loadRelease("clipboard-notes-pr372-e445688c");
  const context = {
    repository: release.repository,
    workflowRef: TRUSTED_WORKFLOW_REF,
    checkedOutSha: release.applicationSha,
    projectId: release.projectId,
    confirmProject: release.projectId,
    wifProvider: STAGING_WIF_PROVIDER,
    hostingDeployer: release.hostingDeployer,
    functionDeployer: release.functionDeployer,
    functionRuntime: release.functionRuntime,
    authorizationAvailable: true,
  };
  assert.doesNotThrow(() => validateRelease(release, context));
  assert.equal(release.hostingBaselineSha, "b48c9c061a03ddc2dc34e5f4a7ec21006364767a");
  assert.deepEqual(release.functions, ["savePracticeSessionMemory"]);
  assert.equal(release.hostingFiles.length, 8);
  assert.equal(release.inheritedHostingFiles.length, 5);
  assert.throws(() => validateRelease({ ...release, inheritedHostingFileGitShas: {} }, context), /Unapproved inherited Hosting source/);
  assert.throws(() => validateRelease({ ...release, inheritedHostingFiles: ["public/unreviewed.js"] }, context), /Unapproved inherited Hosting source/);
  assert.throws(() => validateRelease({ ...release, hostingBaselineSha: "a44b602caef08c7e719cc7425436507d3f9b3c51" }, context), /Unapproved inherited Hosting source/);
});

test("PR394 Billing validation checkpoint is immutable and cannot turn into a deployable release", async () => {
  const release = await loadRelease("billing-pr394-7befb7f2");
  const check = {
    repository: release.repository,
    workflowRef: "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
    checkedOutSha: release.applicationSha,
    projectId: "sandman-combat-staging",
    confirmProject: "sandman-combat-staging",
    wifProvider: "projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging",
    hostingDeployer: release.hostingDeployer,
    functionDeployer: release.functionDeployer,
    functionRuntime: release.functionRuntime,
    authorizationAvailable: true,
  };
  assert.doesNotThrow(() => validateRelease(release, check));
  assert.equal(release.validationOnly, true);
  assert.deepEqual(release.functions, []);
  assert.equal(release.hosting, false);
  assert.throws(() => validateRelease({ ...release, hosting: true }, check), /deployment-disabled/);
  assert.throws(() => validateRelease({ ...release, functions: ["createProposalCheckout"] }, check), /deployment-disabled/);
  assert.throws(() => validateRelease({ ...release, applicationSha: "a".repeat(40) }, check), /Application checkout does not match the approved SHA|deployment-disabled/);
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /billing-pr394-7befb7f2/);
  assert.match(workflow, /Validation-only release: deployment is prohibited/);
  assert.match(workflow, /tests\/functions\/historical-cash-stripe-execution\.test\.mjs/);
});

test("PR394 validation uses current Clipboard and four-group source gates, not retired HYBRID", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const conditions = workflow.split("\n").filter(line =>
    line.includes('if test "${RELEASE_ID}" =') &&
    line.includes('billing-pr394-7befb7f2') &&
    line.includes('clipboard-notes-pr372-e445688c"; then'));
  assert.equal(conditions.length, 2, "Both modern Coach invariant branches must include Billing PR394");
  assert.match(workflow, /grep -Fq '.*clipboard-2\.0/);
  assert.match(workflow, /grep -q 'MAX_TRAINING_GROUPS = 4'/);
});
