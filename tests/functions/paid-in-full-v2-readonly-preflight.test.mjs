import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
test("PIF V2 staging preflight is read-only, pinned and restricted", () => {
  const manifest = JSON.parse(read("scripts/staging/paid-in-full-v2-preflight.json"));
  const workflow = read(".github/workflows/paid-in-full-v2-readonly-preflight.yml");
  assert.equal(manifest.deploymentAuthorized,false);
  assert.equal(manifest.productionChangesAuthorized,false);
  assert.equal(manifest.firestoreWritesAuthorized,false);
  assert.equal(manifest.stripeOperationsAuthorized,false);
  assert.equal(manifest.secretReadsAuthorized,false);
  assert.equal(manifest.applicationSha,"7df9dce66939cae693d4f112647da7bdd17e923c");
  assert.deepEqual(manifest.hostingFiles,[
    "/assets/js/pricing/sandman-pricing-catalog.js",
    "/assets/js/pricing/sandman-pricing-engine.js",
    "/management/billing/billing.js",
    "/management/billing/prepaid-terms.js"
  ]);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: staging/);
  assert.match(workflow,/paid-in-full-v2-preflight-check\.mjs source/);
  const [validationJob, deployJob] = workflow.split("\\n  deploy:\\n");
  assert.ok(validationJob && deployJob, "Both validation and deployment jobs must exist");
  assert.match(validationJob,/  validate:\\n/);
  assert.doesNotMatch(validationJob,/gcloud functions deploy|firebase-tools.*deploy|gcloud run services update|--mode deploy/);
  assert.match(deployJob,/if: \\$\\{\\{ inputs\\.action == 'deploy' \\}\\}/);
  assert.match(deployJob,/needs: validate/);
  assert.match(deployJob,/APPROVE_PIF_V2_STAGING_ONE_FUNCTION_FOUR_ASSETS/);
  assert.match(deployJob,/gcloud functions deploy recordProposalPrepaidCash --gen2/);
});
