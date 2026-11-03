import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("./pr451-intake-activation-release.json", import.meta.url);
export const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
const safeName = /^[A-Za-z][A-Za-z0-9]+$/;

export function runtimeFor(entry) {
  if (entry.runtime === "email") return manifest.emailRuntimeServiceAccount;
  if (entry.kind === "gen1-callable") return manifest.gen1RuntimeServiceAccount;
  return manifest.defaultRuntimeServiceAccount;
}

export function deploymentPlan(entry, sourceRoot) {
  if (!manifest.functions.some(item => item.name === entry.name) || !safeName.test(entry.name)) {
    throw new Error("Function is outside the exact release allowlist.");
  }
  const gen1 = entry.kind === "gen1-callable";
  const args = ["functions", "deploy", entry.name, gen1 ? "--no-gen2" : "--gen2",
    `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--runtime=nodejs22",
    `--entry-point=${entry.name}`, `--source=${path.resolve(sourceRoot)}`,
    gen1 ? `--service-account=${runtimeFor(entry)}` : `--run-service-account=${runtimeFor(entry)}`,
    `--build-service-account=projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}`,
    "--memory=256Mi", "--timeout=60s", "--max-instances=20",
    `--update-labels=sandman-release=${manifest.releaseId},sandman-source-sha=${manifest.applicationSha}`,
    "--update-env-vars=SANDMAN_STAGING_ACK=sandman-combat-staging,SANDMAN_STAGING_PROJECT_ID=sandman-combat-staging,SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT=sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  ];
  if (!gen1) args.push("--cpu=1", "--concurrency=80", "--ingress-settings=all");
  const secrets = entry.secrets || [];
  args.push(secrets.length ? `--set-secrets=${secrets.map(key => `${key}=${key}:latest`).join(",")}` : "--clear-secrets");
  if (entry.kind.endsWith("callable")) {
    args.push("--trigger-http");
    if (gen1) args.push("--allow-unauthenticated");
  } else if (entry.kind === "gen2-firestore") {
    args.push(`--trigger-event-filters=type=${entry.eventType}`,
      "--trigger-event-filters=database=(default)", "--trigger-event-filters=namespace=(default)",
      `--trigger-event-filters-path-pattern=document=${entry.document}`,
      `--trigger-location=${manifest.triggerRegion}`);
  } else {
    throw new Error("Unsupported function generation or trigger kind.");
  }
  args.push("--quiet");
  return { executable: "gcloud", args, runtime: runtimeFor(entry) };
}

export function validateManifest() {
  if (manifest.projectId !== "sandman-combat-staging" || manifest.applicationSha.length !== 40 ||
      manifest.deploymentAuthorized !== false || manifest.productionChangesAuthorized !== false ||
      manifest.functions.length !== 16 || manifest.deployBillingFunctions !== false ||
      manifest.deployFirestoreRules !== false || manifest.deployFirestoreIndexes !== false ||
      manifest.deployHosting !== false) throw new Error("Release manifest boundary mismatch.");
  const names = manifest.functions.map(entry => entry.name);
  if (new Set(names).size !== names.length) throw new Error("Duplicate function target.");
  return true;
}

export function isVerifiedNotFound(result) {
  if (result.status === 0 || String(result.stdout || "").trim()) return false;
  const error = String(result.stderr || "");
  return /ResponseError: status=\[404\]/.test(error) &&
    /(NOT_FOUND|does not exist|was not found)/i.test(error);
}

function run(plan) {
  const result = spawnSync(plan.executable, plan.args, { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}

async function main() {
  const [command, sourceRoot] = process.argv.slice(2);
  validateManifest();
  if (command === "plan") {
    console.log(JSON.stringify(manifest.functions.map(entry => deploymentPlan(entry, sourceRoot)), null, 2));
    return;
  }
  if (command !== "bootstrap" || process.env.GITHUB_REPOSITORY !== manifest.repository ||
      process.env.GITHUB_REF !== "refs/heads/main" ||
      process.env.SANDMAN_INTAKE_BOOTSTRAP_APPROVAL !== "APPROVE_16_STAGING_INTAKE_ACTIVATION_FUNCTIONS" ||
      process.env.SANDMAN_CONFIRM_PROJECT !== manifest.projectId) {
    throw new Error("Protected exact-SHA staging bootstrap authorization is missing.");
  }
  for (const entry of manifest.functions) {
    const describe = spawnSync("gcloud", ["functions", "describe", entry.name,
      `--region=${manifest.region}`, `--project=${manifest.projectId}`, "--format=json"],
    { encoding: "utf8", shell: false });
    if (describe.status === 0) {
      const existing = JSON.parse(describe.stdout);
      if (existing.labels?.["sandman-source-sha"] !== manifest.applicationSha ||
          (existing.state || existing.status) !== "ACTIVE") {
        throw new Error(`Existing function is not an exact completed release artifact: ${entry.name}`);
      }
      continue;
    }
    if (!isVerifiedNotFound(describe)) {
      const sanitized = String(describe.stderr || "Cloud function lookup failed.")
        .replace(/(ya29\.|eyJ)[A-Za-z0-9._~+\/-]+/g, "[REDACTED]");
      throw new Error(`Unable to verify whether ${entry.name} is absent: ${sanitized}`);
    }
    const plan = deploymentPlan(entry, sourceRoot);
    run(plan);
    if (entry.kind === "gen2-callable") {
      run({ executable: "gcloud", args: ["run", "services", "update", entry.name.toLowerCase(),
        `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--no-invoker-iam-check", "--quiet"] });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
