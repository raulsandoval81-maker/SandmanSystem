import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deploymentPlan, executePlan, invocationIamCondition, invocationIamMember,
  invocationIamRole, invocationIamServices, invocationPlan, invocationState, isVerifiedNotFound,
  manifest, runtimeFor, validateExistingFunction, validateInvocationIamPolicy, validateManifest } from
  "../../scripts/staging/pr451-intake-activation-release.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fromRoot = relative => path.join(repositoryRoot, relative);
const workflow = await readFile(fromRoot(".github/workflows/release-pr451-intake-activation-staging.yml"), "utf8");
const hydrate = await readFile(fromRoot("functions/src/enrollment/hydrateEnrollmentIntakePrefill.ts"), "utf8");
const indexes = JSON.parse(await readFile(fromRoot("firestore.indexes.json"), "utf8"));
const rules = await readFile(fromRoot("firestore.rules"), "utf8");

test("release is exact, staging-only, and excludes existing billing deployment", () => {
  assert.equal(validateManifest(), true);
  assert.equal(manifest.applicationSha, "b3f93005d4bcd9547cb6415627e8133f0318ad74");
  assert.equal(manifest.projectId, "sandman-combat-staging");
  assert.equal(manifest.functions.length, 16);
  assert.equal(manifest.deployBillingFunctions, false);
  assert.deepEqual(manifest.requiredExistingFunctions, [
    "recordProposalPrepaidCash", "createProposalCheckout",
    "getProposalEnrollment", "saveProposalEnrollmentAgreement",
  ]);
  const targets = manifest.functions.map(entry => entry.name);
  for (const existing of manifest.requiredExistingFunctions) assert.ok(!targets.includes(existing));
});

test("plans preserve generations, runtime identities, secrets, and Firestore trigger paths", () => {
  for (const entry of manifest.functions) {
    const plan = deploymentPlan(entry, "/tmp/exact-source");
    const args = plan.args.join(" ");
    assert.match(args, /--project=sandman-combat-staging/);
    assert.match(args, /--runtime=nodejs22/);
    assert.doesNotMatch(args, /sandmandashboard/);
    assert.equal(args.includes("--no-gen2"), entry.kind === "gen1-callable");
    assert.equal(args.includes("--gen2"), entry.kind !== "gen1-callable");
    assert.equal(args.includes("--allow-unauthenticated"), entry.kind === "gen1-callable");
    if (entry.secrets?.length) assert.match(args, /--set-secrets=RESEND_API_KEY=RESEND_API_KEY:latest/);
    else assert.match(args, /--clear-secrets/);
    if (entry.kind === "gen2-firestore") {
      assert.match(args, new RegExp(`type=${entry.eventType.replaceAll(".", "\\.")}`));
      assert.ok(args.includes(`document=${entry.document}`));
      assert.match(args, /--trigger-location=nam5/);
    }
  }
  assert.equal(runtimeFor(manifest.functions.find(entry => entry.name === "approveAndActivate")),
    "991554514268-compute@developer.gserviceaccount.com");
  assert.equal(runtimeFor(manifest.functions.find(entry => entry.name === "sendEnrollmentIntakeEmail")),
    "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com");
});

test("workflow requires protected approval and isolated exact-SHA source", () => {
  assert.match(workflow, /environment: staging/g);
  assert.match(workflow, /ref: b3f93005d4bcd9547cb6415627e8133f0318ad74/);
  assert.match(workflow, /APPROVE_16_STAGING_INTAKE_ACTIVATION_FUNCTIONS/);
  assert.match(workflow, /RESEND_STAGING_SECRET_ACCESS_VERIFIED/);
  assert.equal((workflow.match(/actions\/setup-node@v4/g) || []).length, 2);
  assert.equal((workflow.match(/node-version: 22/g) || []).length, 2);
  assert.match(workflow, /--exclude='\.env\.\*'/);
  assert.match(workflow, /--exclude='\*\*\/\.env\.\*'/);
  assert.match(workflow, /find release-functions -type f/);
  assert.match(workflow, /ResponseError: status=\\\[404\\\]/);
  assert.match(workflow, /verify-pr451-intake-activation-invocation\.mjs/);
  assert.doesNotMatch(workflow, /firebase deploy/);
  assert.doesNotMatch(workflow, /sandmandashboard/);
});

