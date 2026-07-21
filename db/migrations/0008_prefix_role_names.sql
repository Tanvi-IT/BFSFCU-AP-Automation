-- Prefix the application roles with "pp-".
--
-- The role names double as Microsoft Entra group names, and bare names like
-- "admin" or "approver" are far too generic to claim in a shared directory.
-- Prefixing scopes them to this application.
--
-- ALTER TYPE ... RENAME VALUE rewrites the label in place. Enum values are
-- stored by internal id, not by text, so every existing users.role row follows
-- automatically and no data migration is needed.
--
-- Idempotent: each rename is skipped if the old label is already gone.

DO $$
DECLARE
  pair  text[];
  pairs text[][] := ARRAY[
    ARRAY['superadmin', 'pp-superadmin'],
    ARRAY['admin',      'pp-admin'],
    ARRAY['ap_analyst', 'pp-ap_analyst'],
    ARRAY['approver',   'pp-approver'],
    ARRAY['read_only',  'pp-read_only']
  ];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'app_role'
         AND e.enumlabel = pair[1]
    ) THEN
      EXECUTE format('ALTER TYPE app_role RENAME VALUE %L TO %L', pair[1], pair[2]);
    END IF;
  END LOOP;
END $$;

-- The column default referenced the old label and must be restated.
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'pp-read_only';
