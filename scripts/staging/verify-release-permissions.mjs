import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRelease, STAGING_PROJECT_ID } from "./exact-sha-release-policy.mjs";
import { permissionPlan } from "./gcloud-function-release.mjs";

const BILLING_RELEASE_IDS = new Set(["billing-pr354-014198ea", "billing-pr376-dff3e6d3"]);

const TROUBLESHOOT_URL = "https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot";
const CAN_ACCESS = new Set([1, "CAN_ACCESS"]);
const CANNOT_ACCESS = new Set([2, "CANNOT_ACCESS"]);
const INCONCLUSIVE_ACCESS = new Set([3, 4, "UNKNOWN_INFO", "UNKNOWN_CONDITIONAL"]);

export function sanitizeErrorBody(value) {
  const body = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return body
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/("?(?:access[_-]?token|id[_-]?token|refresh[_-]?token|private[_-]?key|credential)"?\s*[:=]\s*)"?[^\s,;\"}]+"?/gi, "$1[REDACTED]")
    .slice(0, 2048);
}

export function policyTroubleshooterPrincipal(serviceAccount) {
  if (!/^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new Error("Policy Troubleshooter principal must be a service-account email address.");
  }
  return serviceAccount;
}

function diagnosticState(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return "[MALFORMED_STATE]";
  return sanitizeErrorBody(String(value)).slice(0, 128);
}

function troubleshooterDiagnostic(body) {
  const overallAccessState = diagnosticState(body?.overallAccessState);
  const allowAccessState = diagnosticState(body?.allowPolicyExplanation?.allowAccessState);
  const denyAccessState = diagnosticState(body?.denyPolicyExplanation?.denyAccessState);
  let reason = "unknown_overall_access_state";
  if (body?.__malformedResponse === true || !body || typeof body !== "object" || Array.isArray(body)) {
    reason = "malformed_response";
  } else if (body.overallAccessState === undefined || body.overallAccessState === null) {
    reason = "missing_overall_access_state";
  } else if (diagnosticState(body.overallAccessState) === "[MALFORMED_STATE]") {
    reason = "malformed_overall_access_state";
  } else if (INCONCLUSIVE_ACCESS.has(body.overallAccessState)) {
    reason = "inconclusive_overall_access_state";
  }
  return { reason, overallAccessState, allowAccessState, denyAccessState };
}

function apiFailure(status, body, check) {
  const inspectionPermission = body?.error?.details?.find(value =>
    value?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
    value?.reason === "IAM_PERMISSION_DENIED" &&
    String(value?.metadata?.permission || "").endsWith(".getIamPolicy"))?.metadata?.permission;
  const result = inspectionPermission ? "INSPECTION_DENIED"
    : status === 404 || body?.error?.status === "NOT_FOUND" ? "RESOURCE_NOT_FOUND" : "API_ERROR";
  return { ...check, result, status, ...(inspectionPermission ? { inspectionPermission } : {}),
    detail: sanitizeErrorBody(body) };
}

export function evaluateTroubleshooterResponse({ status, body }, check) {
  if (!Number.isInteger(status) || !body || typeof body !== "object" || Array.isArray(body) ||
      body.__malformedResponse === true) {
    const diagnosticEvidence = troubleshooterDiagnostic(body);
    return { ...check, result: "INCONCLUSIVE", status: Number.isInteger(status) ? status : null,
      diagnosticEvidence, detail: `Malformed Policy Troubleshooter response; diagnostic=${JSON.stringify(diagnosticEvidence)}.` };
  }
  if (status !== 200) return apiFailure(status, body, check);
  const state = body.overallAccessState;
  if (CAN_ACCESS.has(state)) return { ...check, result: "GRANTED", status, overallAccessState: state };
  if (CANNOT_ACCESS.has(state)) return { ...check, result: "MISSING", status, overallAccessState: state };
  const diagnosticEvidence = troubleshooterDiagnostic(body);
  return { ...check, result: "INCONCLUSIVE", status, overallAccessState: diagnosticEvidence.overallAccessState,
    diagnosticEvidence,
    detail: `Policy Troubleshooter response was inconclusive; diagnostic=${JSON.stringify(diagnosticEvidence)}.` };
}