test("only a verified cloud 404 is treated as an absent function", () => {
  assert.equal(isVerifiedNotFound({ status: 1, stdout: "", stderr:
    "ERROR: ResponseError: status=[404], code=[Ok], message=[Function does not exist]" }), true);
  for (const result of [
    { status: 1, stdout: "", stderr: "PERMISSION_DENIED" },
    { status: 1, stdout: "", stderr: "UNAUTHENTICATED" },
    { status: 1, stdout: "", stderr: "ResponseError: status=[503], message=[unavailable]" },
    { status: 1, stdout: "partial", stderr: "ResponseError: status=[404], message=[does not exist]" },
    { status: 0, stdout: "{}", stderr: "" },
  ]) assert.equal(isVerifiedNotFound(result), false);
});

function exactDescription(entry) {
  const secrets = (entry.secrets || []).map(key => ({ key }));
  const value = {
    name: `projects/${manifest.projectId}/locations/${manifest.region}/functions/${entry.name}`,
    state: "ACTIVE", environment: "GEN_2",
    labels: { "sandman-release": manifest.releaseId, "sandman-source-sha": manifest.applicationSha },
    buildConfig: { runtime: "nodejs22", entryPoint: entry.name,
      serviceAccount: `projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}` },
    serviceConfig: {
      serviceAccountEmail: runtimeFor(entry), availableMemory: "256Mi", timeoutSeconds: 60,
      maxInstanceCount: 20, availableCpu: "1", maxInstanceRequestConcurrency: 80,
      ingressSettings: "ALLOW_ALL", secretEnvironmentVariables: secrets,
      environmentVariables: {
        SANDMAN_STAGING_ACK: manifest.projectId,
        SANDMAN_STAGING_PROJECT_ID: manifest.projectId,
        SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:
          "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
      },
    },
  };
  if (entry.kind === "gen1-callable") {
    delete value.state; delete value.environment; delete value.buildConfig; delete value.serviceConfig;
    Object.assign(value, { status: "ACTIVE", runtime: "nodejs22", entryPoint: entry.name,
      buildServiceAccount: `projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}`,
      serviceAccountEmail: runtimeFor(entry), availableMemoryMb: 256, timeout: "60s", maxInstances: 20,
      ingressSettings: "ALLOW_ALL", secretEnvironmentVariables: secrets,
      environmentVariables: {
        SANDMAN_STAGING_ACK: manifest.projectId, SANDMAN_STAGING_PROJECT_ID: manifest.projectId,
        SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:
          "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
      } });
  }
  return value;
}

test("matching partial function is validated before invocation configuration resumes", () => {
  const entry = manifest.functions.find(item => item.name === "createProposalDraft");
  assert.equal(validateExistingFunction(entry, exactDescription(entry)), true);
  const partial = { runService: { metadata: { annotations: {} } }, functionIam: {}, runIam: {} };
  assert.equal(invocationState(entry, partial), "needs-configuration");
  assert.deepEqual(invocationPlan(entry).args.slice(0, 4),
    ["run", "services", "update", "createproposaldraft"]);
  assert.equal(invocationState(entry, { ...partial, runService: { metadata: { annotations:
    { "run.googleapis.com/invoker-iam-disabled": "true" } } } }), "complete");
});

