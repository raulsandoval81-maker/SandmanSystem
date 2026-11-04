import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deployer, invocationCondition, invocationRole, manifest, verifyPrerequisites } from
  "../../scripts/staging/proposal-correction-release.mjs";

const workflow = readFileSync(new URL(
  "../../.github/workflows/paid-in-full-v2-readonly-preflight.yml", import.meta.url), "utf8");
const memberPolicy = { bindings: [{ role: "roles/iam.serviceAccountUser", members: [deployer] }] };

function evidence() {
  const expiration = "2026-11-04T14:00:00.000Z";
  return {
    functionLookup: { status: 1, stdout: "", stderr:
      "ERROR: ResponseError: status=[404], message=[Function was not found]" },
    practiceRole: { includedPermissions: ["cloudfunctions.functions.create",
      "cloudfunctions.functions.get", "cloudfunctions.functions.sourceCodeSet",
      "cloudfunctions.functions.update", "cloudfunctions.locations.list",
      "cloudfunctions.operations.get", "datastore.databases.getMetadata",
      "firebase.projects.get", "resourcemanager.projects.get"] },
    invocationRole: { includedPermissions: ["run.services.setIamPolicy"] },
    projectIam: { bindings: [{ role: invocationRole, members: [deployer],
      condition: { expression: invocationCondition(expiration) } }] },
    runtimeIam: structuredClone(memberPolicy), buildIam: structuredClone(memberPolicy),
    secretIam: { bindings: [{ role: "roles/secretmanager.secretAccessor",
      members: [`serviceAccount:${manifest.runtimeServiceAccount}`] }] },
    siblingFunction: { state: "ACTIVE", environment: "GEN_2",
      buildConfig: { runtime: "nodejs22", serviceAccount:
        `projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}` },
      serviceConfig: { serviceAccountEmail: manifest.runtimeServiceAccount,
        ingressSettings: "ALLOW_ALL" } },
    siblingRun: { metadata: { annotations: { "run.googleapis.com/invoker-iam-disabled": "true" } } },
  };
}

test("proposal correction uses an existing authorized workflow with exact staging scope", () => {
  assert.match(workflow, /release_scope:/);
  assert.match(workflow, /options: \[pif-v2, proposal-correction\]/);
  assert.match(workflow, /APPROVE_STAGING_PROPOSAL_CORRECTION_ONE_FUNCTION_ONE_ASSET/);
  assert.match(workflow, /ref: 786dba9824663feea4aa092a1bbe54b151c8233a/);
  assert.equal((workflow.match(/gcloud functions deploy returnProposalToDraft/g) || []).length, 1);
  assert.match(workflow, /proposal-correction-controlled-hosting\.py --mode deploy/);
  assert.doesNotMatch(workflow, /proposal-correction[\s\S]*sandmandashboard/);
});

test("proposal correction deployment retains exact runtime, secret, artifact, and IAM checks", () => {
  assert.match(workflow, /--run-service-account=sandman-billing-runtime@sandman-combat-staging/);
  assert.match(workflow, /--set-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest/);
  assert.match(workflow, /--exclude='\.env\.\*'/);
  assert.match(workflow, /run\.googleapis\.com\/invoker-iam-disabled/);
  assert.match(workflow, /function-iam-after\.json/);
  assert.match(workflow, /run-iam-after\.json/);
  assert.match(workflow, /PROPOSAL_CORRECTION_FUNCTION_VERIFIED: yes/);
});

test("preflight accepts only a verified missing Function and exact near-term invocation grant", () => {
  assert.equal(verifyPrerequisites(evidence(), { now: Date.parse("2026-11-04T12:00:00.000Z") }).targetService,
    "projects/sandman-combat-staging/locations/us-central1/services/returnproposaltodraft");
  const existing = evidence(); existing.functionLookup = { status: 0, stdout: "{}", stderr: "" };
  assert.throws(() => verifyPrerequisites(existing), /verified NOT_FOUND/);
  const broad = evidence(); broad.projectIam.bindings[0].condition.expression += " || true";
  assert.throws(() => verifyPrerequisites(broad, { now: Date.parse("2026-11-04T12:00:00.000Z") }),
    /exact near-term one-service/);
  const noCreate = evidence(); noCreate.practiceRole.includedPermissions.shift();
  assert.throws(() => verifyPrerequisites(noCreate), /cloudfunctions\.functions\.create/);
});
