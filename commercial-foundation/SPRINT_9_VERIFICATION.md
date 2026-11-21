# Sprint 9 verification — Auth0 live development integration

## Implemented

- Auth0 Authorization Code + PKCE primitives for web and native clients, including state/nonce, exact HTTPS callback binding, organization binding, one-time callback consumption, and confidential web token exchange.
- Explicit Auth0 organization ID to Commercial organization mapping. Provider IDs are no longer accepted as Commercial tenant IDs.
- Migration `0005_auth0_identity.sql` adds tenant-isolated organization mappings and persistent, expiry-aware, replay-safe revoked-token records.
- Revoked token IDs are stored only as SHA-256 digests. Every protected OIDC verification performs a tenant-bound revocation lookup and fails closed on lookup failure.
- Logout supplies organization, subject, token ID, and expiry to the durable revoker.

## Verified 2026-11-20

- Auth0 tenant is development-only.
- `Sandman Commercial API DEV` audience is `https://api.dev.sandmancommercial.com`, JWT profile is RFC 9068, and signing is RS256.
- `Sandman Commercial DEV` Regular Web Application and Native applications exist.
- API user-delegated and client access are both per-app authorization; no machine-to-machine grant was enabled.
- Deployed Node 22 Post-Login Action `Sandman Commercial verified email claims DEV` contains the approved verified-email denial and namespaced access-token claims.
- Railway `SandmanCommercial/development` contains only the healthy PostgreSQL service and acceptance runner. No public Commercial application host or callback endpoint exists.
- Local Commercial suite: 129/129 passed.
- Production dependency isolation: PASS, 30 files scanned.

## Remaining real-provider gates

The deployed Action still requires placement in the Post Login trigger flow. A public development application host must then be created before callback/logout URLs can be configured. Migration 0005 must be applied to the Railway development database and populated with synthetic Auth0 organization mappings. Only then can real web and iOS logins, invitation acceptance, organization switching, revocation, and provider-outage behavior be exercised.

No Railway application deployment or real-provider acceptance is claimed by this change.