export function evaluateTestIamPermissionsResponse({ status, body }, check) {
  if (!Number.isInteger(status) || !body || typeof body !== "object" || Array.isArray(body)) {
    return check.permissions.map(permission => ({ ...check, permission, result: "INCONCLUSIVE",
      status: Number.isInteger(status) ? status : null, detail: "Malformed testIamPermissions response." }));
  }
  if (status !== 200) return check.permissions.map(permission => apiFailure(status, body, { ...check, permission }));
  if (!Array.isArray(body.permissions) || body.permissions.some(value => typeof value !== "string")) {
    return check.permissions.map(permission => ({ ...check, permission, result: "INCONCLUSIVE", status,
      detail: "testIamPermissions response did not contain a valid permissions array." }));
  }
  const granted = new Set(body.permissions);
  return check.permissions.map(permission => ({ ...check, permission,
    result: granted.has(permission) ? "GRANTED" : "MISSING", status }));
}

function functionResource(release, name) {
  return `//cloudfunctions.googleapis.com/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}/functions/${name}`;
}

export function permissionChecks(release) {
  if (release.projectId !== STAGING_PROJECT_ID) throw new Error("Permission verification is staging-only.");
  const plan = permissionPlan(release);
  if (BILLING_RELEASE_IDS.has(release.releaseId)) {
    const deployer = policyTroubleshooterPrincipal(release.functionDeployer);
    const bootstrapPlan = permissionPlan(release, "bootstrap");
    const partialService = "recordproposalprepaidcash";
    return [
      { method: "TEST_IAM", category: "billing-function-bootstrap", principal: deployer,
        permissions: ["cloudfunctions.functions.create", "cloudfunctions.functions.get",
          "cloudfunctions.functions.update", "serviceusage.services.use"],
        resource: `//cloudresourcemanager.googleapis.com/projects/${release.projectId}`,
        url: `https://cloudresourcemanager.googleapis.com/v1/projects/${release.projectId}:testIamPermissions` },
      { method: "TEST_IAM", category: "billing-invoker-bootstrap", principal: deployer,
        permissions: ["run.services.get", "run.services.update"],
        resource: `//run.googleapis.com/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}/services/${partialService}`,
        url: `https://run.googleapis.com/v2/projects/${release.projectId}/locations/${release.expectedFunctionConfiguration.region}/services/${partialService}:testIamPermissions` },
      ...bootstrapPlan.serviceAccounts.map(target => ({ method: "TEST_IAM", category: "service-account-actAs",
        principal: deployer, permissions: target.permissions,
        resource: `//iam.googleapis.com/projects/${release.projectId}/serviceAccounts/${target.account}`,
        url: `https://iam.googleapis.com/v1/projects/${release.projectId}/serviceAccounts/${target.account}:testIamPermissions` })),
      ...bootstrapPlan.build.map(permission => ({ method: "TROUBLESHOOT", category: "build-account",
        principal: policyTroubleshooterPrincipal(release.functionBuild), permission,
        resource: permission === "storage.objects.get"
          ? release.buildPermissionResources[permission].replace(
              /^(\/\/storage\.googleapis\.com\/projects\/_\/buckets\/[^\/]+\/objects\/)(.+)$/,
              (_, prefix, objectName) => `${prefix}${encodeURIComponent(objectName)}`
            )
          : release.buildPermissionResources[permission],
        ...(permission === "storage.objects.get" ? { conditionContext: {
          resource: { service: "storage.googleapis.com",
            name: release.buildPermissionResources[permission].replace(/^\/\/storage\.googleapis\.com\//, ""),
            type: "storage.googleapis.com/Object" } } } : {}),
        url: TROUBLESHOOT_URL })),
    ];
  }
  if (release.functionDeploymentTool !== "gcloud-gen2") return [];
  const region = release.expectedFunctionConfiguration.region;
  const base = `projects/${release.projectId}/locations/${region}`;
  const deployer = policyTroubleshooterPrincipal(release.functionDeployer);
  const existingFunctions = release.functions.filter(name => !(release.newFunctions || []).includes(name));
  return [
    { method: "GET", category: "routine-deployer", principal: deployer,
      permission: "cloudfunctions.locations.list", resource: `//cloudfunctions.googleapis.com/projects/${release.projectId}/locations`,
      url: `https://cloudfunctions.googleapis.com/v2/projects/${release.projectId}/locations` },
    { method: "TEST_IAM", category: "routine-deployer", principal: deployer,
      permissions: ["resourcemanager.projects.get", "serviceusage.services.use"],
      resource: `//cloudresourcemanager.googleapis.com/projects/${release.projectId}`,
      url: `https://cloudresourcemanager.googleapis.com/v1/projects/${release.projectId}:testIamPermissions` },
    ...existingFunctions.map(name => ({ method: "TEST_IAM", category: "routine-deployer", principal: deployer,
      permissions: ["cloudfunctions.functions.update", "cloudfunctions.functions.sourceCodeSet"],
      resource: functionResource(release, name),
      url: `https://cloudfunctions.googleapis.com/v2/${base}/functions/${name}:testIamPermissions` })),
    ...plan.serviceAccounts.map(target => ({ method: "TEST_IAM", category: "service-account-actAs", principal: deployer,
      permissions: target.permissions, resource: `//iam.googleapis.com/projects/${release.projectId}/serviceAccounts/${target.account}`,
      url: `https://iam.googleapis.com/v1/projects/${release.projectId}/serviceAccounts/${target.account}:testIamPermissions` })),
    ...plan.build.map(permission => ({ method: "TROUBLESHOOT", category: "build-account",
      principal: policyTroubleshooterPrincipal(release.functionBuild), permission,
      resource: release.buildPermissionResources[permission], url: TROUBLESHOOT_URL })),
  ];
}

async function responseBody(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { __malformedResponse: true }; }
}

