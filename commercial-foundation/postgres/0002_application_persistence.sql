-- Additive Sprint 7 application persistence. The payload table preserves the
-- existing Commercial domain contracts exactly while PostgreSQL owns tenant
-- isolation, atomicity, durability, and concurrency.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='commercial_runtime') THEN
    CREATE ROLE commercial_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

CREATE TABLE commercial_application_records (
  organization_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'organization','academies','locations','programs','memberships','entitlements',
    'sessions','athletes','attendance','practiceNotes','guardians','guardianLinks',
    'athleteIdentityLinks','curricula','curriculumAssignments','skillEvaluations',
    'progressionCycles','xpEvents','promotions','accessInvitations','recoveryCases',
    'recoveryEvidence','recoveryPenalties','transferAcceptances','audits'
  )),
  id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,kind,id),
  FOREIGN KEY (organization_id) REFERENCES commercial_organizations(id)
);

ALTER TABLE commercial_application_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_application_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_application_records ON commercial_application_records
  USING (organization_id=commercial_current_tenant())
  WITH CHECK (organization_id=commercial_current_tenant());

ALTER TABLE commercial_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_organizations ON commercial_organizations
  USING (id=commercial_current_tenant()) WITH CHECK (id=commercial_current_tenant());

CREATE FUNCTION commercial_forbid_immutable_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind IN ('xpEvents','promotions','recoveryEvidence','recoveryPenalties','transferAcceptances','audits') THEN
    RAISE EXCEPTION 'append-only application record';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER application_records_append_only
  BEFORE UPDATE OR DELETE ON commercial_application_records
  FOR EACH ROW EXECUTE FUNCTION commercial_forbid_immutable_record_mutation();

-- Align the normalized recovery schema with the approved no-debt policy.
ALTER TABLE commercial_recovery_cases
  ADD COLUMN inactivity_started_at timestamptz,
  ADD COLUMN return_practice_session_id text,
  ADD COLUMN penalty_days_applied integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN total_penalty_xp integer NOT NULL DEFAULT 0 CHECK (total_penalty_xp BETWEEN 0 AND 150),
  ADD COLUMN deducted_xp integer NOT NULL DEFAULT 0 CHECK (deducted_xp >= 0),
  ADD COLUMN forgiven_xp integer NOT NULL DEFAULT 0 CHECK (forgiven_xp >= 0);

ALTER TABLE commercial_recovery_cases DROP CONSTRAINT commercial_recovery_cases_state_check;
ALTER TABLE commercial_recovery_cases DROP CONSTRAINT commercial_recovery_cases_policy_activated_check;
ALTER TABLE commercial_recovery_cases
  ADD CONSTRAINT commercial_recovery_cases_state_check CHECK (state IN ('evidence_pending','completed','cancelled')),
  ADD CONSTRAINT commercial_recovery_cases_policy_activated_check CHECK (policy_activated),
  ADD CONSTRAINT commercial_recovery_penalty_totals_check CHECK (deducted_xp + forgiven_xp = total_penalty_xp);

CREATE TABLE commercial_recovery_penalties (
  organization_id text NOT NULL,
  id text NOT NULL,
  recovery_case_id text NOT NULL,
  athlete_id text NOT NULL,
  cycle_id text NOT NULL,
  inactivity_day integer NOT NULL CHECK (inactivity_day IN (28,35,49,63,77)),
  penalty_xp integer NOT NULL CHECK (penalty_xp=30),
  deducted_xp integer NOT NULL CHECK (deducted_xp BETWEEN 0 AND 30),
  forgiven_xp integer NOT NULL CHECK (forgiven_xp BETWEEN 0 AND 30),
  applied_by_user_id text NOT NULL,
  applied_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,recovery_case_id,inactivity_day),
  CHECK (deducted_xp + forgiven_xp = penalty_xp),
  FOREIGN KEY (organization_id,recovery_case_id) REFERENCES commercial_recovery_cases(organization_id,id),
  FOREIGN KEY (organization_id,athlete_id) REFERENCES commercial_athletes(organization_id,id),
  FOREIGN KEY (organization_id,cycle_id) REFERENCES commercial_progression_cycles(organization_id,id)
);
ALTER TABLE commercial_recovery_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_recovery_penalties FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_recovery_penalties ON commercial_recovery_penalties
  USING (organization_id=commercial_current_tenant())
  WITH CHECK (organization_id=commercial_current_tenant());
CREATE TRIGGER recovery_penalties_append_only
  BEFORE UPDATE OR DELETE ON commercial_recovery_penalties
  FOR EACH ROW EXECUTE FUNCTION commercial_forbid_mutation();

GRANT USAGE ON SCHEMA public TO commercial_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO commercial_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO commercial_runtime;
