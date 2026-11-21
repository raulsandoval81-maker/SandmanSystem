# Sandman Commercial development web host

The server is development-only and requires Railway private PostgreSQL networking. It exposes `/health`, `/`, `/auth/login`, `/auth/callback`, `/dashboard`, and `/auth/logout`.

Required environment variables:

- `NODE_ENV=production`
- `DATABASE_URL` using the Railway private service reference
- `COMMERCIAL_WEB_BASE_URL` using the assigned Railway HTTPS domain
- `COMMERCIAL_SESSION_ENCRYPTION_KEY` as a sealed, random 32-byte base64 value
- `COMMERCIAL_AUTH0_ORGANIZATIONS` as the approved organization picker JSON
- `COMMERCIAL_OIDC_PROVIDER=auth0`
- `COMMERCIAL_OIDC_ISSUER`, `COMMERCIAL_OIDC_AUDIENCE`, `COMMERCIAL_OIDC_JWKS_URL`
- `COMMERCIAL_OIDC_AUTHORIZATION_URL`, `COMMERCIAL_OIDC_TOKEN_URL`, `COMMERCIAL_OIDC_LOGOUT_URL`
- `COMMERCIAL_AUTH0_WEB_CLIENT_ID`, sealed `COMMERCIAL_AUTH0_WEB_CLIENT_SECRET`
- `COMMERCIAL_AUTH0_NATIVE_CLIENT_ID`

OAuth transactions and server sessions are stored in PostgreSQL by migration 0006. PKCE verifiers and access tokens are AES-256-GCM encrypted; browser cookies are opaque, Secure, HttpOnly, SameSite=Lax values represented in PostgreSQL only by SHA-256 digest.
