-- 0003_invoice_coding.sql
-- GL coding fields used by the review queues before export.
--
-- The legacy schema had `department_id` pointing at an `erp_departments`
-- lookup table (part of the ERP master-data subsystem). That subsystem is not
-- being ported yet, so department is stored as text here. If ERP master data
-- is brought across later, migrate this column to a foreign key then — the
-- text value is the department name, so the mapping is direct.

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gl_code         text,
  ADD COLUMN IF NOT EXISTS department_name text,
  -- Date the invoice was posted for payment, in the organisation's timezone.
  ADD COLUMN IF NOT EXISTS transaction_date date;

COMMENT ON COLUMN invoices.department_name IS
  'Department as free text. Replaces the legacy department_id FK into erp_departments; becomes a FK again if ERP master data is ported.';

CREATE INDEX IF NOT EXISTS invoices_gl_code_idx
  ON invoices (gl_code) WHERE gl_code IS NOT NULL;

COMMIT;
