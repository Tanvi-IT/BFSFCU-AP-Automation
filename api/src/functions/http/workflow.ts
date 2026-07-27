/**
 * Invoice workflow, notes and audit trail.
 *
 *   POST  /api/invoices/{id}/approve
 *   POST  /api/invoices/{id}/decline
 *   PATCH /api/invoices/{id}
 *   GET   /api/invoices/{id}/notes
 *   POST  /api/invoices/{id}/notes
 *   GET   /api/invoices/{id}/audit
 */

import { app } from '@azure/functions';
import { createHandler, ok, noContent, type MethodRoute } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import * as workflow from '../../shared/repository/workflow';
import * as activity from '../../shared/repository/activity';

function invoiceId(params: Record<string, string>): string {
  const id = params['id'];
  if (!id) throw AppError.validation('Missing invoice id');
  return id;
}

async function readJson(req: { json: () => Promise<unknown> }): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

// --------------------------------------------------------------------------
app.http('invoice-approve', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/approve',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const id = invoiceId(req.params);
    const body = await readJson(req);
    const note = typeof body['note'] === 'string' ? body['note'] : undefined;

    await workflow.approve(id, user.id, note);
    log.info('Invoice approved', { invoiceId: id });

    return ok({ id, status: 'approved' });
  }),
});

// --------------------------------------------------------------------------
app.http('invoice-decline', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/decline',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const id = invoiceId(req.params);
    const body = await readJson(req);
    const reason = typeof body['reason'] === 'string' ? body['reason'] : '';

    await workflow.decline(id, user.id, reason);
    log.info('Invoice declined', { invoiceId: id });

    return ok({ id, status: 'declined' });
  }),
});

// --------------------------------------------------------------------------
app.http('invoices-batch-approve', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/batch-approve',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const body = await readJson(req);
    const ids = Array.isArray(body['invoiceIds'])
      ? (body['invoiceIds'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];

    if (ids.length === 0) throw AppError.validation('invoiceIds is required');
    if (ids.length > 500) throw AppError.validation('Cannot approve more than 500 at once');

    const result = await workflow.approveMany(ids, user.id);
    log.info('Batch approval', {
      approved: result.approved.length,
      skipped: result.skipped.length,
    });

    return ok(result);
  }),
});

// --------------------------------------------------------------------------
app.http('invoice-return-to-review', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/return-to-review',
  handler: createHandler({ roles: Roles.reviewer }, async ({ req, user, log }) => {
    const id = invoiceId(req.params);
    const body = await readJson(req);
    const reason = typeof body['reason'] === 'string' ? body['reason'] : '';
    const action = body['action'] === 'returned_to_submitter' ? 'returned_to_submitter' : 'resolved';

    const target = body['target'] === 'validated' ? 'validated' : 'submitted';

    await workflow.returnToReview(id, user.id, reason, action, target);
    log.info('Invoice returned to review', { invoiceId: id, action, target });

    return ok({ id, status: target });
  }),
});

// --------------------------------------------------------------------------
app.http('invoice-submit', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/submit',
  handler: createHandler({ roles: Roles.reviewer }, async ({ req, user, log }) => {
    const id = invoiceId(req.params);
    await workflow.submitForApproval(id, user.id);
    log.info('Invoice submitted for approval', { invoiceId: id });
    return ok({ id, status: 'submitted' });
  }),
});

// --------------------------------------------------------------------------
app.http('invoice-escalate', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/escalate',
  handler: createHandler({ roles: Roles.reviewer }, async ({ req, user, log }) => {
    const id = invoiceId(req.params);
    const body = await readJson(req);
    const reason = typeof body['reason'] === 'string' ? body['reason'] : '';

    await workflow.routeToException(id, user.id, reason);
    log.info('Invoice escalated to exceptions', { invoiceId: id });
    return ok({ id, status: 'exception' });
  }),
});

// --------------------------------------------------------------------------
/**
 * PATCH /api/invoices/{id}
 *
 * Registered in invoices.ts rather than here: Azure Functions allows one
 * registration per route, and GET/PATCH/DELETE on `invoices/{id}` are split
 * across two files. Exported as a MethodRoute so the role stays attached to
 * the method it guards.
 */
