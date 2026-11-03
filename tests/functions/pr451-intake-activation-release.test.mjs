import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deploymentPlan, manifest, runtimeFor, validateManifest } from
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
  assert.match(workflow, /rsync -a --exclude=\.env/);
  assert.match(workflow, /test ! -e release-functions\/\.env/);
  assert.match(workflow, /verify-pr451-intake-activation-invocation\.mjs/);
  assert.doesNotMatch(workflow, /firebase deploy/);
  assert.doesNotMatch(workflow, /sandmandashboard/);
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
