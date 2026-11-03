import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("Usage: verify-pr451-intake-activation-invocation.mjs <functions-evidence-dir>");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(path.join(repositoryRoot,
  "scripts/staging/pr451-intake-activation-release.json"), "utf8"));
const read = async name => JSON.parse(await readFile(path.join(root, name), "utf8"));
const normalizedBindings = policy => (policy.bindings || []).map(binding => ({
  role: binding.role, members: [...(binding.members || [])].sort(), condition: binding.condition || null,
})).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

for (const entry of manifest.functions.filter(item => item.kind.endsWith("callable"))) {
  const functionIam = normalizedBindings(await read(`${entry.name}-function-iam.json`));
  if (entry.kind === "gen1-callable") {
    assert.deepEqual(functionIam, [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"], condition: null }]);
    continue;
  }
  const service = await read(`${entry.name}-run-service.json`);
  const runIam = normalizedBindings(await read(`${entry.name}-run-iam.json`));
  assert.equal(service.metadata?.annotations?.["run.googleapis.com/invoker-iam-disabled"], "true");
  assert.deepEqual(functionIam, []);
  assert.deepEqual(runIam, []);
}
console.log("PASS: callable transport is public only through application-level authorization boundaries");