export const updateInvoiceRoute: MethodRoute = {
  roles: Roles.reviewer,
  handler: async ({ req, user }) => {
    const id = invoiceId(req.params);
    const body = await readJson(req);

    const fields: workflow.EditableFields = {};
    if (typeof body['invoiceNumber'] === 'string') fields.invoiceNumber = body['invoiceNumber'];
    if (typeof body['invoiceDate'] === 'string') fields.invoiceDate = body['invoiceDate'];
    if (typeof body['dueDate'] === 'string') fields.dueDate = body['dueDate'];
    if (typeof body['totalAmount'] === 'number') fields.totalAmount = body['totalAmount'];
    if (typeof body['vendorId'] === 'string') fields.vendorId = body['vendorId'];
    if (typeof body['glCode'] === 'string') fields.glCode = body['glCode'];
    if (typeof body['glApprover'] === 'string') fields.glApprover = body['glApprover'];
    if (typeof body['departmentName'] === 'string') {
      fields.departmentName = body['departmentName'];
    }
    if (typeof body['departmentId'] === 'string') fields.departmentId = body['departmentId'];
    if (typeof body['achRoutingNumber'] === 'string') {
      fields.achRoutingNumber = body['achRoutingNumber'];
    }
    if (typeof body['achAccountNumber'] === 'string') {
      fields.achAccountNumber = body['achAccountNumber'];
    }
    if (typeof body['systemFilename'] === 'string') {
      fields.systemFilename = body['systemFilename'];
    }

    if (Object.keys(fields).length === 0) {
      throw AppError.validation('No editable fields were supplied');
    }

    const submitAfterSave = body['submitAfterSave'] === true;
    await workflow.updateFields(id, fields, user.id, submitAfterSave);
    return ok({ id, updated: Object.keys(fields), submitted: submitAfterSave });
  },
};

// --------------------------------------------------------------------------
app.http('vendor-apply-coding', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{vendorId}/apply-coding',
  handler: createHandler({ roles: Roles.reviewer }, async ({ req, user, log }) => {
    const vendorId = req.params['vendorId'];
    if (!vendorId) throw AppError.validation('Missing vendor id');

    const body = await readJson(req);
    const glCode = typeof body['glCode'] === 'string' ? body['glCode'] : null;
    const glApprover =
      typeof body['glApprover'] === 'string' ? body['glApprover'] : null;

    const updated = await workflow.applyCodingToVendor(
      vendorId,
      { glCode, glApprover },
      user.id
    );

    log.info('Coding applied to vendor invoices', { vendorId, updated });
    return ok({ vendorId, invoicesUpdated: updated });
  }),
});

// --------------------------------------------------------------------------
app.http('invoice-notes', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/notes',
  handler: createHandler({ roles: Roles.any }, async ({ req, user }) => {
    const id = invoiceId(req.params);

    if (req.method === 'GET') {
      return ok({ notes: await activity.listNotes(id) });
    }

    const body = await readJson(req);
    const text = typeof body['body'] === 'string' ? body['body'].trim() : '';
    if (!text) throw AppError.validation('Note text is required');

    return ok(await activity.addNote(id, user.id, text));
  }),
});

// --------------------------------------------------------------------------
app.http('invoice-audit', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/audit',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const id = invoiceId(req.params);
    return ok({ entries: await activity.listAudit('invoice', id) });
  }),
});

// --------------------------------------------------------------------------
app.http('audit-recent', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'audit',
  handler: createHandler({ roles: Roles.admin }, async ({ req }) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
    return ok({ entries: await activity.listRecentAudit(Number.isFinite(limit) ? limit : 100) });
  }),
});

// --------------------------------------------------------------------------
/** DELETE /api/invoices/{id} — registered in invoices.ts. See updateInvoiceRoute. */
export const deleteInvoiceRoute: MethodRoute = {
  roles: Roles.admin,
  handler: async ({ req, user }) => {
    const id = invoiceId(req.params);
    await activity.recordAudit({
      entityType: 'invoice',
      entityId: id,
      action: 'deleted',
      userId: user.id,
    });
    // Kept deliberately as an audit-only action for now; hard deletion of a
    // financial record needs an explicit retention decision.
    throw AppError.forbidden('Deleting invoices is disabled pending a retention policy');
  },
};

export {};
