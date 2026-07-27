/**
 * Invoice routes.
 *
 *   POST   /api/invoices          upload  → store → enqueue → 202
 *   GET    /api/invoices          list
 *   GET    /api/invoices/{id}     detail
 *   PATCH  /api/invoices/{id}     edit fields        (handler in workflow.ts)
 *   DELETE /api/invoices/{id}     audit-only delete  (handler in workflow.ts)
 *   GET    /api/invoices/{id}/file  short-lived view URL
 *
 * The upload returns immediately. All AI work happens in the queue worker, so
 * the browser never waits on a 20-second pipeline.
 *
 * Methods that share a route are registered together: Azure Functions permits
 * one registration per route. Roles stay attached per method — see
 * createMethodHandler.
 */

import { app } from '@azure/functions';
import { createHandler, createMethodHandler, ok, accepted } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { buildBlobPath, uploadBlob, getReadUrl } from '../../shared/blob';
import { enqueueInvoiceJob } from '../../shared/queue';
import * as invoices from '../../shared/repository/invoices';
import { recordAudit } from '../../shared/repository/activity';
import { updateInvoiceRoute, deleteInvoiceRoute } from './workflow';
import { createHash, randomUUID } from 'node:crypto';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

// --------------------------------------------------------------------------
// GET  /api/invoices    list
// POST /api/invoices    upload
// --------------------------------------------------------------------------
app.http('invoices', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async ({ req }) => {
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
        const status = url.searchParams.get('status') ?? undefined;
        const search = url.searchParams.get('search') ?? undefined;

        // Date range for the historical queues. Validated here so a malformed
        // value is a 400 rather than a Postgres cast error surfacing as a 500.
        const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
        const dateTo = url.searchParams.get('dateTo') ?? undefined;
        for (const [name, value] of [
          ['dateFrom', dateFrom],
          ['dateTo', dateTo],
        ] as const) {
          if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw AppError.validation(`${name} must be a YYYY-MM-DD date`);
          }
        }

        const dateFieldRaw = url.searchParams.get('dateField');
        if (
          dateFieldRaw &&
          !(invoices.DATE_FIELDS as readonly string[]).includes(dateFieldRaw)
        ) {
          throw AppError.validation(
            `dateField must be one of: ${invoices.DATE_FIELDS.join(', ')}`
          );
        }
        const dateField = (dateFieldRaw as invoices.DateField | null) ?? undefined;

        const orderRaw = url.searchParams.get('order');
        if (orderRaw && orderRaw !== 'asc' && orderRaw !== 'desc') {
          throw AppError.validation("order must be 'asc' or 'desc'");
        }
        const order = (orderRaw as 'asc' | 'desc' | null) ?? undefined;

        const rows = await invoices.list({
          limit: Number.isFinite(limit) ? limit : 50,
          offset: Number.isFinite(offset) ? offset : 0,
          ...(status ? { status: status as invoices.InvoiceStatus } : {}),
          ...(search ? { search } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
          ...(dateField ? { dateField } : {}),
          ...(order ? { order } : {}),
        });

        return ok({ invoices: rows, limit, offset });
      },
    },

    POST: {
      roles: Roles.reviewer,
      handler: async ({ req, user, log }) => {
        // Accept either a multipart/form-data upload (the browser) or a JSON
        // body carrying a base64 PDF. Machine clients such as the Power
        // Automate flow send { pdf_base64, filename }.
        let bytes: Buffer;
        let filename: string;
        let contentType: string;

        const reqContentType = req.headers.get('content-type') ?? '';
        if (reqContentType.includes('application/json')) {
          const body = (await req.json().catch(() => {
            throw AppError.validation('Expected a JSON body with a "pdf_base64" field');
          })) as { pdf_base64?: string; filename?: string; fileName?: string };
          const raw = body?.pdf_base64;
          if (!raw || typeof raw !== 'string') {
            throw AppError.validation('Missing "pdf_base64" in the request body');
          }
          // Tolerate a data: URI prefix and any whitespace/newlines.
          const b64 = raw.replace(/^data:[^;]*;base64,/, '').replace(/\s/g, '');
          bytes = Buffer.from(b64, 'base64');
          filename = body.filename || body.fileName || 'invoice.pdf';
          contentType = 'application/pdf';
        } else {
          const form = await req.formData().catch(() => {
            throw AppError.validation(
              'Expected a multipart/form-data upload or a JSON body with pdf_base64'
            );
          });
          const file = form.get('file');
          if (!file || typeof file === 'string') {
            throw AppError.validation('No file was included in the upload');
          }
          contentType = file.type || 'application/octet-stream';
          bytes = Buffer.from(await file.arrayBuffer());
          filename = (file as File).name || 'invoice.pdf';
        }

        if (!ALLOWED_TYPES[contentType]) {
          throw AppError.validation(
            `Unsupported file type "${contentType}". Allowed: PDF, PNG, JPEG.`
          );
        }
        if (bytes.length === 0) {
          throw AppError.validation('The uploaded file is empty');
        }
        if (bytes.length > MAX_UPLOAD_BYTES) {
          throw AppError.validation('File exceeds the 20 MB limit');
        }

        // Stored for reference/tracing. Duplicates are intentionally allowed:
        // a re-upload creates a new invoice and the pipeline's duplicate check
        // supersedes an earlier pending copy or routes the new one to
        // Exceptions when an earlier copy is already approved.
        const fileHash = createHash('sha256').update(bytes).digest('hex');

        const blobPath = buildBlobPath(filename, randomUUID());

        await uploadBlob(blobPath, bytes, contentType);

        const { id } = await invoices.createQueued({
          blobPath,
          fileHash,
          originalFilename: filename,
          source: 'manual_upload',
          submittedBy: user.id,
        });

        await enqueueInvoiceJob({ invoiceId: id, blobPath, fileHash, source: 'manual_upload' });

        // Record who uploaded, so it appears in the audit trail.
        await recordAudit({
          entityType: 'invoice',
          entityId: id,
          action: 'uploaded',
          userId: user.id,
          metadata: { filename, bytes: bytes.length },
        });

        log.info('Invoice queued', { invoiceId: id, bytes: bytes.length });

        return accepted({ invoiceId: id, status: 'queued' });
      },
    },
  }),
});

