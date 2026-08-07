/**
 * Invoice workflow transitions: approve, decline, edit.
 *
 * Every transition writes an audit entry in the SAME transaction as the status
 * change, so an approval can never exist without its audit record.
 */

import { transaction } from '../db';
import { AppError } from '../errors';
import * as prologue from '../prologue';
import type { InvoiceStatus } from './invoices';

interface StatusRow {
  id: string;
  status: InvoiceStatus;
  approved_at: string | null;
}

/**
 * The invoice + vendor fields needed to stage a transaction in Prologue.
 * Selected alongside the status row when the integration is enabled.
 */
interface PrologueSourceRow {
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: string | null;
  gl_code: string | null;
  vendor_external_id: string | null;
  vendor_name: string | null;
}

/** Statuses from which an invoice may still be approved or declined. */
const REVIEWABLE: readonly InvoiceStatus[] = ['validated', 'submitted', 'exception'];

/**
 * Map a locked invoice row to Prologue proc inputs and stage it, returning the
 * Prologue transaction id. Throws `AppError` (validation / upstream / conflict)
 * on any gap or failure so the caller aborts the local approval — "move to
 * approved only if Prologue was updated".
 *
 * v1 is single-line GL: the full amount is coded to `gl_code`.
 */
async function stageInPrologue(
  src: PrologueSourceRow,
  approverName: string
): Promise<prologue.PrologueResult> {
  const missing: string[] = [];
  if (!src.vendor_external_id) missing.push('vendor is not mapped to a Prologue vendor id');
  if (!src.gl_code) missing.push('GL account (gl_code) is not set');
  if (!src.invoice_number) missing.push('invoice number is missing');
  if (!src.invoice_date) missing.push('invoice date is missing');
  if (!src.due_date) missing.push('due date is missing');
  const amount = src.total_amount != null ? Number(src.total_amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) missing.push('total amount is invalid');

  if (missing.length > 0) {
    throw AppError.validation(
      `Cannot post to Prologue — ${missing.join('; ')}. Fix the invoice and approve again.`
    );
  }

  return prologue.pushInvoice({
    vendorId: src.vendor_external_id!,
    vendorDocumentNumber: src.invoice_number!,
    vendorDocumentDate: src.invoice_date!,
    dueDate: src.due_date!,
    description: `${src.vendor_name ?? ''} ${src.invoice_number}`.trim(),
    totalAmount: amount,
    glAccountId: src.gl_code!,
    // transactionTypeId left NULL in v1 — AP staff assign the payment method.
    approverName,
  });
}

export async function approve(
  invoiceId: string,
  actorId: string,
  note?: string,
  approverName?: string
): Promise<void> {
  await transaction(async (client) => {
    // Load the on/off flag once for this approval (DB-backed config).
    const prologueOn = await prologue.isEnabled();
    // When Prologue is on, read the extra fields it needs in the same locked
    // read, so the row cannot change between the push and the local commit.
    const columns = prologueOn
      ? `i.id, i.status, i.approved_at, i.submitted_by,
         i.invoice_number, i.invoice_date::text AS invoice_date,
         i.due_date::text AS due_date, i.total_amount::text AS total_amount,
         i.gl_code, v.external_id AS vendor_external_id, v.name AS vendor_name`
      : `i.id, i.status, i.approved_at, i.submitted_by`;

    const found = await client.query<
      StatusRow & { submitted_by: string | null } & Partial<PrologueSourceRow>
    >(
      `SELECT ${columns}
         FROM invoices i
         LEFT JOIN vendors v ON v.id = i.vendor_id
        WHERE i.id = $1
          FOR UPDATE OF i`,
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

    // Prologue-first: stage the transaction and only then flip to approved. Any
    // failure throws, rolling back this transaction so the invoice is untouched.
    let prologueRef: prologue.PrologueResult | undefined;
    if (prologueOn) {
      prologueRef = await stageInPrologue(
        invoice as PrologueSourceRow,
        approverName ?? actorId
      );
    }

    await client.query(
      `UPDATE invoices
          SET status = 'approved', approved_by = $2, approved_at = now(),
              transaction_date = (now() AT TIME ZONE 'America/New_York')::date,
              declined_by = NULL, declined_at = NULL, checker_comment = NULL,
              erp_status = CASE WHEN $3::text IS NULL THEN erp_status ELSE 'synced' END,
              erp_reference_id = COALESCE($3, erp_reference_id),
              erp_last_synced_at = CASE WHEN $3::text IS NULL THEN erp_last_synced_at ELSE now() END,
              push_status = CASE WHEN $3::text IS NULL THEN push_status ELSE 'synced' END
        WHERE id = $1`,
      [invoiceId, actorId, prologueRef ? String(prologueRef.transactionId) : null]
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
        JSON.stringify({
          from: invoice.status,
          note: note ?? null,
          self_approved: selfApproved,
          prologue_transaction_id: prologueRef?.transactionId ?? null,
          prologue_batch_id: prologueRef?.batchId ?? null,
        }),
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
  glApprover?: string | null;
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
              system_filename    = COALESCE($12, system_filename),
              gl_approver        = COALESCE($13, gl_approver)
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
        fields.glApprover ?? null,
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
  coding: { glCode: string | null; glApprover: string | null },
  actorId: string
): Promise<number> {
  return transaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `UPDATE invoices
          SET gl_code     = $2,
              gl_approver = $3
        WHERE vendor_id = $1
          AND status <> 'approved'
        RETURNING id`,
      [vendorId, coding.glCode, coding.glApprover]
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
  actorId: string,
  approverName?: string
): Promise<{ approved: string[]; skipped: string[]; failed: { id: string; error: string }[] }> {
  if (invoiceIds.length === 0) return { approved: [], skipped: [], failed: [] };

  // When Prologue is on, each invoice is a separate cross-system operation:
  // stage in Prologue, then commit locally. One rejection (duplicate, unmapped
  // vendor, bad GL) must not roll back the others, so each runs in its own
  // transaction via approve(). Already-approved rows surface as skipped.
  if (await prologue.isEnabled()) {
    const approved: string[] = [];
    const skipped: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of invoiceIds) {
      try {
        await approve(id, actorId, undefined, approverName);
        approved.push(id);
      } catch (err) {
        if (err instanceof AppError && err.status === 409) {
          // already approved / status conflict — consistent with the bulk path
          skipped.push(id);
        } else {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    return { approved, skipped, failed };
  }

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
    const failed: { id: string; error: string }[] = [];

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

    return { approved, skipped, failed };
  });
}
