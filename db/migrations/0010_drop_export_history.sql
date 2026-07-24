-- Drop the export history table.
--
-- Exports are not audited. The only export left in the product is "Export to
-- Excel" on the Approved page, which streams a file straight to the browser and
-- records nothing; the Export History page and its GET/POST endpoints are gone.
--
-- Nothing ever wrote to this table in the Azure build — the POST endpoint that
-- would have populated it had no caller — so this drops an empty table.

DROP TABLE IF EXISTS erp_export_history;
