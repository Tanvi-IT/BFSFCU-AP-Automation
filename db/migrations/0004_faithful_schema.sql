-- 0004_faithful_schema.sql
--
-- Aligns the schema with the ORIGINAL Supabase tables so the existing UI works
-- unchanged. Earlier migrations were written from the architecture document and
-- were missing ~17 columns the application actually stores.
--
-- Rule for this migration: match the original exactly. No redesign, no renames,
-- no "improvements". The only deliberate omissions are multi-tenancy (tenant_id)
-- and row-level security, which do not apply to a single-tenant system.

BEGIN;

-- ---------------------------------------------------------------------------
-- Status enum — restore the original values
--
-- Earlier I renamed 'rejected' to 'declined'. That was churn: the UI uses
-- 'rejected' throughout. Reverted here so no frontend change is needed.
-- ---------------------------------------------------------------------------
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'ingested';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'exported';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'archived';

COMMIT;

BEGIN;

-- Original source values were 'manual_upload', 'email', 'api'.
ALTER TYPE invoice_source ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE invoice_source ADD VALUE IF NOT EXISTS 'api';

COMMIT;

BEGIN;

-- ---------------------------------------------------------------------------
-- Invoices — every column the application reads or writes
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
  -- scoring / risk
  ADD COLUMN IF NOT EXISTS anomaly_score              numeric(5, 4) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS variation_score            numeric       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_probability          numeric,
  ADD COLUMN IF NOT EXISTS contract_risk_score        integer,

  -- reviewer feedback (the UI reads checker_comment, not decline_reason)
  ADD COLUMN IF NOT EXISTS checker_comment            text,

  -- ingestion provenance
  ADD COLUMN IF NOT EXISTS sender_email               text,
  ADD COLUMN IF NOT EXISTS raw_file_path              text,
  ADD COLUMN IF NOT EXISTS sanitized_filename         text,
  ADD COLUMN IF NOT EXISTS system_filename            text,
  ADD COLUMN IF NOT EXISTS filename_sanitized         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_type              text,

  -- due-date inference
  ADD COLUMN IF NOT EXISTS due_date_defaulted         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_date_default_source    text,
  ADD COLUMN IF NOT EXISTS source_transaction_date    text,

  -- tax-exemption flagging
  ADD COLUMN IF NOT EXISTS tax_flagged                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_flag_reason            text,

  -- unreadable / non-invoice documents
  ADD COLUMN IF NOT EXISTS bad_file_flag              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bad_file_reason            text,

  -- supplemental attachments
  ADD COLUMN IF NOT EXISTS supplemental_pdf_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_supplemental_added_at timestamptz,

  -- payment details captured from the document
  ADD COLUMN IF NOT EXISTS ach_routing_number         text,
  ADD COLUMN IF NOT EXISTS ach_account_number         text,

  -- AI provenance (audit: which model produced each field)
  ADD COLUMN IF NOT EXISTS extraction_provider        text,
  ADD COLUMN IF NOT EXISTS reasoning_provider         text,
  ADD COLUMN IF NOT EXISTS raw_extraction_json        jsonb,
  ADD COLUMN IF NOT EXISTS normalized_extraction_json jsonb,

  -- auto-approval
  ADD COLUMN IF NOT EXISTS auto_routed                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_approval_status       text,
  ADD COLUMN IF NOT EXISTS auto_approval_reason       text,

  -- GL coding (department_id was a FK into erp_departments; kept as uuid so the
  -- ERP master-data tables can be introduced later without another rename)
  ADD COLUMN IF NOT EXISTS department_id              uuid,

  -- ERP export lifecycle
  ADD COLUMN IF NOT EXISTS erp_status                 text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS erp_reference_id           text,
  ADD COLUMN IF NOT EXISTS erp_last_synced_at         timestamptz,
  ADD COLUMN IF NOT EXISTS exported_at                timestamptz,
  ADD COLUMN IF NOT EXISTS export_batch_id            uuid,
  ADD COLUMN IF NOT EXISTS push_status                text,
  ADD COLUMN IF NOT EXISTS push_attempts              integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_last_attempt_at       timestamptz,
  ADD COLUMN IF NOT EXISTS push_last_error            text,

  ADD COLUMN IF NOT EXISTS immutable                  boolean NOT NULL DEFAULT false;

-- Backfill raw_file_path from the column the new pipeline writes, so both names
-- resolve to the same document.
UPDATE invoices SET raw_file_path = blob_path WHERE raw_file_path IS NULL;

CREATE INDEX IF NOT EXISTS invoices_erp_status_idx ON invoices (erp_status)
  WHERE erp_status IS DISTINCT FROM 'none';

-- ---------------------------------------------------------------------------
-- Vendors — columns the UI reads
-- ---------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS ach_routing_number text,
  ADD COLUMN IF NOT EXISTS ach_account_number text,
  ADD COLUMN IF NOT EXISTS vendor_risk_score  numeric,
  ADD COLUMN IF NOT EXISTS contact_email      text,
  ADD COLUMN IF NOT EXISTS address            text;

-- ---------------------------------------------------------------------------
-- Line items — GL coding per line
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS department_id uuid;

COMMIT;
