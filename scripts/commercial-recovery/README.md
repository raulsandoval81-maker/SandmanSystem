# Commercial snapshot tooling

These commands operate on local Git objects and an independently reviewed private
plan. The commands have no authentication, network, deployment or import step.

Supply a complete JSON plan with version 1, source equal to the pinned commit,
and an entries array. Each entry supplies path, action, a short non-identifying
reason code, and the exact pinned blob or submodule object ID as oid. Add omits
oid. Keep, replace and add require sha256 of the proposed output bytes. Replace
and add also require those exact bytes as canonical base64. Exclude requires
neither. A review plan is intentionally absent from this public branch. Build
and independently review it in a private workspace, including retained binaries,
customer-data candidates and each isolation overlay. The plan and manifest
contain path metadata and require restricted handling.

```sh
node --test scripts/commercial-recovery/policy.test.cjs
node scripts/commercial-recovery/sanitize.cjs SOURCE_REPO PRIVATE_PLAN NEW_OUTPUT_DIR
node scripts/commercial-recovery/verify.cjs SOURCE_REPO PRIVATE_PLAN OUTPUT_DIR
```

Use a trusted Git object directory containing the exact pinned source, on a new
runner with disposable storage. The sanitizer creates a parentless candidate
bundle and manifest. The verifier unpacks the bundle into a fresh Git repository
and compares each file and mode against the pinned Git tree and reviewed plan.
The fixed path and content checks supplement human classification and runtime
tests. They do not certify removal of all private data or establish runtime isolation.

Before using a real candidate, review the entire plan, including any retained
media and embedded examples. Test Coach, Athlete, Parent, and Management on
synthetic records using isolated loopback emulators with a demo project. Verify
XP, rank, belt and advancement behavior, and negative checks on Academy,
Firebase, Stripe and outbound email paths. An unresolved finding blocks use.
Copy only the verified bundle and manifest to an owner-controlled private
destination with separate write and read controls. Publish only hashes and
counts. Provisioning, workflow wiring and import are outside this draft.
