CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE commercial_organizations (
  id text PRIMARY KEY,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  state text NOT NULL CHECK (state IN ('active','suspended','archived'))
);

CREATE TABLE commercial_academies (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  id text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','suspended','archived')),
  PRIMARY KEY (organization_id,id)
);

CREATE TABLE commercial_locations (
  organization_id text NOT NULL,
  id text NOT NULL,
  academy_id text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','suspended','archived')),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,academy_id) REFERENCES commercial_academies(organization_id,id)
);

CREATE TABLE commercial_programs (
  organization_id text NOT NULL,
  id text NOT NULL,
  academy_id text NOT NULL,
  name text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','suspended','archived')),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,academy_id) REFERENCES commercial_academies(organization_id,id)
);

CREATE TABLE commercial_athletes (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  id text NOT NULL,
  academy_id text NOT NULL,
  location_id text NOT NULL,
  program_id text NOT NULL,
  display_name text NOT NULL,
  adult boolean NOT NULL,
  participation_state text NOT NULL CHECK (participation_state IN ('active','inactive','archived')),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,academy_id) REFERENCES commercial_academies(organization_id,id),
  FOREIGN KEY (organization_id,location_id) REFERENCES commercial_locations(organization_id,id),
  FOREIGN KEY (organization_id,program_id) REFERENCES commercial_programs(organization_id,id)
);

CREATE TABLE commercial_memberships (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('organization_admin','management','coach','parent','adult_athlete','athlete')),
  scope_type text NOT NULL CHECK (scope_type IN ('organization','academy','location')),
  scope_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('invited','active','suspended','revoked')),
  PRIMARY KEY (organization_id,id)
);

CREATE TABLE commercial_curricula (
  organization_id text NOT NULL,
  id text NOT NULL,
  academy_id text NOT NULL,
  discipline text NOT NULL CHECK (discipline IN ('wrestling','boxing','muay_thai')),
  pathway text NOT NULL CHECK (pathway IN ('road2champion','path2legend')),
  version text NOT NULL,
  definition jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('active','retired')),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,academy_id) REFERENCES commercial_academies(organization_id,id)
);

CREATE TABLE commercial_curriculum_assignments (
  organization_id text NOT NULL,
  id text NOT NULL,
  athlete_id text NOT NULL,
  curriculum_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('active','completed','revoked')),
  assigned_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,curriculum_id) REFERENCES commercial_curricula(organization_id,id)
);

CREATE TABLE commercial_practice_sessions (
  organization_id text NOT NULL,
  id text NOT NULL,
  academy_id text NOT NULL,
  location_id text NOT NULL,
  program_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  state text NOT NULL CHECK (state IN ('scheduled','completed','cancelled')),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,academy_id) REFERENCES commercial_academies(organization_id,id),
  FOREIGN KEY (organization_id,location_id) REFERENCES commercial_locations(organization_id,id),
  FOREIGN KEY (organization_id,program_id) REFERENCES commercial_programs(organization_id,id)
);

CREATE TABLE commercial_attendance (
  organization_id text NOT NULL,
  id text NOT NULL,
  session_id text NOT NULL,
  athlete_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('present','absent','excused')),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,session_id,athlete_id),
  FOREIGN KEY (organization_id,session_id) REFERENCES commercial_practice_sessions(organization_id,id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id)
);

CREATE TABLE commercial_progression_cycles (
  organization_id text NOT NULL,
  id text NOT NULL,
  athlete_id text NOT NULL,
  assignment_id text NOT NULL,
  pathway text NOT NULL CHECK (pathway IN ('road2champion','path2legend')),
  rank_index integer NOT NULL CHECK (rank_index BETWEEN 0 AND 4),
  active_xp integer NOT NULL CHECK (active_xp >= 0),
  lifetime_xp integer NOT NULL CHECK (lifetime_xp >= active_xp),
  earned_stripes integer NOT NULL CHECK (earned_stripes BETWEEN 0 AND 4),
  sequence integer NOT NULL CHECK (sequence >= 0),
  state text NOT NULL CHECK (state IN ('active','completed','suspended')),
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,assignment_id) REFERENCES commercial_curriculum_assignments(organization_id,id),
  UNIQUE (organization_id,athlete_id,id)
);
CREATE UNIQUE INDEX one_active_cycle_per_athlete ON commercial_progression_cycles(organization_id,athlete_id) WHERE state='active';

CREATE TABLE commercial_xp_events (
  organization_id text NOT NULL,
  id text NOT NULL,
  athlete_id text NOT NULL,
  cycle_id text NOT NULL,
  source_event_id text NOT NULL,
  rank_index_at_award integer NOT NULL CHECK (rank_index_at_award BETWEEN 0 AND 4),
  lane text NOT NULL CHECK (lane IN ('strength','honor','adjustment','decay')),
  amount integer NOT NULL CHECK (amount <> 0),
  source text NOT NULL,
  actor_user_id text NOT NULL,
  reason text,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,source_event_id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,cycle_id) REFERENCES commercial_progression_cycles(organization_id,id)
);

