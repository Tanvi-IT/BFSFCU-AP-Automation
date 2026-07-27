-- Allow duplicate invoice uploads.
--
-- Re-uploading the same document previously failed on the unique file_hash
-- constraint. Duplicates are now intentionally permitted: each upload creates a
-- new invoice and the pipeline's duplicate check decides the outcome —
--   * an earlier copy still in review (low/high confidence) is superseded and
--     moved to Exceptions, and the new upload takes its place; or
--   * when an earlier copy is already approved, the new upload goes to
--     Exceptions (an approval must never be silently reversed).
--
-- Drop the uniqueness but keep a plain index so file_hash stays queryable.
-- Idempotent: safe to re-run.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_file_hash_ux;
CREATE INDEX IF NOT EXISTS invoices_file_hash_idx ON invoices (file_hash);
