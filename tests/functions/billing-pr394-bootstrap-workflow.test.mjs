import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertBootstrapBoundary, describeBootstrapPlan, NEW_FUNCTIONS, PROJECT_ID,
  RELEASE_ID, APPLICATION_SHA } from "../../scripts/staging/billing-pr394-bootstrap.mjs";

const manifest = JSON.parse(readFileSync(new URL("../../scripts/staging/approved-exact-sha-releases.json", import.meta.url), "utf8"));
const release = { releaseId: RELEASE_ID, ...manifest[RELEASE_ID] };
const workflow = readFileSync(new URL("../../.github/workflows/billing-pr394-staging-bootstrap.yml", import.meta.url), "utf8");
const script = readFileSync(new URL("../../scripts/staging/billing-pr394-bootstrap.mjs", import.meta.url), "utf8");

const approvals = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "raulsandoval81-maker/SandmanSystem",
  GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW_REF: "raulsandoval81-maker/SandmanSystem/.github/workflows/billing-pr394-staging-bootstrap.yml@refs/heads/main",
  SANDMAN_BOOTSTRAP_PROJECT: PROJECT_ID,
  SANDMAN_BOOTSTRAP_RELEASE: RELEASE_ID,
  SANDMAN_BOOTSTRAP_AUTHORIZATION: "APPROVE_SIX_NEW_STAGING_FUNCTIONS",
  SANDMAN_PUBLIC_HTTP_INVOCATION_APPROVED: "APPROVE_PUBLIC_HTTP_INVOCATION_WITH_APPLICATION_AUTH",
  SANDMAN_STRIPE_TEST_MODE_ATTESTED: "STRIPE_TEST_KEY_VERIFIED",
  SANDMAN_STRIPE_WEBHOOK_SECRET_ATTESTED: "STAGING_WEBHOOK_SECRET_MATCH_VERIFIED",
};

test("bootstrap scope is exactly six new immutable PR394 staging functions", () => {
  assert.equal(APPLICATION_SHA, "7befb7f2dba6debb0e32c9336cda99ad897712de");
  assert.equal(PROJECT_ID, "sandman-combat-staging");
  assert.deepEqual(NEW_FUNCTIONS, release.newFunctions);
  assert.equal(NEW_FUNCTIONS.length, 6);
  assert.ok(!NEW_FUNCTIONS.includes("recordProposalPriorPayment"));
  assert.equal(release.validationOnly, true);
  assert.equal(assertBootstrapBoundary(release, {}, "plan"), true);
  assert.throws(() => assertBootstrapBoundary({...release, validationOnly: false}, approvals, "execute"), /boundary mismatch/);
});

test("execution rejects missing or wrong approval, workflow, branch and Stripe sandbox attestation", () => {
  assert.equal(assertBootstrapBoundary(release, approvals, "execute"), true);
  for (const field of Object.keys(approvals)) {
    assert.throws(() => assertBootstrapBoundary(release, {...approvals, [field]: "WRONG"}, "execute"),
      new RegExp(field));
  }
  assert.throws(() => assertBootstrapBoundary(release, approvals, "deploy"), /Only plan or execute/);
});

test("bootstrap derives invocation setup and config from reviewed staging manifest", () => {
  const plan = describeBootstrapPlan(release, "/tmp/isolated-pr394-functions");
  assert.deepEqual(plan.map(item => item.functionName), NEW_FUNCTIONS);
  for (const item of plan) {
    assert.equal(item.project, PROJECT_ID);
    assert.equal(item.runtime, release.functionRuntime);
    assert.equal(item.publicInvocationConfigurationRequiresReview, true);
    assert.equal(item.deploymentTool, "gcloud");
    assert.ok(item.argumentNames.includes("--gen2"));
    assert.ok(item.argumentNames.includes("--project"));
  }
});

test("separate GitHub bootstrap is pinned to a previously validated artifact and protected environment", () => {
  assert.match(workflow, /run-id: 41169028301/);
  assert.match(workflow, /exact-sha-staging-release-7befb7f2dba6debb0e32c9336cda99ad897712de/);
  assert.match(workflow, /environment: staging/g);
  assert.match(workflow, /inputs.action == 'execute'/);
  assert.match(workflow, /APPROVE_SIX_NEW_STAGING_FUNCTIONS/);
  assert.match(workflow, /APPROVE_PUBLIC_HTTP_INVOCATION_WITH_APPLICATION_AUTH/);
  assert.match(workflow, /STRIPE_TEST_KEY_VERIFIED/);
  assert.match(workflow, /STAGING_WEBHOOK_SECRET_MATCH_VERIFIED/);
  assert.match(workflow, /sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.doesNotMatch(workflow, /secrets versions access|set-iam-policy|add-iam-policy-binding|firebase deploy/);
});

test("bootstrap is create-only, stops on existing function and has no automatic deletion", () => {
  assert.match(script, /if \(inspectFunction\(name\)\) throw Error/);
  assert.match(script, /inspectFunction\("recordProposalPriorPayment"\)/);
  assert.match(script, /verifyInvokerPolicy\(release, name/);
  assert.match(script, /validateFunctionConfiguration\(release, name, deployed\)/);
  assert.match(script, /no automatic rollback/);
  assert.doesNotMatch(script, /functions", "delete"|add-iam-policy-binding|set-iam-policy/);
});
