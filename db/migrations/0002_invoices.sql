-- 0002_invoices.sql
-- Core AP domain: vendors, invoices, line items, anomalies, notes, audit log.
--
-- Single-tenant: no tenant_id anywhere.
-- Two things the old schema lacked are present from the start:
--   * UNIQUE (file_hash)  — idempotency, so a retry can never double-pay
--   * pg_trgm index        — vendor matching in SQL, not by scanning every
--                            vendor into memory and running Levenshtein

BEGIN;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM (
      'queued',      -- accepted, waiting for the worker
      'processing',  -- worker has picked it up
      'validated',   -- low confidence — needs review
      'submitted',   -- high confidence — awaiting approval
      'approved',
      'declined',
      'exception'    -- duplicate, extraction failure, critical anomaly
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_source') THEN
    CREATE TYPE invoice_source AS ENUM ('manual_upload', 'email_ingest', 'api_ingest');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
    CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_status') THEN
    CREATE TYPE vendor_status AS ENUM ('pending_verification', 'active', 'blocked');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text          NOT NULL,
  tax_id         text,
  external_id    text,
  email_domain   text,
  bank_account   text,
  status         vendor_status NOT NULL DEFAULT 'pending_verification',
  bank_verified  boolean       NOT NULL DEFAULT false,
  source         text          NOT NULL DEFAULT 'auto',
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

-- Vendor matching: exact identifiers first, then trigram similarity.
CREATE INDEX IF NOT EXISTS vendors_name_trgm_idx ON vendors USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendors_tax_id_idx    ON vendors (tax_id)       WHERE tax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendors_bank_idx      ON vendors (bank_account) WHERE bank_account IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendors_domain_idx    ON vendors (lower(email_domain)) WHERE email_domain IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vendor_id         uuid REFERENCES vendors (id) ON DELETE RESTRICT,

  invoice_number    text,
  invoice_date      date,
  due_date          date,
  currency          char(3)        NOT NULL DEFAULT 'USD',
  subtotal_amount   numeric(14, 2),
  tax_amount        numeric(14, 2),
  total_amount      numeric(14, 2) NOT NULL DEFAULT 0,

  status            invoice_status NOT NULL DEFAULT 'queued',
  source            invoice_source NOT NULL DEFAULT 'manual_upload',
  risk_level        risk_level,
  confidence_score  numeric(4, 3),
  variation_flags   text[]         NOT NULL DEFAULT '{}',

  -- Storage
  blob_path         text           NOT NULL,
  original_filename text,
  -- SHA-256 of the file. Idempotency key: re-uploading the same bytes is
  -- rejected by the unique constraint rather than creating a second invoice.
  file_hash         text           NOT NULL,

  -- Duplicate detection
  duplicate_of      uuid REFERENCES invoices (id) ON DELETE SET NULL,
  duplicate_type    text,

  -- Workflow
  submitted_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at       timestamptz,
  declined_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  declined_at       timestamptz,
  decline_reason    text,

  -- Processing diagnostics
  processing_error  text,
  extraction_raw    jsonb,
  normalization_raw jsonb,

  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT invoices_file_hash_ux UNIQUE (file_hash)
);

CREATE INDEX IF NOT EXISTS invoices_status_idx  ON invoices (status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_vendor_idx  ON invoices (vendor_id);
CREATE INDEX IF NOT EXISTS invoices_dupe_idx    ON invoices (vendor_id, invoice_number);
CREATE INDEX IF NOT EXISTS invoices_created_idx ON invoices (created_at DESC);

COMMENT ON CONSTRAINT invoices_file_hash_ux ON invoices IS
  'Idempotency. Prevents the same document creating two invoices (duplicate-payment risk) on retry or re-upload.';

-- ---------------------------------------------------------------------------
-- Line items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_number  integer,
  description  text,
  quantity     numeric(14, 4),
  unit_price   numeric(14, 4),
  line_total   numeric(14, 2),
  gl_code      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS line_items_invoice_idx ON invoice_line_items (invoice_id);

-- ---------------------------------------------------------------------------
-- Anomalies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_anomalies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  code        text NOT NULL,
  severity    risk_level NOT NULL DEFAULT 'low',
  message     text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anomalies_invoice_idx ON invoice_anomalies (invoice_id);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_invoice_idx ON invoice_notes (invoice_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid,
  action      text NOT NULL,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_entity_idx  ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at DESC);

-- Immutable: an audit trail that can be edited is not an audit trail.
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- NOTE: audit_logs grows without bound. Partition by month and set a retention
-- policy before go-live.

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS vendors_set_updated_at ON vendors;
CREATE TRIGGER vendors_set_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
