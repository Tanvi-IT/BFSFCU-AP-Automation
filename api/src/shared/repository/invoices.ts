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
 * Duplicates are allowed: re-uploading the same document creates a new invoice,
 * and the pipeline's duplicate check decides what happens (supersede an earlier
 * pending copy, or route the new one to Exceptions when an earlier copy is
 * already approved). File-hash is stored for reference but no longer unique.
 */
export async function createQueued(
  input: CreateQueuedInvoice
): Promise<{ id: string; created: boolean }> {
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO invoices (blob_path, file_hash, original_filename, source, submitted_by, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')
     RETURNING id`,
    [input.blobPath, input.fileHash, input.originalFilename, input.source, input.submittedBy]
  );

  if (!inserted) throw new Error('Failed to create the invoice row');
  return { id: inserted.id, created: true };
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
    // Accept a single status or a comma-separated set (e.g. the audit "In Queue"
    // filter, which spans queued/processing/validated/submitted). Compared as
    // text so a set can be matched with = ANY without per-enum casts.
    const statuses = String(filters.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length > 1) {
      params.push(statuses);
      where.push(`i.status::text = ANY($${params.length})`);
    } else {
      params.push(statuses[0]);
      where.push(`i.status = $${params.length}`);
    }
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const p = `$${params.length}`;
    // Search invoice number, vendor name (both the live vendor and the name
    // captured on the invoice, so unmatched-vendor invoices are still findable),
    // the amount, and the decline reason (`checker_comment` is the column the app
    // actually writes — `decline_reason` is a legacy, unused column).
    where.push(
      `(i.invoice_number ILIKE ${p} OR v.name ILIKE ${p} OR i.vendor_name_snapshot ILIKE ${p} OR i.checker_comment ILIKE ${p} OR i.total_amount::text ILIKE ${p})`
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

export interface VendorCoding {
  gl_code: string | null;
  gl_approver: string | null;
}

// The set of statuses whose coding is trustworthy enough to propagate, best
// first. An APPROVED invoice's coding is the source of truth; a validated or
// submitted one is a good fallback (e.g. right after "apply to all" but before
// anyone has approved). Declined/exception coding is never propagated. The
// ORDER BY prefers approved, then the most recent.
const CODING_SOURCE_ORDER = `
  ORDER BY (a.status = 'approved') DESC,
           a.approved_at DESC NULLS LAST,
           a.updated_at DESC,
           a.created_at DESC
  LIMIT 1`;

/**
 * The GL coding (account + approver) to inherit for a vendor, from that vendor's
 * most recent coded invoice — approved first, then validated/submitted.
 *
 * Matched on vendor id OR the vendor NAME. Name matters because the vendor list
 * is periodically re-uploaded: that removes vendor rows (the FK is ON DELETE SET
 * NULL) while the invoices keep their `vendor_name_snapshot`. Matching on the
 * snapshot name lets the coding survive a vendor-list refresh, which matching on
 * id alone would not.
 */
export async function lastCodingForVendor(
  vendorId: string | null,
  vendorName: string | null,
  excludeInvoiceId: string
): Promise<VendorCoding | undefined> {
  return queryOne<VendorCoding>(
    `SELECT a.gl_code, a.gl_approver
       FROM invoices a
       LEFT JOIN vendors av ON av.id = a.vendor_id
      WHERE a.status IN ('approved', 'validated', 'submitted')
        AND (a.gl_code IS NOT NULL OR a.gl_approver IS NOT NULL)
        AND a.id <> $3
        AND (
              ($1::uuid IS NOT NULL AND a.vendor_id = $1::uuid)
           OR ($2 <> '' AND lower(COALESCE(av.name, a.vendor_name_snapshot, '')) = $2)
            )
     ${CODING_SOURCE_ORDER}`,
    [vendorId, (vendorName ?? '').toLowerCase(), excludeInvoiceId]
  );
}

/** Same lookup, but resolving the vendor from an existing invoice — used by the
 *  review pages to pre-fill an invoice that has no coding yet. */
export async function codingSuggestionForInvoice(
  invoiceId: string
): Promise<VendorCoding | undefined> {
  return queryOne<VendorCoding>(
    `WITH target AS (
        SELECT i.vendor_id AS vid,
               lower(COALESCE(v.name, i.vendor_name_snapshot, '')) AS vname
          FROM invoices i
          LEFT JOIN vendors v ON v.id = i.vendor_id
         WHERE i.id = $1
     )
     SELECT a.gl_code, a.gl_approver
       FROM invoices a
       LEFT JOIN vendors av ON av.id = a.vendor_id
       CROSS JOIN target t
      WHERE a.status IN ('approved', 'validated', 'submitted')
        AND a.id <> $1
        AND (a.gl_code IS NOT NULL OR a.gl_approver IS NOT NULL)
        AND (
              (t.vid IS NOT NULL AND a.vendor_id = t.vid)
           OR (t.vname <> '' AND lower(COALESCE(av.name, a.vendor_name_snapshot, '')) = t.vname)
            )
     ${CODING_SOURCE_ORDER}`,
    [invoiceId]
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
