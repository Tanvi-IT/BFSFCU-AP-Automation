-- Supplemental documents linked to an invoice.
--
-- The legacy build merged supplemental PDFs into the invoice's single blob and
-- only kept a count (invoices.supplemental_pdf_count). That merge was never
-- ported. This stores each attachment as its own blob instead, so the originals
-- are preserved and can be viewed or removed individually, and it works for any
-- file type rather than PDF only.
--
-- invoices.supplemental_pdf_count / last_supplemental_added_at are kept in sync
-- by the repository so existing readers still show the right number.

CREATE TABLE IF NOT EXISTS invoice_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  blob_path         text NOT NULL,
  original_filename text NOT NULL,
  content_type      text NOT NULL,
  bytes             integer NOT NULL,
  -- The account that attached it. SET NULL rather than CASCADE: removing a user
  -- must not delete the document history of an invoice.
  uploaded_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_attachments_invoice_idx
  ON invoice_attachments (invoice_id, created_at DESC);
