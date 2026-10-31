#!/usr/bin/env node
// Strict, read-only discovery. No secret payloads, payments, deployments or IAM writes.
import { spawnSync } from "node:child_process";
import { BILLING_V1_REQUIRED_CALLABLES, BILLING_V1_REQUIRED_WEBHOOK, BILLING_V1_STAGING_PROJECT } from "./billing-v1-pr394-deployment-contract.mjs";

export const REQUIRED_SECRETS = Object.freeze(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]);

export function summarizeBillingStagingInventory(functions, secrets) {
  if (!Array.isArray(functions) || !secrets || typeof secrets !== "object") throw Error("Staging inventory is incomplete.");
  const byName = new Map(functions.map(item => [String(item.name || "").split("/").at(-1), item]));
  const functionResults = [...BILLING_V1_REQUIRED_CALLABLES, BILLING_V1_REQUIRED_WEBHOOK].map(name => {
    const found = byName.get(name);
    return { name, status: !found ? "MISSING" :
      found.state !== "ACTIVE" || !["GEN_2", "GEN_2"].includes(found.environment) ? "UNVERIFIED" : "ACTIVE" };
  });
  const secretResults = REQUIRED_SECRETS.map(name => {
    const found = secrets[name];
    if (!found) return { name, status: "MISSING" };
    if (found.error) return { name, status: "UNKNOWN" };
    const labels = found.labels || {};
    if (name.startsWith("STRIPE_") && (labels.environment !== "staging" || labels.stripe_mode !== "test"))
      return { name, status: "LABEL_MISMATCH" };
    if (name === "RESEND_API_KEY" && labels.environment !== "staging")
      return { name, status: "LABEL_MISMATCH" };
    return { name, status: "METADATA_PRESENT" };
  });
  return {
    projectId: BILLING_V1_STAGING_PROJECT,
    functions: functionResults,
    secrets: secretResults,
    readyForDeployment: false, // Inventory alone cannot prove secret values, webhook routing, IAM or bootstrap.
    outstanding: [
      "Verify Cloud Functions runtime IAM and exact source configuration",
      "Verify Stripe test key mode and webhook destination without printing secret values",
      "Verify approved staging Resend email delivery identity",
      "Approve bootstrap of missing functions separately from deployment",
    ],
  };
}

function gcloud(args) {
  const result = spawnSync("gcloud", args, { encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
  return { success: result.status === 0, data: result.stdout };
}

function main() {
  const project = BILLING_V1_STAGING_PROJECT;
  const functionsResponse = gcloud(["functions", "list", "--project", project, "--regions", "us-central1", "--format=json"]);
  if (!functionsResponse.success) throw Error("Could not read staging function inventory. No changes were made.");
  let functions;
  try { functions = JSON.parse(functionsResponse.data); }
  catch { throw Error("Malformed Cloud Functions inventory."); }
  const secrets = {};
  for (const name of REQUIRED_SECRETS) {
    const response = gcloud(["secrets", "describe", name, "--project", project, "--format=json"]);
    if (!response.success) { secrets[name] = { error: true }; continue; }
    try { const parsed = JSON.parse(response.data); secrets[name] = { labels: parsed.labels || {} }; }
    catch { secrets[name] = { error: true }; }
  }
  const summary = summarizeBillingStagingInventory(functions, secrets);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  if (summary.functions.some(x => x.status !== "ACTIVE") || summary.secrets.some(x => x.status !== "METADATA_PRESENT"))
    process.exitCode = 2; // Blocking or inconclusive; do not mistake for authorization.
}

if (process.argv[1]?.endsWith("billing-v1-pr394-readonly-preflight.mjs")) main();
