/**
 * Supplemental documents linked to an invoice.
 *
 * Each attachment is its own blob; this table is the index. The invoice's
 * `supplemental_pdf_count` and `last_supplemental_added_at` columns are kept in
 * sync here so existing readers do not need the join.
 */

import { query, queryOne, transaction } from '../db';

export interface AttachmentRow {
  id: string;
  invoice_id: string;
  blob_path: string;
  original_filename: string;
  content_type: string;
  bytes: number;
  uploaded_by: string | null;
  created_at: string;
  /** Joined from users — the email of whoever attached it. */
  uploaded_by_email?: string | null;
}

export async function list(invoiceId: string): Promise<AttachmentRow[]> {
  return query<AttachmentRow>(
    `SELECT a.*, u.email AS uploaded_by_email
       FROM invoice_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.invoice_id = $1
      ORDER BY a.created_at DESC`,
    [invoiceId]
  );
}

export async function getById(attachmentId: string): Promise<AttachmentRow | undefined> {
  return queryOne<AttachmentRow>(
    `SELECT * FROM invoice_attachments WHERE id = $1`,
    [attachmentId]
  );
}

export async function add(input: {
  invoiceId: string;
  blobPath: string;
  originalFilename: string;
  contentType: string;
  bytes: number;
  uploadedBy: string;
}): Promise<AttachmentRow> {
  return transaction(async (client) => {
    const inserted = await client.query<AttachmentRow>(
      `INSERT INTO invoice_attachments
         (invoice_id, blob_path, original_filename, content_type, bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.invoiceId,
        input.blobPath,
        input.originalFilename,
        input.contentType,
        input.bytes,
        input.uploadedBy,
      ]
    );

    // Keep the denormalised count on the invoice accurate for existing readers.
    await client.query(
      `UPDATE invoices
          SET supplemental_pdf_count =
                (SELECT count(*) FROM invoice_attachments WHERE invoice_id = $1),
              last_supplemental_added_at = now()
        WHERE id = $1`,
      [input.invoiceId]
    );

    const row = inserted.rows[0];
    if (!row) throw new Error('Attachment insert returned no row');
    return row;
  });
}

/** Remove an attachment row and return its blob path so the caller deletes the blob. */
export async function remove(attachmentId: string): Promise<string | null> {
  return transaction(async (client) => {
    const deleted = await client.query<{ blob_path: string; invoice_id: string }>(
      `DELETE FROM invoice_attachments WHERE id = $1
       RETURNING blob_path, invoice_id`,
      [attachmentId]
    );
    const row = deleted.rows[0];
    if (!row) return null;

    await client.query(
      `UPDATE invoices
          SET supplemental_pdf_count =
                (SELECT count(*) FROM invoice_attachments WHERE invoice_id = $1)
        WHERE id = $1`,
      [row.invoice_id]
    );

    return row.blob_path;
  });
}
