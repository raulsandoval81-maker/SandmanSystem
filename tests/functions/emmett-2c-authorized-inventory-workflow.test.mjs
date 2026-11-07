import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const primary = readFileSync(".github/workflows/staging-exact-sha-release.yml", "utf8");
const standalone = readFileSync(".github/workflows/2c-staging-readonly-inventory.yml", "utf8");
const marker = "  emmett-2c-readonly-inventory:\n";
const job = primary.slice(primary.indexOf(marker));

test("2C inventory is explicitly dispatched only through the authorized staging workflow", () => {
  assert.ok(primary.includes("          - emmett-2c-readonly-inventory\n"));
  assert.ok(primary.includes(marker));
  assert.match(job, /inputs\.action == 'emmett-2c-readonly-inventory'/);
  assert.match(job, /GITHUB_WORKFLOW_REF.*staging-exact-sha-release\.yml@refs\/heads\/main/);
  assert.match(job, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(job, /CONFIRM_PROJECT.*sandman-combat-staging/);
  assert.match(job, /environment: staging/);
  assert.match(job, /deploymentAuthorized!==false/);
  assert.match(job, /productionAuthorized!==false/);
  assert.match(job, /syntheticDataOnly!==true/);
});
test("2C inventory uses the existing trusted Functions staging service account", () => {
  assert.match(job, /sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(job, /projects\/991554514268\/locations\/global\/workloadIdentityPools\/sandman-github-staging\/providers\/sandman-hybrid-staging/);
  assert.match(job, /google-github-actions\/auth@v3/);
});
test("staging inventory contains only read-only cloud commands", () => {
  const commands = [...job.matchAll(/\bgcloud (functions|run) ([^\n]+)/g)].map(m => m[0].trim());
  assert.ok(commands.length >= 4, "Expected Function/Cloud Run describe and IAM inspections");
  for (const line of commands) {
    assert.match(line, /^gcloud (?:functions (?:list|describe|get-iam-policy)|run services (?:describe|get-iam-policy)) /);
    assert.doesNotMatch(line, /\b(?:deploy|update|create|delete|set-iam-policy|add-iam-policy-binding)\b/);
  }
  assert.match(job, /if-no-files-found: warn/);
  assert.match(job, /if: \$\{\{ always\(\) \}\}/);
});
test("legacy rejected workflow has no manual OIDC surface", () => {
  assert.doesNotMatch(standalone, /workflow_dispatch/);
  assert.doesNotMatch(standalone, /id-token: write/);
  assert.doesNotMatch(standalone, /google-github-actions\/auth@/);
  assert.doesNotMatch(standalone, /\bgcloud /);
});

test("2C inventory distinguishes Gen1 callable from Gen2 Run services", () => {
  assert.match(job, /generation.*GEN_1/);
  assert.match(job, /INVENTORIED_GEN1: Cloud Run service is not applicable/);
  assert.match(job, /generation.*GEN_2/);
  assert.match(job, /INVENTORIED_GEN2_READ_ONLY/);
});
test("new receipt requires verified absence and separate bootstrap before any release", () => {
  assert.match(job, /gcloud functions list --regions=us-central1/);
  assert.match(job, /fn.*sendProposalPrepaidCashReceipt/);
  assert.match(job, /NOT_DEPLOYED: new Gen2 receipt callable requires separately approved bootstrap/);
  assert.match(job, /releaseReady: false/);
  assert.match(job, /test.*failures.*-eq 0/);
});
