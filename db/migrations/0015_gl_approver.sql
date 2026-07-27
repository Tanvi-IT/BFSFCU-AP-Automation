-- 0015_gl_approver.sql
-- Split invoice coding into two distinct fields.
--
-- The review queues used to show a single ambiguous "GL (Approver)" field
-- (stored in `gl_code`) plus a free-text Department. Product now wants two
-- explicit fields and no Department:
--   * gl_code     -> the GL Account: a 14-digit account number (dashes allowed).
--   * gl_approver -> the approver's name (free text).
-- `gl_code` is reused as the account number; `gl_approver` is added here.
-- `department_name`/`department_id` are left in place (no longer shown in the
-- review UI) so historical values are preserved.

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gl_approver text;

COMMENT ON COLUMN invoices.gl_code IS
  'GL Account number (up to 14 digits, dashes allowed). Shown in the review queues.';
COMMENT ON COLUMN invoices.gl_approver IS
  'GL Approver name (free text). Shown in the review queues alongside gl_code.';

COMMIT;
