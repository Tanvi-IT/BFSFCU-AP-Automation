-- 0006_settings.sql
-- Application settings, API keys, webhooks and auto-approval rules.
--
-- Single-tenant: settings live in one row rather than one row per tenant.
-- Secrets (AI provider keys, webhook signing secrets) are NOT stored here —
-- they belong in Key Vault. Only non-secret configuration lives in the database.

BEGIN;

-- ---------------------------------------------------------------------------
-- Application settings — exactly one row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id                          boolean PRIMARY KEY DEFAULT true,

  -- security
  session_timeout_minutes     integer NOT NULL DEFAULT 60,
  require_mfa                 boolean NOT NULL DEFAULT false,
  ip_allowlist                text[]  NOT NULL DEFAULT '{}',
  password_policy             jsonb   NOT NULL DEFAULT '{}'::jsonb,

  -- AI provider (endpoints only; credentials come from Key Vault / Managed Identity)
  ai_provider                 text    NOT NULL DEFAULT 'azure_openai',
  azure_doc_intel_endpoint    text,
  azure_openai_endpoint       text,
  azure_openai_deployment     text,
  azure_openai_api_version    text,

  -- automation
  auto_approve_high_confidence boolean NOT NULL DEFAULT false,
  require_new_vendor_review    boolean NOT NULL DEFAULT true,
  confidence_threshold         numeric NOT NULL DEFAULT 0.7,
  max_auto_approve_amount      numeric,
  require_vendor_active        boolean NOT NULL DEFAULT true,
  require_bank_verified        boolean NOT NULL DEFAULT false,
  require_no_alerts            boolean NOT NULL DEFAULT true,

  -- ingestion
  enable_ingestion_logging     boolean NOT NULL DEFAULT true,
  fiscal_year_start            integer NOT NULL DEFAULT 1,
  timezone                     text    NOT NULL DEFAULT 'America/New_York',

  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single_row CHECK (id)
);

INSERT INTO app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS app_settings_set_updated_at ON app_settings;
CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- API keys — only the hash is stored, never the key itself
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  key_hash     text        NOT NULL,
  key_prefix   text        NOT NULL,
  scopes       text[]      NOT NULL DEFAULT '{}',
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_hash_ux UNIQUE (key_hash)
);

COMMENT ON COLUMN api_keys.key_hash IS
  'SHA-256 of the key. The key itself is shown once at creation and never stored.';

-- ---------------------------------------------------------------------------
-- Webhooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url           text        NOT NULL,
  events        text[]      NOT NULL DEFAULT '{}',
  is_active     boolean     NOT NULL DEFAULT true,
  secret_ref    text,
  last_status   integer,
  last_sent_at  timestamptz,
  failure_count integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN webhook_endpoints.secret_ref IS
  'Key Vault reference for the signing secret. The secret is never stored here.';

DROP TRIGGER IF EXISTS webhook_endpoints_set_updated_at ON webhook_endpoints;
CREATE TRIGGER webhook_endpoints_set_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-approval rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_approval_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  vendor_id           uuid REFERENCES vendors (id) ON DELETE CASCADE,
  max_amount          numeric,
  confidence_threshold numeric,
  require_vendor_active boolean   NOT NULL DEFAULT true,
  require_bank_verified boolean   NOT NULL DEFAULT false,
  require_no_alerts     boolean   NOT NULL DEFAULT true,
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS auto_approval_rules_set_updated_at ON auto_approval_rules;
CREATE TRIGGER auto_approval_rules_set_updated_at
  BEFORE UPDATE ON auto_approval_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Email ingestion log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_ingestion_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email  text,
  subject       text,
  attachments   integer NOT NULL DEFAULT 0,
  status        text    NOT NULL DEFAULT 'received',
  error_message text,
  invoice_id    uuid REFERENCES invoices (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_ingestion_created_idx ON email_ingestion_logs (created_at DESC);

COMMIT;