CREATE TABLE commercial_promotions (
  organization_id text NOT NULL,
  id text NOT NULL,
  athlete_id text NOT NULL,
  cycle_id text NOT NULL,
  pathway text NOT NULL,
  from_rank text NOT NULL,
  to_rank text NOT NULL,
  historical_xp integer NOT NULL CHECK (historical_xp >= 0),
  promoted_by_user_id text NOT NULL,
  promoted_at timestamptz NOT NULL,
  requirements_verified boolean NOT NULL CHECK (requirements_verified),
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,athlete_id,from_rank,to_rank),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,cycle_id) REFERENCES commercial_progression_cycles(organization_id,id)
);

CREATE TABLE commercial_access_invitations (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  id text NOT NULL,
  email text NOT NULL,
  token_digest text NOT NULL CHECK (length(token_digest)=64),
  role text NOT NULL,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','accepted','revoked','expired')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,token_digest)
);

CREATE TABLE commercial_transfer_acceptances (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  id text NOT NULL,
  destination_athlete_id text NOT NULL,
  source_organization_id text NOT NULL,
  source_athlete_id text NOT NULL,
  package_digest text NOT NULL CHECK (length(package_digest)=64),
  payload jsonb NOT NULL,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,package_digest),
  FOREIGN KEY (organization_id,destination_athlete_id) REFERENCES commercial_athletes(organization_id,id),
  CHECK (source_organization_id <> organization_id)
);

CREATE TABLE commercial_recovery_cases (
  organization_id text NOT NULL,
  id text NOT NULL,
  athlete_id text NOT NULL,
  cycle_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('evidence_pending','evidence_verified','cancelled')),
  policy_activated boolean NOT NULL CHECK (policy_activated=false),
  opened_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,cycle_id) REFERENCES commercial_progression_cycles(organization_id,id)
);

CREATE TABLE commercial_recovery_evidence (
  organization_id text NOT NULL,
  id text NOT NULL,
  recovery_case_id text NOT NULL,
  athlete_id text NOT NULL,
  session_id text NOT NULL,
  full_participation boolean NOT NULL CHECK (full_participation),
  verified_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,recovery_case_id,session_id),
  FOREIGN KEY (organization_id,recovery_case_id) REFERENCES commercial_recovery_cases(organization_id,id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,session_id) REFERENCES commercial_practice_sessions(organization_id,id)
);

CREATE TABLE commercial_audit_events (
  organization_id text NOT NULL REFERENCES commercial_organizations(id),
  id text NOT NULL,
  actor_user_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('permitted','rejected')),
  reason text,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id)
);

CREATE FUNCTION commercial_current_tenant() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true),'')
$$;

ALTER TABLE commercial_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_curriculum_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_progression_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_access_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_transfer_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_recovery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE commercial_athletes FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_academies FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_programs FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_curricula FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_curriculum_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_practice_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_progression_cycles FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_xp_events FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_promotions FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_access_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_transfer_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_recovery_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_recovery_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE commercial_audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_athletes ON commercial_athletes USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_academies ON commercial_academies USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_locations ON commercial_locations USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_programs ON commercial_programs USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_memberships ON commercial_memberships USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_curricula ON commercial_curricula USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_assignments ON commercial_curriculum_assignments USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_sessions ON commercial_practice_sessions USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_attendance ON commercial_attendance USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_cycles ON commercial_progression_cycles USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_xp ON commercial_xp_events USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_promotions ON commercial_promotions USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_invitations ON commercial_access_invitations USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_transfers ON commercial_transfer_acceptances USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_recovery_cases ON commercial_recovery_cases USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_recovery_evidence ON commercial_recovery_evidence USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());
CREATE POLICY tenant_audits ON commercial_audit_events USING (organization_id=commercial_current_tenant()) WITH CHECK (organization_id=commercial_current_tenant());

CREATE FUNCTION commercial_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only record'; END $$;
CREATE TRIGGER xp_events_append_only BEFORE UPDATE OR DELETE ON commercial_xp_events FOR EACH ROW EXECUTE FUNCTION commercial_forbid_mutation();
CREATE TRIGGER promotions_append_only BEFORE UPDATE OR DELETE ON commercial_promotions FOR EACH ROW EXECUTE FUNCTION commercial_forbid_mutation();
CREATE TRIGGER recovery_evidence_append_only BEFORE UPDATE OR DELETE ON commercial_recovery_evidence FOR EACH ROW EXECUTE FUNCTION commercial_forbid_mutation();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON commercial_audit_events FOR EACH ROW EXECUTE FUNCTION commercial_forbid_mutation();