export async function verifyPermissionChecks(checks, { accessToken, fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error("A short-lived Google access token is required.");
  const results = [];
  for (const check of checks) {
    try {
      const troubleshoot = check.method === "TROUBLESHOOT";
      const testIam = check.method === "TEST_IAM";
      const response = await fetchImpl(check.url, {
        method: troubleshoot || testIam ? "POST" : "GET",
        headers: { Authorization: `Bearer ${accessToken}`, ...(troubleshoot || testIam ? { "Content-Type": "application/json" } : {}) },
        ...(troubleshoot ? { body: JSON.stringify({ accessTuple: {
          principal: check.principal, fullResourceName: check.resource, permission: check.permission,
          ...(check.conditionContext ? { conditionContext: check.conditionContext } : {}),
        } }) } : {}),
        ...(testIam ? { body: JSON.stringify({ permissions: check.permissions }) } : {}),
      });
      const body = await responseBody(response);
      if (troubleshoot) results.push(evaluateTroubleshooterResponse({ status: response.status, body }, check));
      else if (testIam) results.push(...evaluateTestIamPermissionsResponse({ status: response.status, body }, check));
      else if (response.status === 200) results.push({ ...check, result: "GRANTED", status: response.status });
      else results.push(apiFailure(response.status, body, check));
    } catch (error) {
      const permissions = check.permissions || [check.permission];
      results.push(...permissions.map(permission => ({ ...check, permission, result: "API_ERROR", status: null,
        detail: sanitizeErrorBody(error?.message || error) })));
    }
  }
  return results;
}

export function summarizePermissionResults(results) {
  const byResult = result => results.filter(value => value.result === result);
  const missing = byResult("MISSING");
  const inconclusive = byResult("INCONCLUSIVE");
  const apiErrors = byResult("API_ERROR");
  const resourceNotFound = byResult("RESOURCE_NOT_FOUND");
  const inspectionDenied = byResult("INSPECTION_DENIED");
  return { authorized: missing.length === 0 && inconclusive.length === 0 && apiErrors.length === 0 &&
      resourceNotFound.length === 0 && inspectionDenied.length === 0,
    totals: { checks: results.length, granted: byResult("GRANTED").length, missing: missing.length,
      inconclusive: inconclusive.length, apiErrors: apiErrors.length, resourceNotFound: resourceNotFound.length,
      inspectionDenied: inspectionDenied.length },
    missing, inconclusive, apiErrors, resourceNotFound, inspectionDenied };
}

async function main() {
  const [releaseId, reportPath = "permission-verification.json"] = process.argv.slice(2);
  const release = await loadRelease(releaseId);
  const checks = permissionChecks(release);
  const results = await verifyPermissionChecks(checks, { accessToken: process.env.GOOGLE_OAUTH_ACCESS_TOKEN });
  const summary = summarizePermissionResults(results);
  await writeFile(reportPath, `${JSON.stringify({ releaseId, requestCount: checks.length, ...summary, results }, null, 2)}\n`);
  console.log(JSON.stringify({ releaseId, requestCount: checks.length, ...summary.totals }));
  for (const item of [...summary.missing, ...summary.inconclusive, ...summary.apiErrors, ...summary.resourceNotFound,
    ...summary.inspectionDenied]) {
    console.error(`::error title=${item.result} permission check::${item.principal} ${item.permission} on ${item.resource}; HTTP ${item.status ?? "transport"}; ${item.detail || item.overallAccessState || "no detail"}`);
  }
  if (!summary.authorized) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
