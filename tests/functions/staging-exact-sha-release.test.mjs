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
  validateRemotePreflight,
  verifyPreservedDeployment,
} from "../../scripts/staging/exact-sha-release-policy.mjs";

const release = await loadRelease("hybrid-pr99-5ed90c5c");
const practiceGroupsRelease = await loadRelease("practice-groups-pr113-27adc626");
const wrestlingWavesRelease = await loadRelease("r2c-wrestling-waves-pr115-18d46b08");
const hybridHandoffRelease = await loadRelease("hybrid-handoff-pr117-4a8402b9");
const stageFourRelease = await loadRelease("hybrid-stage4-pr120-8a122108");
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

test("invalid and unapproved source revisions are rejected", async () => {
  assert.throws(() => validateRelease(release, context({ checkedOutSha: "a".repeat(40) })), /approved SHA/);
  await assert.rejects(loadRelease("unreviewed-release"), /not approved/);
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
  assert.match(workflow, /road2champion-wrestling-tier-waves\.test\.mjs/);
  assert.match(workflow, /road2champion-wrestling-tier-wave-crosswalk\.js/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /--only hosting/);
  assert.match(workflow, /savePracticeSessionMemory/);
  assert.match(workflow, /closePracticeSession/);
  assert.doesNotMatch(workflow, /firestore:rules|storage:rules|--only functions(?!:)/);
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
  assert.match(validateJob, /^    if: \$\{\{ inputs\.action != 'diagnose' \}\}/m);
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
  assert.match(diagnoseJob, /sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
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
  assert.doesNotMatch(fnJob, /gcloud functions deploy|--trigger-http|--run-service-account/);
  const build = await readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
  const entry = await readFile(new URL("../../scripts/staging/staging-release-entry.cjs", import.meta.url), "utf8");
  assert.match(build, /firebase\.functions\.json/);
  assert.match(entry, /preserveExternalChanges: true/);
  assert.match(entry, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(workflow, /callableTrigger/);
  assert.match(workflow, /get-iam-policy/);
  assert.doesNotMatch(workflow, /gcloud functions deploy|--trigger-http|--run-service-account/);
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

test("generated endpoints pin the existing Compute runtime and preflight both ActAs requirements", async () => {
  const entry = await readFile(new URL("../../scripts/staging/staging-release-entry.cjs", import.meta.url), "utf8");
  const build = await readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(entry, /serviceAccount: "__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__"/);
  assert.match(build, /replace\("__SANDMAN_STAGING_RUNTIME_SERVICE_ACCOUNT__", release\.functionRuntime\)/);
  assert.match(workflow, /:testIamPermissions/);
  assert.match(workflow, /iam\.serviceAccounts\.actAs/);
  assert.match(workflow, /sandman-combat-staging@appspot\.gserviceaccount\.com/);
  assert.match(workflow, /r\.functionRuntime/);
  assert.match(workflow, /The staging deployer lacks iam\.serviceAccounts\.actAs on \$\{service_account\}/);
  assert.match(workflow, /Verified iam\.serviceAccounts\.actAs on \$\{service_account\}/);
  assert.doesNotMatch(workflow, /add-iam-policy-binding|set-iam-policy|roles\/iam\.serviceAccountUser/);
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
