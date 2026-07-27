/**
 * Invoice data access. Routes and the worker use these functions rather than
 * writing SQL inline.
 */

import { query, queryOne } from '../db';

/** Matches the original schema. 'queued'/'processing' cover the async window. */
export type InvoiceStatus =
  | 'ingested'
  | 'queued'
  | 'processing'
  | 'draft'
  | 'validated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'exception'
  | 'exported'
  | 'archived';

export type InvoiceSource = 'manual_upload' | 'email_ingest' | 'api_ingest';

export interface InvoiceRow {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_status: string | null;
  vendor_bank_verified: boolean | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string;
  total_amount: string;
  status: InvoiceStatus;
  source: InvoiceSource;
  risk_level: 'low' | 'medium' | 'high' | null;
  confidence_score: string | null;
  variation_flags: string[];
  blob_path: string;
  original_filename: string | null;
  file_hash: string;
  duplicate_of: string | null;
  duplicate_type: string | null;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Returned when the same file has already been uploaded. */
export interface ExistingInvoice {
  id: string;
  status: InvoiceStatus;
}

export async function findByFileHash(fileHash: string): Promise<ExistingInvoice | undefined> {
  return queryOne<ExistingInvoice>(
    `SELECT id, status FROM invoices WHERE file_hash = $1`,
    [fileHash]
  );
}

export interface CreateQueuedInvoice {
  blobPath: string;
  fileHash: string;
  originalFilename: string;
  source: InvoiceSource;
  submittedBy: string;
}

/**
 * Insert an invoice in `queued` state.
 *
 * ON CONFLICT makes this idempotent: a concurrent duplicate upload returns the
 * existing row instead of raising, so two racing requests cannot create two
 * invoices for the same document.
 */
export async function createQueued(
  input: CreateQueuedInvoice
): Promise<{ id: string; created: boolean }> {
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO invoices (blob_path, file_hash, original_filename, source, submitted_by, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')
     ON CONFLICT (file_hash) DO NOTHING
     RETURNING id`,
    [input.blobPath, input.fileHash, input.originalFilename, input.source, input.submittedBy]
  );

  if (inserted) return { id: inserted.id, created: true };

  const existing = await findByFileHash(input.fileHash);
  if (!existing) {
    throw new Error('Insert conflicted but no existing invoice was found');
  }
  return { id: existing.id, created: false };
}

export async function setStatus(
  id: string,
  status: InvoiceStatus,
  error?: string
): Promise<void> {
  await query(
    `UPDATE invoices
        SET status = $2,
            processing_error = $3
      WHERE id = $1`,
    [id, status, error ?? null]
  );
}

/**
 * A processing failure sends the invoice to Low Confidence for review, not
 * Exception — Exception is entered only by a reviewer's action. The invoice
 * carries the error and an 'extraction_failed' flag so the review queue shows
 * why, and a reviewer can then escalate, decline, or (if it was transient)
 * simply approve.
 */
export async function markProcessingFailed(id: string, error: string): Promise<void> {
  await query(
    `UPDATE invoices
        SET status = 'validated',
            risk_level = 'high',
            processing_error = $2,
            variation_flags = CASE
              WHEN 'extraction_failed' = ANY (variation_flags) THEN variation_flags
              ELSE array_append(variation_flags, 'extraction_failed')
            END
      WHERE id = $1`,
    [id, error]
  );
}

/**
 * Timestamps a date range may filter and sort on.
 *
 * This is a whitelist, and it has to be: Postgres cannot parameterise a column
 * name, so the value is interpolated into the SQL text. Never widen this to an
 * arbitrary caller-supplied string.
 */
export const DATE_FIELDS = ['created_at', 'updated_at', 'approved_at'] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export interface ListFilters {
  status?: InvoiceStatus;
  search?: string;
  /** Inclusive `YYYY-MM-DD` bounds, applied to `dateField`. */
  dateFrom?: string;
  dateTo?: string;
  /** Which timestamp the range filters and orders by. Defaults to `created_at`. */
  dateField?: DateField;
  /** Sort direction on `dateField`. Defaults to `desc` (newest first). */
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export async function list(filters: ListFilters): Promise<InvoiceRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    where.push(`i.status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = `$${params.length}`;
    // `decline_reason` is included so the Declined queue can be searched by why
    // an invoice was declined, which is how that history is usually recalled.
    where.push(
      `(i.invoice_number ILIKE ${p} OR v.name ILIKE ${p} OR i.decline_reason ILIKE ${p})`
    );
  }

  // Re-check the whitelist here rather than trusting the caller's type: this
  // string is concatenated into SQL.
  const dateField: DateField =
    filters.dateField && DATE_FIELDS.includes(filters.dateField)
      ? filters.dateField
      : 'created_at';

  // Only two literal values are ever concatenated, chosen from the caller's
  // enum — never an arbitrary string.
  const order: 'ASC' | 'DESC' = filters.order === 'asc' ? 'ASC' : 'DESC';

  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    where.push(`i.${dateField} >= $${params.length}::date`);
  }

  if (filters.dateTo) {
    params.push(filters.dateTo);
    // Half-open upper bound. `<= $n::date` would compare against midnight and
    // silently drop every row recorded later on the end day itself.
    where.push(`i.${dateField} < ($${params.length}::date + INTERVAL '1 day')`);
  }

  params.push(filters.limit, filters.offset);

  return query<InvoiceRow>(
    `SELECT i.*, COALESCE(i.raw_file_path, i.blob_path) AS raw_file_path,
              -- Fall back to the name captured when the invoice was validated:
              -- the live vendor may have been removed by a later list upload,
              -- which must not erase who this invoice was for.
              COALESCE(v.name, i.vendor_name_snapshot) AS vendor_name,
              v.status AS vendor_status,
              v.bank_verified AS vendor_bank_verified
       FROM invoices i
       LEFT JOIN vendors v ON v.id = i.vendor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY i.${dateField} ${order} NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

export async function getById(id: string): Promise<InvoiceRow | undefined> {
  return queryOne<InvoiceRow>(
    `SELECT i.*, COALESCE(i.raw_file_path, i.blob_path) AS raw_file_path,
              -- Fall back to the name captured when the invoice was validated:
              -- the live vendor may have been removed by a later list upload,
              -- which must not erase who this invoice was for.
              COALESCE(v.name, i.vendor_name_snapshot) AS vendor_name,
              v.status AS vendor_status,
              v.bank_verified AS vendor_bank_verified
       FROM invoices i
       LEFT JOIN vendors v ON v.id = i.vendor_id
      WHERE i.id = $1`,
    [id]
  );
}

export async function countByStatus(): Promise<Record<string, number>> {
  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM invoices GROUP BY status`
  );
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

export interface LineItemRow {
  id: string;
  invoice_id: string;
  line_number: number | null;
  description: string | null;
  quantity: string | null;
  unit_price: string | null;
  line_total: string | null;
  gl_code: string | null;
}

export interface AnomalyRow {
  id: string;
  invoice_id: string;
  code: string;
  severity: string;
  message: string | null;
  resolved_at: string | null;
  created_at: string;
}

export async function lineItems(invoiceId: string): Promise<LineItemRow[]> {
  return query<LineItemRow>(
    `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY line_number NULLS LAST, id`,
    [invoiceId]
  );
}

export async function anomalies(invoiceId: string): Promise<AnomalyRow[]> {
  return query<AnomalyRow>(
    `SELECT * FROM invoice_anomalies WHERE invoice_id = $1 ORDER BY created_at`,
    [invoiceId]
  );
}
