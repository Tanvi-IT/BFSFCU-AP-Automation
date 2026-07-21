-- 0005_departments.sql
-- Department lookup, used by the review queues for GL coding.
--
-- Ported from the original `erp_departments` table, minus tenant_id. The wider
-- ERP master-data subsystem (vendors, GL accounts, cost centres, tax codes,
-- payment terms) is not ported yet — departments are here because the Low and
-- High Confidence queues depend on them directly.

BEGIN;

CREATE TABLE IF NOT EXISTS erp_departments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_department_id text        NOT NULL,
  name              text        NOT NULL,
  raw_payload       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_departments_erp_id_ux UNIQUE (erp_department_id)
);

CREATE INDEX IF NOT EXISTS erp_departments_name_idx ON erp_departments (lower(name));

DROP TRIGGER IF EXISTS erp_departments_set_updated_at ON erp_departments;
CREATE TRIGGER erp_departments_set_updated_at
  BEFORE UPDATE ON erp_departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Now that the table exists, point invoices at it.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_department_id_fkey;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES erp_departments (id) ON DELETE SET NULL;

-- department_name (added in 0003) is superseded by the lookup table. Kept for
-- now so nothing breaks mid-migration; drop it once no code reads it.
COMMENT ON COLUMN invoices.department_name IS
  'DEPRECATED — superseded by department_id -> erp_departments. Drop once unused.';

COMMIT;
