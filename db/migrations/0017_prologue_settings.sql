-- 0017_prologue_settings.sql
-- Move the Fiserv Prologue (SQL Server) connection from env vars into the single
-- app_settings row so an admin can configure, test, and enable/disable it from
-- the UI without a redeploy.
--
-- Unlike the Entra SSO config (all non-secret), the Prologue connection includes
-- a SQL Server password. It is stored ENCRYPTED at rest — AES-256-GCM with a key
-- derived from SETTINGS_ENC_KEY (falls back to SESSION_SECRET) — and is never
-- returned to any client (the API exposes only a "password is set" flag).
--
-- Idempotent: re-runnable. Defaults match the previous env defaults; host /
-- database / user / password start empty and `prologue_enabled` starts false, so
-- the integration stays OFF until an admin configures it. Any deployment that had
-- PROLOGUE_* env vars set must re-enter the connection in the UI.

BEGIN;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS prologue_enabled            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prologue_host               text,
  ADD COLUMN IF NOT EXISTS prologue_port               integer NOT NULL DEFAULT 1433,
  ADD COLUMN IF NOT EXISTS prologue_database           text,
  ADD COLUMN IF NOT EXISTS prologue_user               text,
  ADD COLUMN IF NOT EXISTS prologue_password           text,
  ADD COLUMN IF NOT EXISTS prologue_encrypt            boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prologue_trust_server_cert  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prologue_company_id         text NOT NULL DEFAULT '01',
  ADD COLUMN IF NOT EXISTS prologue_default_account    text NOT NULL DEFAULT '01886910800005',
  ADD COLUMN IF NOT EXISTS prologue_source_user        text NOT NULL DEFAULT 'TANVI';

COMMENT ON COLUMN app_settings.prologue_enabled IS
  'When true (and host/database/user are set), invoice approval stages an unposted AP transaction in Fiserv Prologue.';
COMMENT ON COLUMN app_settings.prologue_password IS
  'AES-256-GCM encrypted at rest (enc:v1: prefix), key from SETTINGS_ENC_KEY. Never returned to clients.';
COMMENT ON COLUMN app_settings.prologue_encrypt IS
  'TLS to SQL Server (mssql "encrypt"). True by default.';
COMMENT ON COLUMN app_settings.prologue_trust_server_cert IS
  'Accept a self-signed SQL Server certificate. Only for a trusted network.';

COMMIT;
