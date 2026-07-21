-- 0001_extensions_and_users.sql
-- Baseline for the Azure Postgres database.
--
-- Single-tenant: there is no tenant_id anywhere in this schema.
-- Identity lives in Entra ID; this table holds the application-side profile
-- and role, keyed on the Entra object id. It replaces Supabase auth.users.

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- vendor name similarity matching

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM (
      'superadmin',
      'admin',
      'ap_analyst',
      'approver',
      'read_only'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entra ID object id (the `oid` claim). Stable per user per directory.
  entra_oid   text        NOT NULL,

  email       text,
  full_name   text,
  role        app_role    NOT NULL DEFAULT 'read_only',

  -- Deactivate without deleting, so audit history keeps referential integrity.
  is_active   boolean     NOT NULL DEFAULT true,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_entra_oid_ux UNIQUE (entra_oid)
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx  ON users (role) WHERE is_active;

COMMENT ON TABLE  users            IS 'Application users. Authentication is handled by Entra ID; this table holds profile and role.';
COMMENT ON COLUMN users.entra_oid  IS 'Entra ID object id (oid claim) — the stable identifier for the signed-in user.';
COMMENT ON COLUMN users.is_active  IS 'Soft deactivation. Inactive users are rejected at the API boundary.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;
