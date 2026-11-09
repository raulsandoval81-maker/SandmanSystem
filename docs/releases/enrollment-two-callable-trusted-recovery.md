# Enrollment two-callable staging release — protected recovery

## Root cause and release boundary

The isolated PR #585 workflow was rejected by the Google Cloud WIF provider `attributeCondition`, which permits `.github/workflows/staging-exact-sha-release.yml` on protected `main` for manual staging dispatch. Use **only** that already authorized workflow. Do not change WIF, IAM, production, Stripe, Cash/Check, Hosting, email or enrollment records.

Targets: `getEnrollmentPlacementActivity` and `getAccessSetupStatus`, Gen2 in `sandman-combat-staging/us-central1`; application source pinned to `d0f6db3b5199616d066d07a58e984dbdac7d576f`. Only these two callables may be exported by the prepared source. Runtime account is the existing staging `sandman-billing-runtime` account; **its least-privilege Firestore permissions have not been independently certified**, so do not describe the service account itself as read-only. Only the reviewed handlers are read-only.

## Review and operation

1. Merge the reviewed release-routing PR. Dispatch `enrollment-two-callable-validate` with `confirm_project=sandman-combat-staging`. No cloud authorization is used by this action.
2. Separately approve `enrollment-two-callable-bootstrap` in the same trusted workflow with exact function-creation and application-auth transport approvals. The workflow revalidates source before cloud authentication, then inventories both targets before any deployment.
3. The bootstrap creates only targets that are conclusively absent. Existing functions are **never overwritten**. If an existing target matches all pinned labels, active Gen2 runtime, entry point, service identity, no-secret configuration, and Cloud Run invocation settings, it is accepted for safe continuation. Unknown or partial configurations stop the run.
4. Inspect the evidence artifact; verify both exact functions are ACTIVE and their Cloud Run services are ready, OPTIONS preflight returns 204 with an allowed staging origin, and no unrelated function inventory names changed. Verify full IAM and runtime service identity, not only HTTP reachability.
5. Independently verify authenticated management reads for **synthetic** `P-000002`, the Enrollment Activity panel, and the Recent Activations access-status panel. An anonymous request must be rejected at the application layer. Do not trigger any invitation or payment action.

## If the first deploys and second fails

**Do not blindly click Re-run.** Inspect `evidence/getEnrollmentPlacementActivity.json`, `evidence/getEnrollmentPlacementActivity-run.json`, and each target's state file. With the staging administrator, independently describe both functions and their Cloud Run services.

- If the first function is fully ACTIVE and matches the exact release labels, entry point, runtime, service account, empty secrets, ready revision and approved transport, while the second is demonstrably absent, the reviewed bootstrap is designed to preserve the first unchanged and create only the second on a separately approved new dispatch.
- If the first function is partially created, its Cloud Run transport update failed, metadata differs, the second function partially exists, or any lookup is ambiguous, **STOP**. Do not overwrite or delete it. Prepare a dedicated, reviewed recovery for that specific state using preserved run evidence; reauthorization is required.
- If both functions are installed, never redeploy them to make a test pass. Investigate the actual CORS/auth or Firestore error read-only first.

No automatic cleanup, rollback, Firestore mutation, or production action is permitted by this plan.
