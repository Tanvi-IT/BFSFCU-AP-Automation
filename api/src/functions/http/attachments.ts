/**
 * Supplemental documents on an invoice.
 *
 *   GET  /api/invoices/{id}/supplemental                 list attachments
 *   POST /api/invoices/{id}/supplemental                 attach a document
 *   GET  /api/invoices/{id}/supplemental/{attId}/file    short-lived view URL
 *   DELETE /api/invoices/{id}/supplemental/{attId}       remove an attachment
 *
 * Each attachment is stored as its own blob. Attaching is blocked once the
 * invoice is approved or declined — its supporting documents are then settled.
 */

import { app } from '@azure/functions';
import { createHandler, createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { buildBlobPath, uploadBlob, getReadUrl, deleteBlob } from '../../shared/blob';
import * as invoices from '../../shared/repository/invoices';
import * as attachments from '../../shared/repository/attachments';
import { recordAudit } from '../../shared/repository/activity';
import { randomUUID } from 'node:crypto';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

// Supporting documents are more varied than invoices themselves — a PO, a
// receipt, a signed approval — so the type list is broader.
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/tiff': 'tif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

// A settled invoice's supporting documents are settled too.
const LOCKED_STATUSES = new Set(['approved', 'rejected']);

// --------------------------------------------------------------------------
// GET  /api/invoices/{id}/supplemental   list
// POST /api/invoices/{id}/supplemental   attach
// --------------------------------------------------------------------------
app.http('invoice-supplemental', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/supplemental',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async ({ req }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing invoice id');
        return ok({ attachments: await attachments.list(id) });
      },
    },

    POST: {
      roles: Roles.reviewer,
      handler: async ({ req, user, log }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing invoice id');

        const invoice = await invoices.getById(id);
        if (!invoice) throw AppError.notFound('Invoice not found');
        if (LOCKED_STATUSES.has(invoice.status)) {
          throw AppError.conflict(
            'This invoice is closed; supplemental documents cannot be added.'
          );
        }

        const form = await req.formData().catch(() => {
          throw AppError.validation('Expected a multipart/form-data upload');
        });
        const file = form.get('file');
        if (!file || typeof file === 'string') {
          throw AppError.validation('No file was included in the upload');
        }

        const contentType = file.type || 'application/octet-stream';
        if (!ALLOWED_TYPES[contentType]) {
          throw AppError.validation(
            `Unsupported file type "${contentType}". Allowed: PDF, image, Word, Excel.`
          );
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.length === 0) throw AppError.validation('The uploaded file is empty');
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
          throw AppError.validation('File exceeds the 20 MB limit');
        }

        const filename = (file as File).name || 'attachment';
        const blobPath = buildBlobPath(filename, randomUUID());
        await uploadBlob(blobPath, bytes, contentType);

        const row = await attachments.add({
          invoiceId: id,
          blobPath,
          originalFilename: filename,
          contentType,
          bytes: bytes.length,
          uploadedBy: user.id,
        });

        await recordAudit({
          entityType: 'invoice',
          entityId: id,
          action: 'supplemental_added',
          userId: user.id,
          metadata: { filename, bytes: bytes.length },
        });

        log.info('Supplemental document attached', { invoiceId: id, attachmentId: row.id });

        // The updated count so the caller can refresh its badge without a
        // second request.
        const all = await attachments.list(id);
        return ok({ attachment: row, supplementalCount: all.length });
      },
    },
  }),
});

// --------------------------------------------------------------------------
// GET    /api/invoices/{id}/supplemental/{attId}/file   view URL
// DELETE /api/invoices/{id}/supplemental/{attId}        remove
// --------------------------------------------------------------------------
app.http('invoice-supplemental-file', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/supplemental/{attId}/file',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const attId = req.params['attId'];
    if (!attId) throw AppError.validation('Missing attachment id');

    const row = await attachments.getById(attId);
    if (!row) throw AppError.notFound('Attachment not found');

    const url = await getReadUrl(row.blob_path, 15);
    return ok({ url, expiresInMinutes: 15, filename: row.original_filename });
  }),
});

app.http('invoice-supplemental-delete', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/supplemental/{attId}',
  handler: createHandler({ roles: Roles.reviewer }, async ({ req, user, log }) => {
    const id = req.params['id'];
    const attId = req.params['attId'];
    if (!id || !attId) throw AppError.validation('Missing id');

    const invoice = await invoices.getById(id);
    if (!invoice) throw AppError.notFound('Invoice not found');
    if (LOCKED_STATUSES.has(invoice.status)) {
      throw AppError.conflict('This invoice is closed; attachments cannot be removed.');
    }

    const blobPath = await attachments.remove(attId);
    if (!blobPath) throw AppError.notFound('Attachment not found');

    await deleteBlob(blobPath).catch(() => undefined);
    await recordAudit({
      entityType: 'invoice',
      entityId: id,
      action: 'supplemental_removed',
      userId: user.id,
      metadata: { attachmentId: attId },
    });

    log.info('Supplemental document removed', { invoiceId: id, attachmentId: attId });
    return ok({ ok: true });
  }),
});

export {};
