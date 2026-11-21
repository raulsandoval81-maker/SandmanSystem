# Sandman Commercial — Auth0 DEV integration

## Status and boundaries
PR #780 is merged. This is a **development-only Auth0 token compatibility** patch. Do not change Sandman Academy, billing, production, or real athletes. The existing Railway Commercial development environment has PostgreSQL and an acceptance runner, **not a publicly hosted Commercial app**. Do not invent callback URLs or configure production secrets.

## Auth0 resources
Reuse the existing Native iOS DEV app, Regular Web DEV app, and Commercial API DEV. On the API select RS256 and the RFC 9068 JWT access token profile. Allow user-delegated access only for the two named DEV apps; keep client grants disabled. Request access tokens for the exact API audience.

Securely configure the eventual Commercial app host:
- `COMMERCIAL_OIDC_PROVIDER=auth0`
- `COMMERCIAL_OIDC_ISSUER` (actual HTTPS issuer, including trailing slash)
- `COMMERCIAL_OIDC_AUDIENCE` (exact Auth0 API Identifier)
- `COMMERCIAL_OIDC_JWKS_URL` (from provider metadata)
- `COMMERCIAL_OIDC_AUTHORIZATION_URL`
- `COMMERCIAL_OIDC_LOGOUT_URL`

No secrets or tokens belong in source control or chat. Derive provider endpoints from the actual tenant's published metadata.

## Token claim contract
The Auth0 verifier requires a signed RS256 API **access token**, `typ: at+jwt`, correct issuer, audience, time claims, subject, `jti`, Auth0 `org_id`, and trusted namespaced verified email proof. It deliberately rejects Auth0 `org` aliases and arbitrary unverified bare `email` or `email_verified` fields. PostgreSQL remains the membership authority.

Review and install a DEV-only Auth0 Post-Login Action:

```js
exports.onExecutePostLogin = async (event, api) => {
  if (event.resource_server?.identifier !== "https://api.dev.sandmancommercial.com") return;
  if (event.user.email_verified !== true || typeof event.user.email !== "string") {
    api.access.deny("A verified email address is required.");
    return;
  }
  api.accessToken.setCustomClaim("https://sandmancommercial.com/email", event.user.email);
  api.accessToken.setCustomClaim("https://sandmancommercial.com/email_verified", true);
};
```

Never derive verified-email ownership from an invitation link, browser parameter, or client-controlled input. Auth0 login must request the target `organization` so its API token includes `org_id`. Establish verified Auth0 organization ID ↔ Commercial database organization mapping rather than assuming IDs match.

## Unresolved release gates
1. Configure Auth0 app access, Organizations, real tenant domain and issuer. Securely supply configuration only to a proper future development app service.
2. Implement and verify native PKCE and web confidential-server login redirects with actual callbacks. No Commercial app host exists yet.
3. Implement organization changes using a fresh Auth0 authorization request specifying `organization`; the current `OrganizationTokenIssuer` interface is not itself an implementation.
4. Implement a persistent revoked-`jti` store checked on every protected operation, failing closed when unreachable. Logout by itself doesn't guarantee immediate JWT invalidation.
5. Verify real-provider login, invitation, org switch, verified email, replay prevention, logout, revocation, JWKS rotation/outage, and tenant isolation before calling the integration complete.

**Real-provider acceptance remains BLOCKED. No production deployment is authorized.**
