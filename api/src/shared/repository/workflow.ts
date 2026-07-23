/**
 * Invoice workflow transitions: approve, decline, edit.
 *
 * Every transition writes an audit entry in the SAME transaction as the status
 * change, so an approval can never exist without its audit record.
 */

import { transaction } from '../db';
import { AppError } from '../errors';
import type { InvoiceStatus } from './invoices';

interface StatusRow {
  id: string;
  status: InvoiceStatus;
  approved_at: string | null;
}

/** Statuses from which an invoice may still be approved or declined. */
const REVIEWABLE: readonly InvoiceStatus[] = ['validated', 'submitted', 'exception'];

export async function approve(
  invoiceId: string,
  actorId: string,
  note?: string
): Promise<void> {
  await transaction(async (client) => {
    const found = await client.query<StatusRow & { submitted_by: string | null }>(
      `SELECT id, status, approved_at, submitted_by FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    const invoice = found.rows[0];
    if (!invoice) throw AppError.notFound('Invoice not found');

    if (invoice.status === 'approved') {
      throw AppError.conflict('This invoice has already been approved');
    }
    if (!REVIEWABLE.includes(invoice.status)) {
      throw AppError.conflict(`An invoice with status "${invoice.status}" cannot be approved`);
    }

    await client.query(
      `UPDATE invoices
          SET status = 'approved', approved_by = $2, approved_at = now(),
              transaction_date = (now() AT TIME ZONE 'America/New_York')::date,
              declined_by = NULL, declined_at = NULL, checker_comment = NULL
        WHERE id = $1`,
      [invoiceId, actorId]
    );

    // Any user may approve any invoice. Accountability is via the audit trail;
    // self-approval (approver == submitter) is not blocked but is flagged so it
    // is visible and reportable without depending on manual review.
    const selfApproved = invoice.submitted_by != null && invoice.submitted_by === actorId;

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('invoice', $1, 'approved', $2, $3::jsonb)`,
      [
        invoiceId,
        actorId,
        JSON.stringify({ from: invoice.status, note: note ?? null, self_approved: selfApproved }),
      ]
    );
  });
}

export async function decline(
  invoiceId: string,
  actorId: string,
  reason: string
): Promise<void> {
  if (!reason || reason.trim().length < 3) {
    throw AppError.validation('A decline reason is required');
  }

  await transaction(async (client) => {
    const found = await client.query<StatusRow>(
      `SELECT id, status, approved_at FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    const invoice = found.rows[0];
    if (!invoice) throw AppError.notFound('Invoice not found');

    if (invoice.status === 'rejected') {
      throw AppError.conflict('This invoice has already been declined');
    }

    await client.query(
      `UPDATE invoices
          SET status = 'rejected', declined_by = $2, declined_at = now(),
              checker_comment = $3, approved_by = NULL, approved_at = NULL
        WHERE id = $1`,
      [invoiceId, actorId, reason.trim()]
    );

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('invoice', $1, 'declined', $2, $3::jsonb)`,
      [invoiceId, actorId, JSON.stringify({ from: invoice.status, reason: reason.trim() })]
    );
  });
}

/**
 * Send an invoice back for review — used from the Exceptions queue when a
 * problem has been resolved, or to return it to the submitter for corrections.
 *
 * Returns to `submitted` — the same behaviour as the current system.
 */
