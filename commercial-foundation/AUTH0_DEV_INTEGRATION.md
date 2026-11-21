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

## Remaining release gates
1. Add the deployed verified-email Action to the Auth0 Post Login trigger flow.
2. Establish a real Railway development application host, then configure its exact web callback/logout URLs and the final native callback. No host exists yet, so no callback URL is invented here.
3. Apply migration 0005 in Railway development and create synthetic Auth0 organization mappings.
4. Wire the host's persistent authorization-transaction implementation to `Auth0AuthorizationFlow`; the exported in-memory implementation remains test-only.
5. Verify real-provider web and iOS login, invitation, org switch, verified email, replay prevention, logout, revocation, JWKS rotation/outage, and tenant isolation before calling the integration complete.

**Real-provider acceptance remains BLOCKED. No production deployment is authorized.**