test("resume fails closed on source, runtime, identity, or invocation drift", () => {
  const entry = manifest.functions.find(item => item.name === "createProposalDraft");
  for (const mutate of [
    value => { value.labels["sandman-source-sha"] = "0".repeat(40); },
    value => { value.buildConfig.runtime = "nodejs20"; },
    value => { value.serviceConfig.serviceAccountEmail = "unexpected@example.iam.gserviceaccount.com"; },
    value => { value.serviceConfig.maxInstanceCount = 99; },
  ]) {
    const value = exactDescription(entry); mutate(value);
    assert.throws(() => validateExistingFunction(entry, value), /configuration mismatch/);
  }
  assert.throws(() => invocationState(entry, { runService: { metadata: { annotations: {} } },
    functionIam: {}, runIam: { bindings: [{ role: "roles/run.invoker", members: ["allUsers"] }] } }),
  /Unexpected Gen 2 invocation IAM/);
});

test("missing invocation permission stops before the release can continue", () => {
  let calls = 0;
  const denied = () => { calls += 1; return { status: 1, stdout: "", stderr:
    "PERMISSION_DENIED: run.services.setIamPolicy" }; };
  assert.throws(() => executePlan(invocationPlan(
    manifest.functions.find(item => item.name === "createProposalDraft")), denied),
  /run\.services\.setIamPolicy/);
  assert.equal(calls, 1);
});

function invocationPolicy(expression, overrides = {}) {
  return { bindings: [{
    role: invocationIamRole,
    members: [invocationIamMember],
    condition: expression === undefined ? undefined : { expression },
    ...overrides,
  }] };
}

test("invocation IAM accepts only the complete seven-service near-term condition", () => {
  const now = Date.parse("2026-11-03T12:00:00.000Z");
  const expiration = "2026-11-03T13:00:00.000Z";
  const result = validateInvocationIamPolicy(invocationPolicy(invocationIamCondition(expiration)), { now });
  assert.equal(result.expiration, expiration);
  assert.equal(result.services.length, 7);
  assert.deepEqual(result.services, invocationIamServices());
});

test("invocation IAM rejects unrestricted alternatives and extra services", () => {
  const now = Date.parse("2026-11-03T12:00:00.000Z");
  const expression = invocationIamCondition("2026-11-03T13:00:00.000Z");
  assert.throws(() => validateInvocationIamPolicy(invocationPolicy(`${expression} || true`), { now }),
    /exact release boundary/);
  const extra = expression.replace("] && request.time",
    ', "projects/sandman-combat-staging/locations/us-central1/services/unexpected"] && request.time');
  assert.throws(() => validateInvocationIamPolicy(invocationPolicy(extra), { now }),
    /exact release boundary/);
});

test("invocation IAM rejects expired, unconditional, and duplicate deployer grants", () => {
  const now = Date.parse("2026-11-03T12:00:00.000Z");
  const valid = invocationPolicy(invocationIamCondition("2026-11-03T13:00:00.000Z"));
  assert.throws(() => validateInvocationIamPolicy(
    invocationPolicy(invocationIamCondition("2026-11-03T11:59:59.000Z")), { now }),
  /near-term expiration/);
  assert.throws(() => validateInvocationIamPolicy(invocationPolicy(undefined), { now }),
    /must be conditional/);
  assert.throws(() => validateInvocationIamPolicy(
    { bindings: [valid.bindings[0], structuredClone(valid.bindings[0])] }, { now }),
  /exactly one deployer grant/);
  assert.throws(() => validateInvocationIamPolicy(invocationPolicy(
    invocationIamCondition("2026-11-03T13:00:00.000Z"),
    { members: [invocationIamMember, "serviceAccount:broader@example.iam.gserviceaccount.com"] }), { now }),
  /must not include additional members/);
});

test("intake prefill uses shared fail-closed paid eligibility", () => {
  assert.match(hydrate, /isOperationalPaidProposal.*\.\/operationalPaidProposal/);
  assert.doesNotMatch(hydrate, /function isOperationalPaidProposal/);
});

test("existing Firestore rules and index prerequisites are present but outside deployment scope", () => {
  assert.match(rules, /match \/intakeTokens\/\{id\}/);
  assert.match(rules, /match \/intakes\/\{id\}/);
  assert.ok(indexes.indexes.some(index => index.collectionGroup === "intakes"));
  assert.equal(manifest.deployFirestoreRules, false);
  assert.equal(manifest.deployFirestoreIndexes, false);
});