export async function returnToReview(
  invoiceId: string,
  actorId: string,
  reason: string,
  action: 'resolved' | 'returned_to_submitter' = 'resolved',
  /**
   * Destination queue. The original system is inconsistent here: the Exceptions
   * LIST resolves to 'submitted' (High Confidence) while the Exceptions DETAIL
   * page resolves to 'validated' (Low Confidence). Both behaviours are
   * preserved exactly rather than silently unified — see docs note.
   */
  target: 'submitted' | 'validated' = 'submitted'
): Promise<void> {
  await transaction(async (client) => {
    const found = await client.query<StatusRow>(
      `SELECT id, status, approved_at FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    const invoice = found.rows[0];
    if (!invoice) throw AppError.notFound('Invoice not found');

    if (invoice.status === 'approved') {
      throw AppError.conflict('An approved invoice cannot be returned to review');
    }

    await client.query(
      `UPDATE invoices
          SET status = $3::invoice_status, checker_comment = $2,
              approved_at = NULL,
              declined_by = NULL, declined_at = NULL
        WHERE id = $1`,
      [invoiceId, reason || null, target]
    );

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('invoice', $1, $2, $3, $4::jsonb)`,
      [
        invoiceId,
        action === 'resolved' ? 'returned_to_review' : 'returned_to_submitter',
        actorId,
        JSON.stringify({ from: invoice.status, to: target, reason: reason || null }),
      ]
    );
  });
}

/** Move a reviewed invoice forward to the approval queue. */
export async function submitForApproval(
  invoiceId: string,
  actorId: string
): Promise<void> {
  await transaction(async (client) => {
    const found = await client.query<StatusRow>(
      `SELECT id, status, approved_at FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    const invoice = found.rows[0];
    if (!invoice) throw AppError.notFound('Invoice not found');
    if (invoice.status === 'approved') {
      throw AppError.conflict('This invoice has already been approved');
    }

    await client.query(`UPDATE invoices SET status = 'submitted' WHERE id = $1`, [
      invoiceId,
    ]);

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('invoice', $1, 'submitted_for_approval', $2, $3::jsonb)`,
      [invoiceId, actorId, JSON.stringify({ from: invoice.status })]
    );
  });
}

/** Escalate an invoice to the Exceptions queue for investigation. */
export async function routeToException(
  invoiceId: string,
  actorId: string,
  reason: string
): Promise<void> {
  await transaction(async (client) => {
    const found = await client.query<StatusRow>(
      `SELECT id, status, approved_at FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    const invoice = found.rows[0];
    if (!invoice) throw AppError.notFound('Invoice not found');
    if (invoice.status === 'approved') {
      throw AppError.conflict('An approved invoice cannot be routed to exceptions');
    }

    await client.query(
      `UPDATE invoices
          SET status = 'exception',
              variation_flags = CASE
                WHEN 'manual_escalation' = ANY (variation_flags) THEN variation_flags
                ELSE array_append(variation_flags, 'manual_escalation')
              END
        WHERE id = $1`,
      [invoiceId]
    );

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('invoice', $1, 'routed_to_exception', $2, $3::jsonb)`,
      [
        invoiceId,
        actorId,
        JSON.stringify({ from: invoice.status, reason: reason || null }),
      ]
    );
  });
}

export interface EditableFields {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  totalAmount?: number | null;
  vendorId?: string | null;
  glCode?: string | null;
  departmentName?: string | null;
  departmentId?: string | null;
  achRoutingNumber?: string | null;
  achAccountNumber?: string | null;
  systemFilename?: string | null;
}

/**
 * Correct extracted fields during review. Approved invoices are immutable.
 *
 * `submitAfterSave` moves the invoice to the approval queue in the SAME
 * transaction, so an edit-and-resubmit can never half-apply.
 */
