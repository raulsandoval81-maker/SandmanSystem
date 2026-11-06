#!/usr/bin/env node
"use strict";
// Protected PR505 WIF diagnosis ONLY. Fetch a short-lived GitHub OIDC assertion,
// verify its identity, and print selected NON-SECRET claim values. Never print,
// save, upload, exchange, or forward the signed JWT.
const expectedRepository = "raulsandoval81-maker/SandmanSystem";
const expectedWorkflow = expectedRepository +
  "/.github/workflows/pr505-2c-live-readonly.yml@refs/heads/main";
const provider = "//iam.googleapis.com/projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging";
function requireCondition(ok, reason) {
  if (!ok) throw new Error("PR505_WIF_DIAGNOSTIC_BLOCKED: " + reason);
}
function describeClaims(payload) {
  const keys = ["iss", "aud", "sub", "repository", "repository_id",
    "repository_owner", "ref", "workflow_ref", "job_workflow_ref",
    "event_name", "environment", "ref_type"];
  return Object.fromEntries(keys.filter(k => payload[k] !== undefined)
    .map(k => [k, String(payload[k])]));
}
if (process.env.PR505_OIDC_SELFTEST === "true") {
  const claims = describeClaims({sub:"repo:example/example:environment:staging",
    repository:expectedRepository,ref:"refs/heads/main",
    workflow_ref:expectedWorkflow,secret_not_to_print:"PRIVATE"});
  requireCondition(!JSON.stringify(claims).includes("PRIVATE"), "claim allowlist failure");
  console.log("PR505_OIDC_CLAIM_REDACTION_SELFTEST_PASS");
} else {
  (async () => {
    requireCondition(process.env.GITHUB_REPOSITORY === expectedRepository, "repository");
    requireCondition(process.env.GITHUB_REF === "refs/heads/main", "ref");
    requireCondition(process.env.GITHUB_WORKFLOW_REF === expectedWorkflow, "workflow_ref");
    requireCondition(process.env.GITHUB_EVENT_NAME === "workflow_dispatch", "event");
    requireCondition(process.env.CONFIRM_PROJECT === "sandman-combat-staging", "project");
    requireCondition(process.env.RELEASE_ACTION === "validate", "action");
    requireCondition(process.env.APPROVE_RELEASE === "", "deployment approval prohibited");
    const endpoint = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    requireCondition(Boolean(endpoint && token), "GitHub token request capability unavailable");
    const url = new URL(endpoint);
    url.searchParams.set("audience", provider);
    const response = await fetch(url, {headers:{Authorization:"Bearer "+token}});
    requireCondition(response.ok, "GitHub OIDC request failed");
    const body = await response.json();
    requireCondition(typeof body.value === "string", "GitHub returned no assertion");
    const jwt = body.value;
    const segments = jwt.split(".");
    requireCondition(segments.length===3, "malformed assertion");
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    requireCondition(payload.aud === provider, "audience mismatch");
    requireCondition(payload.repository === expectedRepository, "OIDC repository mismatch");
    requireCondition(payload.ref === "refs/heads/main", "OIDC ref mismatch");
    requireCondition(payload.workflow_ref === expectedWorkflow, "OIDC workflow mismatch");
    requireCondition(payload.event_name === "workflow_dispatch", "OIDC event mismatch");
    console.log("PR505_GITHUB_OIDC_IDENTITY_NON_SECRET_CLAIMS");
    console.log(JSON.stringify(describeClaims(payload), null, 2));
    console.log("NO_JWT_LOGGED_NO_CLOUD_TOKEN_EXCHANGED_NO_DEPLOY");
  })().catch(error => {
    // Never include error object or response bodies: may contain credentials.
    console.error("PR505_OIDC_DIAGNOSTIC_FAILED", error.message.startsWith("PR505_WIF_DIAGNOSTIC_BLOCKED:") ? error.message : "Unexpected validation failure");
    process.exitCode = 1;
  });
}
