import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { permissionChecks, verifyPermissionChecks, summarizePermissionResults } from "../../scripts/staging/verify-release-permissions.mjs";

const manifest = JSON.parse(readFileSync(new URL("../../scripts/staging/approved-exact-sha-releases.json", import.meta.url), "utf8"));
const release = {
  releaseId: "billing-pr394-deploy-7befb7f2",
  ...manifest["billing-pr394-deploy-7befb7f2"],
};

test("PR394 enumerates all six future services without claiming their IAM is granted", () => {
  const checks = permissionChecks(release);
  const future = checks.filter(check => check.category === "billing-pr394-new-function");
  assert.deepEqual(future.map(check => check.resource.split("/").at(-1)), release.newFunctions.map(name => name.toLowerCase()));
  assert.ok(future.every(check => check.method === "MANUAL_GATE"));
  assert.ok(checks.some(check => check.category === "billing-pr394-runtime-and-secrets"));
  assert.ok(checks.some(check => check.category === "billing-pr394-storage-source"));
  assert.ok(checks.some(check => check.category === "billing-pr394-project-bootstrap" &&
    check.permissions.includes("cloudfunctions.functions.create")));
  assert.ok(checks.every(check => check.resource.includes("sandman-combat-staging")));
  assert.ok(!checks.some(check => check.resource.includes("recordproposalprepaidcash")));
});

test("PR394 bootstrap is always fail-closed without independent manual evidence", async () => {
  const manualChecks = permissionChecks(release).filter(check => check.method === "MANUAL_GATE");
  let requests = 0;
  const results = await verifyPermissionChecks(manualChecks, {
    accessToken: "synthetic-not-used",
    fetchImpl: () => { requests++; throw Error("Manual checks must not access network."); },
  });
  assert.equal(requests, 0);
  assert.equal(results.length, 8);
  assert.ok(results.every(result => result.result === "INCONCLUSIVE"));
  assert.equal(summarizePermissionResults(results).authorized, false);
});

test("PR394 bootstrap contract cannot become deployment-enabled by changing a flag", () => {
  assert.throws(() => permissionChecks({ ...release, validationOnly: false }), /validation-only/);
  assert.throws(() => permissionChecks({ ...release, newFunctions: ["stripeBillingWebhook"] }), /inventory/);
});
