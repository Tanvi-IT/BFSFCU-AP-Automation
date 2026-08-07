/* =============================================================================
   Tanvi IT -> Prologue Financials  AP Invoice Integration  (SQL Server)
   Client: BankFund FCU

   Two stored procedures the AP app calls on invoice approval to STAGE an
   unposted AP transaction. Minimal footprint: they write only the four tables
   that are structurally required to create a valid, postable AP transaction.

     WRITTEN
       am_table_next_key       (UPDATE)  key allocation for co_batch + ap_transaction
       co_batch                (INSERT)  the batch the header lives in (once/day)
       ap_transaction          (INSERT)  the AP header, unposted (status 'U')
       ap_transaction_detail   (INSERT)  the GL distribution line(s)

     READ ONLY (validation)
       ap_vendor, gl_account, co_batch, co_transaction_config

   Posting is left to Prologue's own posting engine. Deploy these to the target
   Prologue database; the app login needs EXECUTE on both.
   ============================================================================= */

-- =============================================================================
-- 1. Find or create today's unposted batch for Tanvi invoices.
-- =============================================================================
CREATE OR ALTER PROCEDURE dbo.tanvi_get_batchid_4today
    @company_id     varchar(16)  = '01',
    @approver_name  varchar(255),          -- app user who approved -> co_batch.approval_user_id
    @return         int OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @return = NULL;

    DECLARE @description varchar(40) =
        'Tanvi AP Invoices ' + CONVERT(varchar(10), GETDATE(), 120)
        + ' (' + LEFT(DATENAME(weekday, GETDATE()), 3) + ')';

    -- reuse today's batch only if still awaiting posting
    SELECT @return = batch_id
    FROM dbo.co_batch
    WHERE post_group_name = 'TANVI'
      AND batch_status    = 'A'
      AND post_date_time IS NULL
      AND [description]   = @description;

    IF @return IS NULL
    BEGIN
        BEGIN TRAN;

            DECLARE @k TABLE (next_key int);

            -- atomic take-and-increment of the key
            UPDATE dbo.am_table_next_key
               SET next_key = next_key + 1
            OUTPUT deleted.next_key INTO @k
            WHERE [name] = 'co_batch';

            DECLARE @batch_id int = (SELECT next_key FROM @k);

            DECLARE @post_gl_detail_type char(1) =
                (SELECT post_gl_detail_type FROM dbo.co_transaction_config
                 WHERE transaction_type_id = 'APTRN');

            -- batch_status 'A' = pre-approved; posting is done by Prologue's engine
            INSERT INTO dbo.co_batch
                (batch_id, company_id, post_group_name, post_gl_detail_type,
                 transaction_type_id, batch_status, batch_date, frequency,
                 loading_count, control_transaction_count,
                 approval_date_time, approval_user_id, [description])
            VALUES
                (@batch_id, @company_id, 'TANVI', ISNULL(@post_gl_detail_type,'0'),
                 'APTRN', 'A', CONVERT(varchar(10), GETDATE(), 120), 'A',
                 0, 0,
                 GETDATE(), LEFT(@approver_name,255), @description);

        COMMIT;
        SET @return = @batch_id;
    END
END
GO

