-- 0007_erp.sql
-- ERP integration subsystem: connectors, field mappings, master data and
-- export history. Ported from the original schema minus tenant_id.
--
-- `erp_departments` already exists (migration 0005).

BEGIN;

-- ---------------------------------------------------------------------------
-- Connectors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_connectors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  erp_system      text        NOT NULL,
  delivery_method text        NOT NULL DEFAULT 'manual',
  is_active       boolean     NOT NULL DEFAULT true,
  -- Connection settings hold endpoints only; credentials live in Key Vault
  -- and are referenced by name.
  settings        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  credentials_ref text,
  last_sync_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN erp_connectors.credentials_ref IS
  'Key Vault reference. SFTP/API credentials are never stored in the database.';

-- ---------------------------------------------------------------------------
-- Field mappings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_field_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id  uuid REFERENCES erp_connectors (id) ON DELETE CASCADE,
  source_field  text        NOT NULL,
  target_field  text        NOT NULL,
  transform     text,
  is_required   boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_mappings_connector_idx ON erp_field_mappings (connector_id);

-- ---------------------------------------------------------------------------
-- Master data mirrors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_vendors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_vendor_id  text NOT NULL,
  name           text NOT NULL,
  raw_payload    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_vendors_ux UNIQUE (erp_vendor_id)
);

CREATE TABLE IF NOT EXISTS erp_gl_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_account_id  text NOT NULL,
  code            text NOT NULL,
  name            text NOT NULL,
  raw_payload     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_gl_accounts_ux UNIQUE (erp_account_id)
);

CREATE TABLE IF NOT EXISTS erp_cost_centers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_cost_center_id  text NOT NULL,
  name                text NOT NULL,
  raw_payload         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_cost_centers_ux UNIQUE (erp_cost_center_id)
);

CREATE TABLE IF NOT EXISTS erp_tax_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_tax_code_id text NOT NULL,
  code            text NOT NULL,
  rate            numeric,
  raw_payload     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_tax_codes_ux UNIQUE (erp_tax_code_id)
);

CREATE TABLE IF NOT EXISTS erp_payment_terms (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_payment_term_id  text NOT NULL,
  name                 text NOT NULL,
  days                 integer,
  raw_payload          jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_payment_terms_ux UNIQUE (erp_payment_term_id)
);

CREATE TABLE IF NOT EXISTS erp_master_sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,
  records      integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'completed',
  error_message text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Export history & reconciliation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_export_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_system      text        NOT NULL,
  export_format   text        NOT NULL,
  delivery_method text        NOT NULL DEFAULT 'manual',
  status          text        NOT NULL DEFAULT 'completed',
  invoice_ids     uuid[]      NOT NULL DEFAULT '{}',
  invoice_count   integer     NOT NULL DEFAULT 0,
  file_path       text,
  error_message   text,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_export_history_created_idx
  ON erp_export_history (created_at DESC);

CREATE TABLE IF NOT EXISTS erp_reconciliation_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid REFERENCES invoices (id) ON DELETE SET NULL,
  event_type   text        NOT NULL,
  status       text        NOT NULL,
  reference_id text,
  message      text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_recon_created_idx
  ON erp_reconciliation_events (created_at DESC);

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'erp_connectors','erp_field_mappings','erp_vendors','erp_gl_accounts',
    'erp_cost_centers','erp_tax_codes','erp_payment_terms'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END$$;

COMMIT;
