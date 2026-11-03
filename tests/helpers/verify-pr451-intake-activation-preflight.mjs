import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateExistingFunction } from "../../scripts/staging/pr451-intake-activation-release.mjs";

const root = process.argv[2];
if (!root) throw new Error("Usage: verify-pr451-intake-activation-preflight.mjs <evidence-dir>");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(await readFile(path.join(repositoryRoot,
  "scripts/staging/pr451-intake-activation-release.json"), "utf8"));
const read = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const functionsRoot = path.join(root, "functions");

const database = await read("firestore-database.json");
assert.equal(database.name, "projects/sandman-combat-staging/databases/(default)");
assert.equal(database.locationId, "nam5");

const secret = await read("resend-secret.json");
assert.equal(secret.name, "projects/991554514268/secrets/RESEND_API_KEY");
const secretVersions = await read("resend-secret-versions.json");
assert.ok(secretVersions.some(version => String(version.state).toUpperCase() === "ENABLED"),
  "RESEND_API_KEY has no enabled staging version");
const secretIam = await read("resend-secret-iam.json");
const secretAccessors = (secretIam.bindings || [])
  .filter(binding => binding.role === "roles/secretmanager.secretAccessor")
  .flatMap(binding => binding.members || []);
assert.deepEqual(secretAccessors, [
  "serviceAccount:sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com",
]);

const projectIam = await read("project-iam.json");
const deployer = "serviceAccount:sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com";
const deployerRoles = (projectIam.bindings || [])
  .filter(binding => (binding.members || []).includes(deployer))
  .map(binding => binding.role);
for (const role of [
  "projects/sandman-combat-staging/roles/sandmanPracticeDeployer",
  "projects/sandman-combat-staging/roles/sandmanXpBootstrapIam",
  "projects/sandman-combat-staging/roles/sandmanBillingInvokerIamRelease",
]) assert.ok(deployerRoles.includes(role), `missing deployer role ${role}`);

const invocationRole = "projects/sandman-combat-staging/roles/sandmanBillingInvokerIamRelease";
const invocationBinding = (projectIam.bindings || []).find(binding =>
  binding.role === invocationRole && (binding.members || []).includes(deployer));
assert.ok(invocationBinding?.condition?.expression, "missing conditional invocation-IAM release binding");
const invocationExpression = invocationBinding.condition.expression;
assert.match(invocationExpression, /resource\.type\s*==\s*["']run\.googleapis\.com\/Service["']/);
const allowedServices = manifest.functions.filter(entry => entry.kind === "gen2-callable")
  .map(entry => `projects/sandman-combat-staging/locations/us-central1/services/${entry.name.toLowerCase()}`)
  .sort();
const conditionServices = [...invocationExpression.matchAll(
  /projects\/sandman-combat-staging\/locations\/us-central1\/services\/[a-z0-9-]+/g)]
  .map(match => match[0]).sort();
assert.deepEqual(conditionServices, allowedServices, "invocation IAM is not restricted to the seven callable services");
const expiry = invocationExpression.match(/request\.time\s*<\s*timestamp\(["']([^"']+)["']\)/)?.[1];
assert.ok(expiry && Date.parse(expiry) > Date.now(), "invocation IAM approval is absent or expired");

const services = await read("enabled-services.json");
const enabled = new Set(services.map(item => item.config?.name));
for (const service of ["artifactregistry.googleapis.com", "cloudbuild.googleapis.com",
  "cloudfunctions.googleapis.com", "eventarc.googleapis.com", "firestore.googleapis.com",
  "pubsub.googleapis.com", "run.googleapis.com", "secretmanager.googleapis.com"]) {
  assert.ok(enabled.has(service), `required API is disabled: ${service}`);
}

for (const account of [manifest.defaultRuntimeServiceAccount, manifest.gen1RuntimeServiceAccount,
  manifest.emailRuntimeServiceAccount, manifest.buildServiceAccount]) {
  const safe = account.replaceAll("@", "_").replaceAll(".", "_");
  const policy = await read(`${safe}-iam.json`);
  assert.ok((policy.bindings || []).some(binding => binding.role === "roles/iam.serviceAccountUser" &&
    (binding.members || []).includes(deployer)), `deployer cannot act as ${account}`);
}

for (const name of manifest.requiredExistingFunctions) {
  const value = JSON.parse(await readFile(path.join(functionsRoot, `${name}.json`), "utf8"));
  assert.equal(value.state, "ACTIVE");
  assert.equal(value.environment, "GEN_2");
  assert.equal(value.buildConfig?.runtime, "nodejs22");
}

for (const entry of manifest.functions) {
  const value = JSON.parse(await readFile(path.join(functionsRoot, `${entry.name}.json`), "utf8"));
  if (value.absent) continue;
  assert.equal(validateExistingFunction(entry, value), true);
}
console.log("PASS: PR451 Intake/Activation staging preflight boundary verified");
