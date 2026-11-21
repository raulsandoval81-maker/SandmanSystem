ALTER TABLE commercial_application_records
  DROP CONSTRAINT commercial_application_records_kind_check,
  ADD CONSTRAINT commercial_application_records_kind_check CHECK (kind IN (
    'organization','academies','locations','programs','memberships','entitlements',
    'sessions','athletes','attendance','practiceNotes','guardians','guardianLinks',
    'athleteIdentityLinks','curricula','curriculumAssignments','skillEvaluations',
    'progressionCycles','xpEvents','promotions','accessInvitations','recoveryCases',
    'recoveryEvidence','recoveryPenalties','transferAcceptances','audits','events'
  ));
