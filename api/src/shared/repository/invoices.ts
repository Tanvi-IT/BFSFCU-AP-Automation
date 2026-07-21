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

export interface ListFilters {
  status?: InvoiceStatus;
  search?: string;
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
    where.push(`(i.invoice_number ILIKE ${p} OR v.name ILIKE ${p})`);
  }

  params.push(filters.limit, filters.offset);

  return query<InvoiceRow>(
    `SELECT i.*, COALESCE(i.raw_file_path, i.blob_path) AS raw_file_path,
              v.name AS vendor_name, v.status AS vendor_status,
              v.bank_verified AS vendor_bank_verified
       FROM invoices i
       LEFT JOIN vendors v ON v.id = i.vendor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

export async function getById(id: string): Promise<InvoiceRow | undefined> {
  return queryOne<InvoiceRow>(
    `SELECT i.*, COALESCE(i.raw_file_path, i.blob_path) AS raw_file_path,
              v.name AS vendor_name, v.status AS vendor_status,
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
