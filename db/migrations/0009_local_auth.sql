-- 0009_local_auth.sql
-- Switch from Entra-only identity to local username/password authentication,
-- and collapse the role model to two roles: admin and user.
--
-- Entra is not removed conceptually — the schema keeps an auth_provider and
-- external_id so an SSO provider can be linked later without another rewrite.
-- Local users authenticate with a password; SSO users would carry an
-- external_id and no password.
--
-- Idempotent where practical so it can be re-run against a partly-migrated DB.

BEGIN;

-- ---------------------------------------------------------------------------
-- Users table — local auth columns
-- ---------------------------------------------------------------------------

-- Entra object id is no longer the identity. Local users have none, so it must
-- be nullable. The existing UNIQUE constraint permits multiple NULLs.
ALTER TABLE users ALTER COLUMN entra_oid DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'local';
-- external_id is the SSO seam: a provider subject/oid to link on later.
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id text;

-- Email becomes the login identifier and must be unique (case-insensitive)
-- for users that have one.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_ux
  ON users (lower(email)) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Collapse the role enum to two values: admin, user
-- ---------------------------------------------------------------------------
-- pp-superadmin and pp-admin become admin; everything else becomes user.
-- The enum is swapped by routing through text, since PostgreSQL cannot remove
-- enum values in place.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'app_role' AND e.enumlabel LIKE 'pp-%'
  ) THEN
    ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;

    UPDATE users SET role = CASE
      WHEN role IN ('pp-superadmin', 'pp-admin', 'superadmin', 'admin') THEN 'admin'
      ELSE 'user'
    END;

    DROP TYPE app_role;
    CREATE TYPE app_role AS ENUM ('admin', 'user');

    ALTER TABLE users ALTER COLUMN role TYPE app_role USING role::app_role;
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
  END IF;
END$$;

COMMENT ON COLUMN users.auth_provider IS 'Identity source: local (password) or an SSO provider name.';
COMMENT ON COLUMN users.external_id   IS 'SSO subject/oid, when auth_provider is not local. Nullable.';
COMMENT ON COLUMN users.password_hash IS 'scrypt hash for local auth. Null for SSO users.';

-- ---------------------------------------------------------------------------
-- Seed the default administrator
-- ---------------------------------------------------------------------------
-- admin@peapod.com / Invoice@approve
-- The hash below is scrypt$N$r$p$saltHex$hashHex for that password, generated
-- with the same parameters shared/password.ts uses. Change the password after
-- first sign-in.

INSERT INTO users (email, full_name, role, auth_provider, password_hash, is_active)
VALUES (
  'admin@peapod.com',
  'Administrator',
  'admin',
  'local',
  'scrypt$16384$8$1$13339c7c381fed5b89ff1aaa22292432$821ac06f2a317a8a26e6ebc7c4c2d0504079651fe92de9628637397b358dcf1c01094b2df60405747fcbb1eec7b8f2b39819dbde94fbe597166e037032e12470',
  true
)
ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING;

COMMIT;
