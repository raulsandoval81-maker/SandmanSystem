-- Fast authoritative membership lookup and database-level invitation replay guards.
CREATE INDEX commercial_membership_subject_state
  ON commercial_application_records(organization_id,(payload->>'userId'),(payload->>'state'))
  WHERE kind='memberships';

CREATE UNIQUE INDEX commercial_active_membership_identity
  ON commercial_application_records(
    organization_id,
    (payload->>'userId'),
    (payload->>'role'),
    (payload->>'scopeType'),
    (payload->>'scopeId')
  ) WHERE kind='memberships' AND payload->>'state'='active';

CREATE UNIQUE INDEX commercial_invitation_token_digest
  ON commercial_application_records(organization_id,(payload->>'tokenDigest'))
  WHERE kind='accessInvitations';
