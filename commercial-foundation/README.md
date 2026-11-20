# Sandman Commercial foundation — isolated review candidate

This is **not** a production authentication system, persistence layer, tenant boundary, or deployed Commercial application.

## Security remediation (PR #740)
- Caller-provided `systemAdmin`, `userId` and organization claims are no longer accepted as authorization.
- `CommercialFoundation` requires an injected `IdentityAuthority` verifier for opaque request sessions. **Production must supply a server-side session/token verifier backed by a trusted identity system.**
- `InMemoryTestIdentityAuthority.mint()` is **only for synthetic test fixtures**. Never expose its minting function to a client or HTTP endpoint.
- All organization reads and capability checks require verified identity and an active, valid organization membership (or trusted system administrator).
- Academy/location memberships are checked against real tenant-owned references before scoped reads.
- Tenant-owned records use organization-qualified keys, allowing equal local IDs across independent organizations.
- Membership or entitlement insertion cannot silently overwrite existing records.
- `InMemoryCommercialStore` remains an openly mutable **test fixture store**, not a secure production repository; never expose it to untrusted callers.

## Test-only setup
```sh
npm ci
npm test
npm run check:production-dependencies
```
The PR adds a GitHub Actions workflow running the same tests on pull requests. Passing unit tests do not prove Firebase Firestore, real token verification, durable storage or commercial multi-tenancy. An independent trusted persistence/security adapter and emulator integration testing are required before any deployment.

**Never copy Academy production Firestore rules, Firebase config, credentials, customer records or Stripe connections into Commercial.**
