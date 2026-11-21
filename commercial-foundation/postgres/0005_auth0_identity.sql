-- Auth0 organization mapping and durable access-token revocation.
-- Provider organization identifiers are never treated as Commercial tenant IDs.
CREATE TABLE commercial_auth0_organization_mappings (
  provider_organization_id text PRIMARY KEY,
  organization_id text NOT NULL UNIQUE REFERENCES commercial_organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_organization_id ~ '^org_[A-Za-z0-9]+$')
);

CREATE TABLE commercial_revoked_access_tokens (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  token_digest text NOT NULL,
  provider_subject text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'logout',
  PRIMARY KEY (organization_id,token_digest),
  CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  CHECK (reason IN ('logout','account_recovery','administrative'))
);
CREATE INDEX commercial_revoked_access_tokens_expiry
  ON commercial_revoked_access_tokens(expires_at);

ALTER TABLE commercial_auth0_organization_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_auth0_organization_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_revoked_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_revoked_access_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_auth0_organization_mapping ON commercial_auth0_organization_mappings
  USING (organization_id=commercial_current_tenant())
  WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_revoked_access_tokens ON commercial_revoked_access_tokens
  USING (organization_id=commercial_current_tenant())
  WITH CHECK (organization_id=commercial_current_tenant());

GRANT SELECT ON commercial_auth0_organization_mappings TO commercial_runtime;
GRANT SELECT,INSERT ON commercial_revoked_access_tokens TO commercial_runtime;

-- Authentication must map an Auth0 org before a tenant RLS context exists.
-- Expose only the single mapped tenant ID, not the mapping table.
CREATE FUNCTION commercial_resolve_auth0_organization(provider_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
  SELECT organization_id
  FROM commercial_auth0_organization_mappings
  WHERE provider_organization_id=provider_id
$$;
REVOKE ALL ON FUNCTION commercial_resolve_auth0_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial_resolve_auth0_organization(text) TO commercial_runtime;
