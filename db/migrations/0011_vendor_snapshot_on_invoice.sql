-- Settle an invoice's vendor at validation time.
--
-- The vendor check belongs to the moment an invoice is processed. After that,
-- replacing or re-uploading the vendor list must not change or damage invoices
-- that were already validated against the list as it stood then.
--
-- Two changes make that true:
--
-- 1. `vendor_name_snapshot` records the vendor's name on the invoice itself.
--    Until now the name came only from a live JOIN on vendors, so removing a
--    vendor erased the payee from every invoice that referenced it.
--
-- 2. The foreign key becomes ON DELETE SET NULL. It was RESTRICT, which made a
--    vendor that had ever been invoiced permanently undeletable and blocked any
--    attempt to replace the vendor list. The invoice now keeps the snapshot and
--    simply loses the live link.
--
-- Deliberately NOT null-constrained: invoices that failed vendor matching have
-- no vendor at all, and that is a legitimate state (they sit in Exceptions).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS vendor_name_snapshot text;

-- Backfill from the current link so existing invoices keep their payee once the
-- vendor rows are replaced.
UPDATE invoices i
   SET vendor_name_snapshot = v.name
  FROM vendors v
 WHERE v.id = i.vendor_id
   AND i.vendor_name_snapshot IS NULL;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_vendor_id_fkey;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
