import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapFunctions, deploymentPlan, executePlan, installationReport,
  invocationPlan, invocationState, isVerifiedNotFound, manifest, runtimeFor,
  validateExistingFunction, validateManifest } from
  "../../scripts/staging/pr451-intake-activation-release.mjs";
import { verifyReviewPrerequisites } from "../helpers/pr451-review-prerequisites.mjs";

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
    "submitProposalForReview", "issueProposalClientReview",
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
    assert.equal(args.includes("--allow-unauthenticated"), false);
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
  if (entry.kind === "gen2-firestore") {
    value.eventTrigger = { eventType: entry.eventType, triggerRegion: manifest.triggerRegion,
      eventFilters: [{ attribute: "database", value: "(default)" },
        { attribute: "namespace", value: "(default)" },
        { attribute: "document", value: entry.document, operator: "match-path-pattern" }] };
  }
  return value;
}

test("matching partial function is validated and classified as pending administrator work", () => {
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

test("failed cloud commands remain fail-closed", () => {
  let calls = 0;
  const denied = () => { calls += 1; return { status: 1, stdout: "", stderr:
    "PERMISSION_DENIED: run.services.setIamPolicy" }; };
  assert.throws(() => executePlan(invocationPlan(
    manifest.functions.find(item => item.name === "createProposalDraft")), denied),
  /run\.services\.setIamPolicy/);
  assert.equal(calls, 1);
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

function invocationEvidence(entry, complete = false) {
  if (entry.kind === "gen1-callable") return { functionIam: complete ? {
    bindings: [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"] }],
  } : {} };
  if (entry.kind === "gen2-callable") return { functionIam: {}, runIam: {},
    runService: { metadata: { annotations: complete ? {
      "run.googleapis.com/invoker-iam-disabled": "true",
    } : {} } } };
}

function installationRecords(complete = true) {
  return Object.fromEntries([...manifest.functions, ...manifest.requiredReviewCallables].map(entry => [entry.name, {
    description: exactDescription(entry), invocation: invocationEvidence(entry,
      manifest.requiredReviewCallables.some(item => item.name === entry.name) || complete),
  }]));
}

test("partial install resumes all 16 targets without invocation writes or redeploying existing Functions", () => {
  const created = [];
  const existing = new Set(["createProposalDraft", "updateProposalDraft"]);
  const report = bootstrapFunctions("/tmp/exact-source", {
    describe: entry => existing.has(entry.name)
      ? { status: 0, stdout: JSON.stringify(exactDescription(entry)) }
      : { status: 1, stdout: "", stderr: "ResponseError: status=[404], Function does not exist" },
    execute: plan => {
      assert.deepEqual(plan.args.slice(0, 2), ["functions", "deploy"]);
      assert.ok(!plan.args.some(arg => /invoker-iam|allow-unauthenticated|iam-policy/.test(arg)));
      created.push(plan.args[2]);
    },
    readDeployed: exactDescription,
    readInvocation: entry => invocationEvidence(entry, entry.name === "createProposalDraft"),
  });
  assert.deepEqual(created, manifest.functions.map(x => x.name).filter(name => !existing.has(name)));
  assert.equal(report.creationComplete, true);
  assert.equal(report.installationComplete, false);
  assert.deepEqual(report.pendingAdministratorConfiguration,
    manifest.functions.filter(x => x.kind.endsWith("callable") && x.name !== "createProposalDraft").map(x => x.name));
});

test("resume stops before deployment on existing source drift or unexpected invocation IAM", () => {
  for (const drift of ["source", "iam"]) {
    let executions = 0;
    assert.throws(() => bootstrapFunctions("/tmp/exact-source", {
      describe: entry => {
        const value = exactDescription(entry);
        if (drift === "source") value.labels["sandman-source-sha"] = "0".repeat(40);
        return { status: 0, stdout: JSON.stringify(value) };
      },
      execute: () => { executions++; },
      readInvocation: entry => ({ ...invocationEvidence(entry),
        runIam: { bindings: [{ role: "roles/run.invoker", members: ["allUsers"] }] } }),
    }), /configuration mismatch|Unexpected Gen 2 invocation IAM/);
    assert.equal(executions, 0);
  }
});

test("creation failure or unreadable absence stops before later targets", () => {
  for (const denied of [false, true]) {
    let calls = 0;
    assert.throws(() => bootstrapFunctions("/tmp/exact-source", {
      describe: () => ({ status: 1, stdout: "", stderr: denied ? "PERMISSION_DENIED" :
        "ResponseError: status=[404], Function does not exist" }),
      execute: () => { calls++; throw new Error("build failed"); },
    }), /Unable to verify|build failed/);
    assert.equal(calls, denied ? 0 : 1);
  }
});

test("final verification requires every Function, trigger, and callable access setting", () => {
  assert.equal(installationReport(installationRecords()).installationComplete, true);
  for (const entry of manifest.functions) {
    const records = installationRecords();
    delete records[entry.name];
    assert.throws(() => installationReport(records), /missing function/);
    if (entry.kind.endsWith("callable")) {
      const pending = installationRecords();
      pending[entry.name].invocation = invocationEvidence(entry, false);
      assert.throws(() => installationReport(pending), /configuration incomplete/);
      pending[entry.name].invocation = undefined;
      assert.throws(() => installationReport(pending), /evidence is unreadable/);
    } else {
      const drift = installationRecords();
      drift[entry.name].description.eventTrigger.eventType = "unexpected";
      assert.throws(() => installationReport(drift), /trigger configuration mismatch/);
    }
  }
  assert.equal(installationReport(installationRecords(), { creationOnly: true }).installationComplete, false);
});

test("creation preflight does not mistake an IAM expression for effective authorization", async () => {
  const preflight = await readFile(fromRoot("tests/helpers/verify-pr451-intake-activation-preflight.mjs"), "utf8");
  assert.doesNotMatch(preflight, /validateInvocationIamPolicy|sandmanBillingInvokerIamRelease/);
  assert.match(workflow, /options: \[validate, bootstrap, verify-installation\]/);
  assert.match(workflow, /inputs.action == 'verify-installation'/);
  assert.match(workflow, /--creation-only/);
  assert.match(workflow, /installation-verification\.json/);
});

test("workflow verifier CLI never certifies creation or incomplete evidence as installation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pr451-verification-"));
  const verifier = fromRoot("tests/helpers/verify-pr451-intake-activation-invocation.mjs");
  const writeRecords = async records => {
    for (const entry of [...manifest.functions, ...manifest.requiredReviewCallables]) {
      const record = records[entry.name];
      await writeFile(path.join(root, `${entry.name}.json`), JSON.stringify(record.description));
      if (entry.kind.endsWith("callable")) {
        await writeFile(path.join(root, `${entry.name}-function-iam.json`), JSON.stringify(record.invocation.functionIam));
      }
      if (entry.kind === "gen2-callable") {
        await writeFile(path.join(root, `${entry.name}-run-service.json`), JSON.stringify(record.invocation.runService));
        await writeFile(path.join(root, `${entry.name}-run-iam.json`), JSON.stringify(record.invocation.runIam));
      }
    }
  };
  const run = (...args) => spawnSync(process.execPath, [verifier, root, ...args], { encoding: "utf8" });
  try {
    await writeRecords(installationRecords(false));
    const creation = run("--creation-only");
    assert.equal(creation.status, 0, creation.stderr);
    assert.equal(JSON.parse(creation.stdout).installationComplete, false);
    const pending = run();
    assert.notEqual(pending.status, 0);
    assert.match(pending.stderr, /configuration incomplete/);
    await writeRecords(installationRecords());
    const complete = run();
    assert.equal(complete.status, 0, complete.stderr);
    assert.equal(JSON.parse(complete.stdout).installationComplete, true);
    for (const entry of manifest.requiredReviewCallables) {
      await rm(path.join(root, `${entry.name}.json`));
      for (const args of [[], ["--creation-only"]]) {
        const missingPrerequisite = run(...args);
        assert.notEqual(missingPrerequisite.status, 0);
        assert.equal(missingPrerequisite.stdout, "");
      }
      await writeRecords(installationRecords());
      await writeFile(path.join(root, `${entry.name}-run-service.json`),
        JSON.stringify({ metadata: { annotations: {} } }));
      for (const args of [[], ["--creation-only"]]) {
        const privatePrerequisite = run(...args);
        assert.notEqual(privatePrerequisite.status, 0);
        assert.match(privatePrerequisite.stderr, /invocation incomplete/);
      }
      await writeRecords(installationRecords());
    }
    await rm(path.join(root, "syncActivatedEnrollmentPlacement.json"));
    const missingTrigger = run();
    assert.notEqual(missingTrigger.status, 0);
    assert.equal(missingTrigger.stdout, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review prerequisites reject missing, unhealthy, wrong-project, or inaccessible callables", () => {
  assert.equal(verifyReviewPrerequisites(installationRecords()), true);
  for (const entry of manifest.requiredReviewCallables) {
    for (const mutate of [
      records => { delete records[entry.name]; },
      records => { records[entry.name].description.absent = true; },
      records => { records[entry.name].description.state = "FAILED"; },
      records => { records[entry.name].description.name = "projects/other/locations/us-central1/functions/wrong"; },
      records => { records[entry.name].description.buildConfig.runtime = "nodejs20"; },
      records => { records[entry.name].description.buildConfig.entryPoint = "wrong"; },
      records => { records[entry.name].invocation = invocationEvidence(entry, false); },
      records => { records[entry.name].invocation.runIam = { bindings: [
        { role: "roles/run.invoker", members: ["allUsers"] },
      ] }; },
    ]) {
      const records = installationRecords();
      mutate(records);
      assert.throws(() => verifyReviewPrerequisites(records));
    }
    assert.throws(() => deploymentPlan(entry, "/tmp/exact-source"), /outside the exact release allowlist/);
  }
});

test("workflow collects both review prerequisites for preflight and final verification", async () => {
  assert.match(workflow, /m\.requiredExistingFunctions\.join/);
  assert.equal((workflow.match(/\.\.\.m\.requiredReviewCallables/g) || []).length, 2);
  const preflight = await readFile(fromRoot("tests/helpers/verify-pr451-intake-activation-preflight.mjs"), "utf8");
  assert.match(preflight, /verifyReviewPrerequisites\(reviewRecords\)/);
});