// --------------------------------------------------------------------------
// GET / PATCH / DELETE  /api/invoices/{id}
//
// PATCH and DELETE live in workflow.ts alongside the rest of the workflow
// logic; they are imported here so all three methods share one registration.
// --------------------------------------------------------------------------
app.http('invoice-by-id', {
  methods: ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async ({ req }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing invoice id');

        const invoice = await invoices.getById(id);
        if (!invoice) throw AppError.notFound('Invoice not found');

        // Line items and anomalies are returned with the invoice so the detail
        // page needs one request instead of three.
        const [items, flags] = await Promise.all([
          invoices.lineItems(id),
          invoices.anomalies(id),
        ]);

        return ok({ ...invoice, line_items: items, invoice_anomalies: flags });
      },
    },
    PATCH: updateInvoiceRoute,
    DELETE: deleteInvoiceRoute,
  }),
});

// --------------------------------------------------------------------------
// GET /api/invoices/{id}/file
// --------------------------------------------------------------------------
app.http('invoices-file', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/file',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing invoice id');

    const invoice = await invoices.getById(id);
    if (!invoice) throw AppError.notFound('Invoice not found');

    // Short-lived URL; the container itself is never publicly reachable.
    const url = await getReadUrl(invoice.blob_path, 15);
    return ok({ url, expiresInMinutes: 15 });
  }),
});

// --------------------------------------------------------------------------
// GET /api/invoices-stats
// --------------------------------------------------------------------------
app.http('invoices-stats', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices-stats',
  handler: createHandler({ roles: Roles.any }, async () => {
    return ok(await invoices.countByStatus());
  }),
});
