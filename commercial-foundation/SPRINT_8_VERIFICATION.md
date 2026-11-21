# Commercial Sprint 8 identity verification

## Production integration

Commercial now exposes a standards-based OIDC RS256 integration with:

- HTTPS-only issuer and JWKS endpoints;
- issuer, audience, signature, expiry, not-before, issued-at, subject, token-id,
  verified-email, and revocation validation;
- bounded JWKS caching and automatic refresh for signing-key rotation;
- fail-closed provider, key-store, and revocation failures;
- PostgreSQL-authoritative active-membership checks before every production
  organization operation and organization switch;
- provider token reissuance validation after an authorized switch;
- verified-email invitation acceptance, one-time token digests, expiry,
  revocation, replay prevention, and durable rejection audits;
- no production fallback to the test identity issuer.

The adapter is provider-neutral OIDC because no approved external provider is
configured in Railway. A production host must inject its token issuer and
revocation implementation; neither signing keys nor client secrets belong in
this repository.

## Required provider configuration

The owner must select/configure an OIDC provider and supply these Railway
development variables through secret/reference configuration:

- `COMMERCIAL_OIDC_ISSUER`
- `COMMERCIAL_OIDC_AUDIENCE`
- `COMMERCIAL_OIDC_JWKS_URL`
- `COMMERCIAL_OIDC_AUTHORIZATION_URL`
- `COMMERCIAL_OIDC_LOGOUT_URL`
- provider-specific login/logout and organization-token issuance credentials
- a fail-closed token-revocation/introspection integration

The issuer and JWKS URLs must be HTTPS. Signing private keys remain at the
provider. The application consumes only provider public JWKS material.

## Database migration

- `0004_identity_authorization.sql`
- SHA-256: `ed57465c26e0b649a10929cf38ae951ac16591adf6fb7c05ec33714ae3f613f3`
- Adds authoritative membership lookup and active-membership uniqueness indexes
  plus a database invitation-token replay guard.

## Acceptance classification

- Local cryptographic provider simulation: required JWT, rotation, verified
  account, revocation, and outage cases covered.
- Real Railway PostgreSQL: membership, invitation, switching, concurrency,
  replay, scope, suspension/revocation, audit, restart, and RLS cases covered.
- Configured external-provider sign-in/logout: **BLOCKED** until the owner
  supplies an approved provider configuration and credentials.

No Academy, billing, Stripe, XP, rank, stripe, recovery, or production
deployment behavior is changed by Sprint 8.
