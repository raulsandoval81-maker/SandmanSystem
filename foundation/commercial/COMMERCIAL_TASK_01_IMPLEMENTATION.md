# Commercial Task 01 implementation notes

Status: isolated review candidate; no deployment or Commercial repository transfer authorized.

## Baseline and doctrine

PR #739 was merged as `021eddd4739ad79a2b639160e572a7fa8e29304b`, which is the implementation baseline. The implementation preserves the locked hierarchy and domain boundaries in `foundation/architecture/PLATFORM.md`, `foundation/architecture/DATABASE.md`, and `foundation/constitution/03-HIERARCHY.md`.

The separate `SandmanCommercial` repository was inspected through GitHub before work began. It is private, has a reported size of zero, and received no files or commits.

## Implementation boundary

`commercial-foundation/` is an independent TypeScript package. It is not imported by Academy Functions or Hosting. It includes versioned organization, membership, product, entitlement and audit contracts; runtime validators; server-style authorization; and an explicitly labeled in-memory adapter used only for deterministic tests.

Core/Plus/Pro remain provisional source labels. Product registration does not enable, deploy, approve, or sell a product. Essential security and customer-data access are not gated by paid entitlements.

## Security model demonstrated

Every operational record carries `organizationId`; every request supplies a selected organization; authorization compares them before an operation. Organization administrators are tenant-local and cannot assign a system-admin role. Memberships can be invited, active, suspended, or revoked. Entitlements can be active, suspended, revoked, or expired. Revocation leaves stored customer data intact. Permitted and rejected operations create audit records.

The tests use only fictional organizations and deliberately overlapping local names/identifiers. This proves contract/service behavior in the isolated adapter, not production Firestore tenancy.

## Extraction blockers and prohibited material

Do not transfer Academy customer records, credentials, Stripe secrets/configuration/price IDs, Firebase project identifiers/configuration, production URLs, service-account material, deployment workflows, or Academy-only pricing/business rules. Existing Firestore rules and custom-claim patterns have not been certified for multi-tenancy and must not be copied wholesale.

Before a later transfer, owner approval is required for: independent infrastructure, persistence adapter and security rules; final package names and tier contents; content licensing; product owners and compatibility policy; optional adapter contracts; privacy/consent/retention rules; tenant billing; support and rollback procedures.

Optional products remain independent and unverified. Grant Factory AI is excluded.
