import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRelease, STAGING_PROJECT_ID } from "./exact-sha-release-policy.mjs";
import { permissionPlan } from "./gcloud-function-release.mjs";

const TROUBLESHOOT_URL = "https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot";
const CAN_ACCESS = new Set([1, "CAN_ACCESS"]);

export function sanitizeErrorBody(value) {
  const body = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return body
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/("?(?:access[_-]?token|id[_-]?token|refresh[_-]?token|private[_-]?key|credential)"?\s*[:=]\s*)"?[^\s,;\"}]+"?/gi, "$1[REDACTED]")
    .slice(0, 1024);
}

export function policyTroubleshooterPrincipal(serviceAccount) {
  if (!/^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new Error("Policy Troubleshooter principal must be a service-account email address.");
  }
  return serviceAccount;
}

export function evaluateTroubleshooterResponse({ status, body }, check) {
  if (!Number.isInteger(status) || !body || typeof body !== "object" || Array.isArray(body)) {
    return { ...check, result: "ERROR", status: Number.isInteger(status) ? status : null,
      detail: "Malformed Policy Troubleshooter response." };
  }
  if (status !== 200) {
    return { ...check, result: "ERROR", status, detail: sanitizeErrorBody(body) };
  }
  const state = body.overallAccessState;
  if (CAN_ACCESS.has(state)) return { ...check, result: "GRANTED", status, overallAccessState: state };
  if (state === "CANNOT_ACCESS" || state === 2) return { ...check, result: "MISSING", status, overallAccessState: state };
  return { ...check, result: "UNKNOWN", status, overallAccessState: state ?? null,
    detail: "Policy Troubleshooter did not return a conclusive overallAccessState." };
}

function resourceForPermission(release, permission) {
  const project = `//cloudresourcemanager.googleapis.com/projects/${release.projectId}`;
  if (permission.startsWith("resourcemanager.") || permission.startsWith("serviceusage.")) return [project];
  if (permission === "cloudfunctions.locations.list") {
    return [`//cloudfunctions.googleapis.com/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}`];
  }
  if (permission === "cloudfunctions.operations.get") {
    return [`//cloudfunctions.googleapis.com/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}/operations/preflight-placeholder`];
  }
  if (permission.startsWith("cloudfunctions.functions.")) {
    return release.functions.map(name => `//cloudfunctions.googleapis.com/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}/functions/${name}`);
  }
  if (permission.startsWith("run.services.")) {
    return release.functions.map(name => `//run.googleapis.com/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}/services/${name.toLowerCase()}`);
  }
  throw new Error(`No authorized resource mapping for ${permission}.`);
}

export function permissionChecks(release) {
  if (release.projectId !== STAGING_PROJECT_ID) throw new Error("Permission verification is staging-only.");
  const plan = permissionPlan(release);
  if (release.functionDeploymentTool !== "gcloud-gen2") return [];
  const deployer = plan.deployer.flatMap(permission => resourceForPermission(release, permission).map(resource => ({
    category: "routine-deployer", principal: policyTroubleshooterPrincipal(release.functionDeployer), permission, resource,
  })));
  const actAs = plan.serviceAccounts.flatMap(target => target.permissions.map(permission => ({
    category: "service-account-actAs", principal: policyTroubleshooterPrincipal(release.functionDeployer), permission,
    resource: `//iam.googleapis.com/projects/${release.projectId}/serviceAccounts/${target.account}`,
  })));
  const build = plan.build.map(permission => ({
    category: "build-account", principal: policyTroubleshooterPrincipal(release.functionBuild), permission,
    resource: release.buildPermissionResources[permission],
  }));
  return [...deployer, ...actAs, ...build];
}

export async function verifyPermissionChecks(checks, { accessToken, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error("A short-lived Google access token is required.");
  const results = [];
  for (const check of checks) {
    let response;
    try {
      response = await fetchImpl(TROUBLESHOOT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accessTuple: {
          principal: check.principal,
          fullResourceName: check.resource,
          permission: check.permission,
        } }),
      });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { error: { message: sanitizeErrorBody(text || "Empty response body.") } }; }
      results.push(evaluateTroubleshooterResponse({ status: response.status, body }, check));
    } catch (error) {
      results.push({ ...check, result: "ERROR", status: null, detail: sanitizeErrorBody(error?.message || error) });
    }
  }
  return results;
}

export function summarizePermissionResults(results) {
  const missing = results.filter(value => value.result === "MISSING");
  const inconclusive = results.filter(value => value.result === "UNKNOWN" || value.result === "ERROR");
  return { authorized: missing.length === 0 && inconclusive.length === 0,
    totals: { checks: results.length, granted: results.filter(value => value.result === "GRANTED").length,
      missing: missing.length, inconclusive: inconclusive.length }, missing, inconclusive };
}

async function main() {
  const [releaseId, reportPath = "permission-verification.json"] = process.argv.slice(2);
  const release = await loadRelease(releaseId);
  const results = await verifyPermissionChecks(permissionChecks(release), { accessToken: process.env.GOOGLE_OAUTH_ACCESS_TOKEN });
  const summary = summarizePermissionResults(results);
  await writeFile(reportPath, `${JSON.stringify({ releaseId, ...summary, results }, null, 2)}\n`);
  console.log(JSON.stringify({ releaseId, ...summary.totals }));
  for (const item of [...summary.missing, ...summary.inconclusive]) {
    console.error(`::error title=${item.result} permission check::${item.principal} ${item.permission} on ${item.resource}; HTTP ${item.status ?? "transport"}; ${item.detail || item.overallAccessState || "no detail"}`);
  }
  if (!summary.authorized) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