-- =============================================================================
-- 2. Insert one AP invoice (header + GL line(s)) into the batch.
--    @gl_detail_json example:
--    [{"account_id":"01226310000850","amount":589.45,"description":"optional"}]
-- =============================================================================
CREATE OR ALTER PROCEDURE dbo.tanvi_insert_ap_invoice
    @batch_id                 int,
    @vendor_id                varchar(16),
    @vendor_document_number   varchar(32),
    @vendor_document_date     date,
    @due_date                 date,
    @description              varchar(40),
    @detail_total_amount      decimal(14,2),
    @gl_detail_json           nvarchar(max),
    @transaction_type_id      varchar(16) = NULL,
    @company_id               varchar(16) = '01',
    -- Default trade-discount / misc / freight posting accounts. The app no longer
    -- sends these, so the proc owns them. Change this value to BankFund's real
    -- default account before go-live ('01886910800005' is sample data).
    @trade_discount_account   varchar(32) = '01886910800005',
    @misc_account             varchar(32) = '01886910800005',
    @freight_account          varchar(32) = '01886910800005',
    @source_user              varchar(255) = 'TANVI',
    @return_trans_id          int OUTPUT,
    @return_error             varchar(500) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @return_trans_id = NULL;
    SET @return_error    = NULL;

    BEGIN TRY
        ------------------------------------------------------------------
        -- Validation (read-only, before any write)
        ------------------------------------------------------------------
        DECLARE @purchasing_address_id int,
                @tax_1099_type         char(1),
                @vendor_status         char(1),
                @vendor_name           varchar(50);

        SELECT @purchasing_address_id = purchasing_address_id,
               @tax_1099_type         = tax_1099_type,
               @vendor_status         = [status],
               @vendor_name           = LTRIM(RTRIM([name]))
        FROM dbo.ap_vendor
        WHERE vendor_id = @vendor_id;

        IF @vendor_status IS NULL
        BEGIN
            SET @return_error = 'Vendor ' + @vendor_id + ' does not exist in Prologue.';
            RETURN;
        END

        IF @vendor_status <> 'A'
        BEGIN
            SET @return_error = 'Vendor ' + @vendor_id + ' is not Active (status='
                                + @vendor_status + ').';
            RETURN;
        END

        -- duplicate invoice guard (vendor + invoice number)
        IF EXISTS (SELECT 1 FROM dbo.ap_transaction
                   WHERE vendor_id = @vendor_id
                     AND vendor_document_number = @vendor_document_number)
        BEGIN
            SET @return_error = 'Duplicate: invoice ' + @vendor_document_number
                                + ' already exists for vendor ' + @vendor_id + '.';
            RETURN;
        END

        -- batch must exist, be approved, and not yet posted
        IF NOT EXISTS (SELECT 1 FROM dbo.co_batch
                       WHERE batch_id = @batch_id
                         AND batch_status = 'A'
                         AND post_date_time IS NULL)
        BEGIN
            SET @return_error = 'Batch ' + LTRIM(STR(@batch_id))
                                + ' does not exist, is not approved, or is already posted.';
            RETURN;
        END

        -- shred + validate GL detail
        DECLARE @detail TABLE (
            line_number  smallint IDENTITY(1,1),
            account_id   varchar(32) NOT NULL,
            amount       decimal(14,2) NOT NULL,
            [description] varchar(255) NULL
        );

        INSERT INTO @detail (account_id, amount, [description])
        SELECT LTRIM(RTRIM(j.account_id)),
               j.amount,
               COALESCE(j.[description], @vendor_name + ' / ' + @vendor_document_number)
        FROM OPENJSON(@gl_detail_json)
             WITH (account_id   varchar(32)   '$.account_id',
                   amount       decimal(14,2) '$.amount',
                   [description] varchar(255) '$.description') AS j;

        IF NOT EXISTS (SELECT 1 FROM @detail)
        BEGIN
            SET @return_error = 'No GL detail lines supplied.';
            RETURN;
        END

        -- reject invalid GL accounts
        DECLARE @bad_account varchar(32) =
            (SELECT TOP 1 d.account_id FROM @detail d
             WHERE NOT EXISTS (SELECT 1 FROM dbo.gl_account g
                               WHERE g.account_id = d.account_id));
        IF @bad_account IS NOT NULL
        BEGIN
            SET @return_error = 'GL account ' + @bad_account + ' does not exist.';
            RETURN;
        END

        -- detail must sum exactly to header
        DECLARE @detail_sum decimal(14,2) = (SELECT SUM(amount) FROM @detail);
        IF @detail_sum <> @detail_total_amount
        BEGIN
            SET @return_error = 'Detail sum ' + FORMAT(@detail_sum, '0.00')
                                + ' <> header total ' + FORMAT(@detail_total_amount, '0.00') + '.';
            RETURN;
        END

        IF @trade_discount_account IS NULL OR @misc_account IS NULL OR @freight_account IS NULL
        BEGIN
            SET @return_error = 'trade_discount/misc/freight default accounts not configured.';
            RETURN;
        END

        ------------------------------------------------------------------
        -- Writes (one transaction)
        ------------------------------------------------------------------
        BEGIN TRAN;

            DECLARE @k TABLE (next_key int);
            DECLARE @transaction_id int;

            UPDATE dbo.am_table_next_key
               SET next_key = next_key + 1
            OUTPUT deleted.next_key INTO @k
            WHERE [name] = 'ap_transaction';
            SET @transaction_id = (SELECT next_key FROM @k);

            -- header: transaction_status 'U' = unposted
            INSERT INTO dbo.ap_transaction
                (transaction_id, company_id, transaction_type_id, batch_id,
                 transaction_status, transaction_date, gl_date,
                 vendor_id, exchange_rate,
                 purchasing_address_id, shipping_address_id,
                 due_date, vendor_document_number, vendor_document_date, [description],
                 trade_discount_account_id, misc_account_id, freight_account_id,
                 tax_1099_type, tax_reporting_amount,
                 detail_total_amount,
                 trade_discount_amount, trade_discount_percent,
                 misc_amount, freight_amount, tax_amount,
                 misc_taxable, freight_taxable,
                 backup_withholding_amount, backup_withholding_rate,
                 edit_date_time, edit_user_id)
            VALUES
                (@transaction_id, @company_id, @transaction_type_id, @batch_id,
                 'U', CONVERT(varchar(10), GETDATE(), 120), CONVERT(varchar(10), GETDATE(), 120),
                 @vendor_id, 1.000000,
                 @purchasing_address_id, 'MAIN',
                 @due_date, @vendor_document_number, @vendor_document_date, @description,
                 @trade_discount_account, @misc_account, @freight_account,
                 ISNULL(@tax_1099_type, 'A'),
                 CASE WHEN @tax_1099_type IN ('H','L') THEN @detail_total_amount ELSE 0.00 END,
                 @detail_total_amount,
                 0.00, 0.0000,
                 0.00, 0.00, 0.00,
                 'T', 'T',
                 0.00, 0.0000,
                 GETDATE(), @source_user);

            -- GL distribution lines
            INSERT INTO dbo.ap_transaction_detail
                (transaction_id, line_number, account_id, amount, taxable, [description])
            SELECT @transaction_id, line_number, account_id, amount, 'F', [description]
            FROM @detail
            ORDER BY line_number;

        COMMIT;

        SET @return_trans_id = @transaction_id;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK;
        SET @return_trans_id = NULL;
        SET @return_error = LEFT('Inv# ' + ISNULL(@vendor_document_number, '?')
                                 + ': ' + ERROR_MESSAGE(), 500);
    END CATCH
END
GO