export async function updateFields(
  invoiceId: string,
  fields: EditableFields,
  actorId: string,
  submitAfterSave = false
): Promise<void> {
  await transaction(async (client) => {
    const found = await client.query<StatusRow>(
      `SELECT id, status, approved_at FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );

    const invoice = found.rows[0];
    if (!invoice) throw AppError.notFound('Invoice not found');

    if (invoice.status === 'approved') {
      throw AppError.conflict('An approved invoice cannot be edited');
    }

    await client.query(
      `UPDATE invoices
          SET invoice_number  = COALESCE($2, invoice_number),
              invoice_date    = COALESCE($3::date, invoice_date),
              due_date        = COALESCE($4::date, due_date),
              total_amount    = COALESCE($5, total_amount),
              vendor_id       = COALESCE($6, vendor_id),
              gl_code            = COALESCE($7, gl_code),
              department_name    = COALESCE($8, department_name),
              department_id      = COALESCE($9, department_id),
              ach_routing_number = COALESCE($10, ach_routing_number),
              ach_account_number = COALESCE($11, ach_account_number),
              system_filename    = COALESCE($12, system_filename)
        WHERE id = $1`,
      [
        invoiceId,
        fields.invoiceNumber ?? null,
        fields.invoiceDate ?? null,
        fields.dueDate ?? null,
        fields.totalAmount ?? null,
        fields.vendorId ?? null,
        fields.glCode ?? null,
        fields.departmentName ?? null,
        fields.departmentId ?? null,
        fields.achRoutingNumber ?? null,
        fields.achAccountNumber ?? null,
        fields.systemFilename ?? null,
      ]
    );

    if (submitAfterSave) {
      await client.query(
        `UPDATE invoices SET status = 'submitted' WHERE id = $1`,
        [invoiceId]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('invoice', $1, 'fields_edited', $2, $3::jsonb)`,
      [invoiceId, actorId, JSON.stringify({ ...fields, resubmitted: submitAfterSave })]
    );
  });
}

/**
 * Apply GL coding to every invoice for a vendor.
 *
 * Used by the "apply to all invoices from this vendor" toggle in the review
 * queues. Approved invoices are excluded — coding on an approved invoice must
 * not change after the fact.
 */
export async function applyCodingToVendor(
  vendorId: string,
  coding: { glCode: string | null; departmentId: string | null },
  actorId: string
): Promise<number> {
  return transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `UPDATE invoices
          SET gl_code       = $2,
              department_id = $3
        WHERE vendor_id = $1
          AND status <> 'approved'
        RETURNING id`,
      [vendorId, coding.glCode, coding.departmentId]
    );

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('vendor', $1, 'coding_applied_to_vendor_invoices', $2, $3::jsonb)`,
      [
        vendorId,
        actorId,
        JSON.stringify({ ...coding, invoicesUpdated: result.rowCount ?? 0 }),
      ]
    );

    return result.rowCount ?? 0;
  });
}

/**
 * Approve several invoices at once (the High Confidence queue's batch action).
 *
 * Runs in a single transaction: either every selected invoice is approved with
 * its audit entry, or none are. Already-approved invoices are skipped rather
 * than failing the whole batch.
 */
export async function approveMany(
  invoiceIds: readonly string[],
  actorId: string
): Promise<{ approved: string[]; skipped: string[] }> {
  if (invoiceIds.length === 0) return { approved: [], skipped: [] };

  return transaction(async (client) => {
    // Which of these were submitted by the approver — flagged in the audit
    // trail as self-approvals, not blocked (see approve()).
    const own = await client.query<{ id: string }>(
      `SELECT id FROM invoices WHERE id = ANY($1::uuid[]) AND submitted_by = $2`,
      [invoiceIds as string[], actorId]
    );
    const selfIds = new Set(own.rows.map((r) => r.id));

    const result = await client.query<{ id: string }>(
      `UPDATE invoices
          SET status = 'approved', approved_by = $2, approved_at = now(),
              transaction_date = (now() AT TIME ZONE 'America/New_York')::date
        WHERE id = ANY($1::uuid[])
          AND status <> 'approved'
        RETURNING id`,
      [invoiceIds as string[], actorId]
    );

    const approved = result.rows.map((r) => r.id);
    const skipped = invoiceIds.filter((id) => !approved.includes(id));

    for (const id of approved) {
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
         VALUES ('invoice', $1, 'approved', $2, $3::jsonb)`,
        [
          id,
          actorId,
          JSON.stringify({ bulk: true, queue: 'high_confidence', self_approved: selfIds.has(id) }),
        ]
      );
    }

    return { approved, skipped };
  });
}
