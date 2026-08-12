-- Learned vendor-name aliases.
--
-- When ingest's fuzzy matcher fails to place an invoice on a vendor, the invoice
-- goes to review with vendor_id NULL and the extracted payee text preserved in
-- invoices.vendor_name_snapshot. If a reviewer then manually links that invoice
-- to a vendor, we remember the mapping here: the next invoice that arrives with
-- the same (normalised) payee text is matched straight away, before trigram
-- scoring ever runs. Every human correction thus makes matching better.
--
-- alias_norm is the lookup key — the payee text lowercased with punctuation
-- collapsed to single spaces (see normalizeVendorName in
-- shared/pipeline/vendorAlias.ts; capture and lookup MUST use the same function).
-- It is UNIQUE: one payee spelling maps to exactly one vendor, and a later,
-- different human decision overwrites the earlier one (the upsert on capture).

CREATE TABLE IF NOT EXISTS vendor_name_aliases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalised extracted payee text; the match key.
  alias_norm        text NOT NULL,
  -- The extracted text exactly as it was read off the document, for display/audit.
  alias_raw         text NOT NULL,
  vendor_id         uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  -- Who taught us this mapping, and from which invoice. SET NULL rather than
  -- CASCADE: removing a user or invoice must not forget the learned alias.
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One vendor per normalised spelling; also the conflict target for the upsert.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_name_aliases_norm_key
  ON vendor_name_aliases (alias_norm);
