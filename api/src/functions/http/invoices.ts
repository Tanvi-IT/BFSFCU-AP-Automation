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

/**
 * A PDF starts with "%PDF-"; scan the first 1 KB since some files carry a few
 * leading bytes before it. Used to keep PDFs and discard everything else when a
 * batch of email attachments arrives, rather than trusting a filename or a
 * caller-supplied content type.
 */
function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

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
        // How the caller authenticated determines the ingestion channel: the
        // Power Automate email pipeline presents an X-Api-Key; a person uploading
        // in the browser uses the session cookie. Tag the source accordingly.
        // Without this, a single `pdf_base64` POST from the flow was
        // indistinguishable from a manual browser upload (both `manual_upload`),
        // so inbox invoices leaked into the Upload page's Recent Uploads and
        // couldn't be isolated in the Inbox Monitor.
        const ingestSource: 'manual_upload' | 'email_ingest' = req.headers.get('x-api-key')
          ? 'email_ingest'
          : 'manual_upload';

        // Store one document: blob → queued invoice → pipeline job → audit.
        // Duplicates are intentionally allowed; the worker's duplicate check
        // supersedes an earlier pending copy or routes to Exceptions.
        const persistUpload = async (
          bytes: Buffer,
          filename: string,
          contentType: string,
          source: 'manual_upload' | 'email_ingest' | 'api_ingest'
        ): Promise<string> => {
          const fileHash = createHash('sha256').update(bytes).digest('hex');
          const blobPath = buildBlobPath(filename, randomUUID());
          await uploadBlob(blobPath, bytes, contentType);
          const { id } = await invoices.createQueued({
            blobPath,
            fileHash,
            originalFilename: filename,
            source,
            submittedBy: user.id,
          });
          await enqueueInvoiceJob({ invoiceId: id, blobPath, fileHash, source });
          await recordAudit({
            entityType: 'invoice',
            entityId: id,
            action: 'uploaded',
            userId: user.id,
            metadata: { filename, bytes: bytes.length },
          });
          return id;
        };

        // A machine client (the email flow) can post every attachment from one
        // email in a single request. Each PDF becomes its own invoice; any
        // non-PDF attachment (inline images, logos, .docx …) is DISCARDED rather
        // than failing the batch — one bad attachment can't sink the whole email.
        const processBatch = async (items: Array<{ bytes: Buffer; filename: string }>) => {
          const created: Array<{ invoiceId: string; filename: string }> = [];
          const discarded: Array<{ filename: string; reason: string }> = [];
          for (const { bytes, filename } of items) {
            if (bytes.length === 0) {
              discarded.push({ filename, reason: 'empty' });
            } else if (bytes.length > MAX_UPLOAD_BYTES) {
              discarded.push({ filename, reason: 'exceeds 20 MB' });
            } else if (!looksLikePdf(bytes)) {
              discarded.push({ filename, reason: 'not a PDF' });
            } else {
              const id = await persistUpload(bytes, filename, 'application/pdf', ingestSource);
              created.push({ invoiceId: id, filename });
            }
          }
          log.info('Batch upload processed', {
            created: created.length,
            discarded: discarded.length,
          });
          return accepted({
            created,
            discarded,
            createdCount: created.length,
            discardedCount: discarded.length,
          });
        };

        const reqContentType = req.headers.get('content-type') ?? '';

        // ---- JSON: single { pdf_base64 } or a batch { attachments: [...] } ----
        if (reqContentType.includes('application/json')) {
          const body = (await req.json().catch(() => {
            throw AppError.validation(
              'Expected a JSON body with "pdf_base64" or an "attachments" array'
            );
          })) as {
            pdf_base64?: string;
            filename?: string;
            fileName?: string;
            attachments?: Array<{
              // camelCase (documented) and PascalCase (raw Power Automate /
              // Outlook "Attachments" output) are both accepted — JSON keys are
              // case-sensitive, so the flow can pass the array through unmapped.
              contentBytes?: string;
              ContentBytes?: string;
              pdf_base64?: string;
              name?: string;
              Name?: string;
              filename?: string;
              fileName?: string;
            }>;
          };

          // Multi-attachment. `contentBytes` / `name` is the Power Automate
          // "Attachments" shape; `pdf_base64` / `filename` is also accepted.
          if (Array.isArray(body.attachments)) {
            const items = body.attachments.map((a, i) => {
              const raw = a.contentBytes ?? a.ContentBytes ?? a.pdf_base64 ?? '';
              const b64 = raw.replace(/^data:[^;]*;base64,/, '').replace(/\s/g, '');
              return {
                bytes: Buffer.from(b64, 'base64'),
                filename:
                  a.name || a.Name || a.filename || a.fileName || `attachment-${i + 1}.pdf`,
              };
            });
            return processBatch(items);
          }

          // Single PDF — unchanged request/response shape for existing callers.
          const raw = body?.pdf_base64;
          if (!raw || typeof raw !== 'string') {
            throw AppError.validation(
              'Missing "pdf_base64" or "attachments" in the request body'
            );
          }
          const b64 = raw.replace(/^data:[^;]*;base64,/, '').replace(/\s/g, '');
          const bytes = Buffer.from(b64, 'base64');
          if (bytes.length === 0) throw AppError.validation('The uploaded file is empty');
          if (bytes.length > MAX_UPLOAD_BYTES) {
            throw AppError.validation('File exceeds the 20 MB limit');
          }
          // The decoded content must actually be a PDF. Unlike the multipart path
          // (which trusts the browser's content type) and the attachments batch
          // (which silently discards non-PDFs), this single-document path used to
          // store whatever it decoded — so a machine caller sending a malformed
          // `pdf_base64` (e.g. an attachment reference/metadata object, or already
          // decoded content) had a broken ~few-hundred-byte "invoice" created that
          // could never extract. Reject it here with a clear, actionable error so
          // the caller (a Power Automate flow) sees exactly what is wrong instead
          // of silently producing an empty, stuck invoice.
          if (!looksLikePdf(bytes)) {
            throw AppError.validation(
              `Decoded "pdf_base64" is not a valid PDF (no %PDF header in ${bytes.length} bytes). ` +
                'Send base64 of the PDF file itself — its raw contentBytes — not a reference, ' +
                'metadata object, or already-decoded content.'
            );
          }
          const filename = body.filename || body.fileName || 'invoice.pdf';
          const id = await persistUpload(bytes, filename, 'application/pdf', ingestSource);
          log.info('Invoice queued', { invoiceId: id, bytes: bytes.length });
          return accepted({ invoiceId: id, status: 'queued' });
        }

        // ---- multipart/form-data: one browser file, or several (batch) -------
        const form = await req.formData().catch(() => {
          throw AppError.validation(
            'Expected a multipart/form-data upload or a JSON body with pdf_base64/attachments'
          );
        });
        const files = form
          .getAll('file')
          .filter((f) => typeof f !== 'string') as unknown as File[];
        if (files.length === 0) {
          throw AppError.validation('No file was included in the upload');
        }

        // Several files → same discard-non-PDF batch behaviour as the email flow.
        if (files.length > 1) {
          const items = await Promise.all(
            files.map(async (f) => ({
              bytes: Buffer.from(await f.arrayBuffer()),
              filename: f.name || 'attachment.pdf',
            }))
          );
          return processBatch(items);
        }

        // Single file keeps the browser's behaviour: PDF/PNG/JPEG allowed, and an
        // unsupported type is a 400 the user sees, not a silent discard.
        const file = files[0]!;
        const contentType = file.type || 'application/octet-stream';
        const bytes = Buffer.from(await file.arrayBuffer());
        const filename = file.name || 'invoice.pdf';
        if (!ALLOWED_TYPES[contentType]) {
          throw AppError.validation(
            `Unsupported file type "${contentType}". Allowed: PDF, PNG, JPEG.`
          );
        }
        if (bytes.length === 0) throw AppError.validation('The uploaded file is empty');
        if (bytes.length > MAX_UPLOAD_BYTES) {
          throw AppError.validation('File exceeds the 20 MB limit');
        }
        const id = await persistUpload(bytes, filename, contentType, ingestSource);
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
// GET /api/invoices/{id}/suggested-coding
// The GL coding from this vendor's last approved invoice, to pre-fill review.
// --------------------------------------------------------------------------
app.http('invoice-suggested-coding', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/suggested-coding',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing invoice id');

    const coding = await invoices.codingSuggestionForInvoice(id);
    return ok({
      glCode: coding?.gl_code ?? null,
      glApprover: coding?.gl_approver ?? null,
    });
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
