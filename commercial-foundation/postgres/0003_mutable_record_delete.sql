-- BEFORE DELETE triggers must return OLD to allow deletion. Returning NEW
-- (which is null for DELETE) silently skipped mutable-record deletes.
CREATE OR REPLACE FUNCTION commercial_forbid_immutable_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind IN ('xpEvents','promotions','recoveryEvidence','recoveryPenalties','transferAcceptances','audits') THEN
    RAISE EXCEPTION 'append-only application record';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
