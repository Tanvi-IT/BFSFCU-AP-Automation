/**
 * Supplemental documents on an invoice.
 *
 *   GET  /api/invoices/{id}/supplemental                 list attachments
 *   POST /api/invoices/{id}/supplemental                 append a PDF's pages
 *   GET  /api/invoices/{id}/supplemental/{attId}/file    short-lived view URL
 *   DELETE /api/invoices/{id}/supplemental/{attId}       remove an attachment
 *
 * Attaching a supplemental document now APPENDS its pages to the bottom of the
 * invoice's own PDF, so a reviewer sees one continuous document. The uploaded
 * file must therefore be a PDF, and the invoice's stored document must be a PDF
 * too. A copy of each appended file is also kept as its own blob + row, so the
 * original is downloadable and the append history is auditable. Removing that
 * record deletes the copy; it does not un-append the pages already merged in.
 *
 * Appending is blocked once the invoice is approved or declined — its
 * supporting documents are then settled.
 */

import { app } from '@azure/functions';
import { PDFDocument } from 'pdf-lib';
import { createHandler, createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import {
  buildBlobPath,
  uploadBlob,
  downloadBlob,
  getReadUrl,
  deleteBlob,
} from '../../shared/blob';
import * as invoices from '../../shared/repository/invoices';
import * as attachments from '../../shared/repository/attachments';
import { recordAudit } from '../../shared/repository/activity';
import { randomUUID } from 'node:crypto';

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

// Pages are merged into the invoice PDF, so only PDFs can be appended.
function looksLikePdf(bytes: Buffer): boolean {
  // A PDF starts with "%PDF-" (some files carry a few leading bytes, so scan
  // the first 1 KB rather than requiring it at offset 0).
  return bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

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
        const filename = (file as File).name || 'attachment.pdf';

        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.length === 0) throw AppError.validation('The uploaded file is empty');
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
          throw AppError.validation('File exceeds the 20 MB limit');
        }

        // The pages are appended to the invoice PDF, so the upload must be a PDF.
        if (contentType !== 'application/pdf' && !looksLikePdf(bytes)) {
          throw AppError.validation(
            'Only PDF files can be appended to an invoice. Convert the document to PDF and try again.'
          );
        }

        // Merge the uploaded pages onto the end of the invoice's own PDF.
        const invoiceBlobPath = (invoice as { blob_path?: string }).blob_path;
        if (!invoiceBlobPath) {
          throw AppError.conflict('This invoice has no stored document to append to.');
        }
        const invoiceBytes = await downloadBlob(invoiceBlobPath);
        if (!looksLikePdf(invoiceBytes)) {
          throw AppError.conflict(
            'Pages can only be appended when the invoice document itself is a PDF.'
          );
        }

        let mergedBytes: Buffer;
        let pagesAppended: number;
        try {
          const target = await PDFDocument.load(invoiceBytes, { ignoreEncryption: true });
          const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copied = await target.copyPages(source, source.getPageIndices());
          copied.forEach((p) => target.addPage(p));
          pagesAppended = copied.length;
          mergedBytes = Buffer.from(await target.save());
        } catch (err) {
          log.error('Failed to merge supplemental PDF', { invoiceId: id, error: String(err) });
          throw AppError.validation(
            'The uploaded PDF could not be read. It may be corrupt or password-protected.'
          );
        }

        // Overwrite the invoice document in place (same blob path) so every
        // existing viewer/link now returns the combined document.
        await uploadBlob(invoiceBlobPath, mergedBytes, 'application/pdf');

        // Keep a copy of exactly what was appended, so the original is
        // downloadable and the append history is visible.
        const blobPath = buildBlobPath(filename, randomUUID());
        await uploadBlob(blobPath, bytes, 'application/pdf');

        const row = await attachments.add({
          invoiceId: id,
          blobPath,
          originalFilename: filename,
          contentType: 'application/pdf',
          bytes: bytes.length,
          uploadedBy: user.id,
        });

        await recordAudit({
          entityType: 'invoice',
          entityId: id,
          action: 'supplemental_added',
          userId: user.id,
          metadata: { filename, bytes: bytes.length, pagesAppended, mergedIntoInvoice: true },
        });

        log.info('Supplemental PDF appended to invoice', {
          invoiceId: id,
          attachmentId: row.id,
          pagesAppended,
        });

        // The updated count so the caller can refresh its badge without a
        // second request.
        const all = await attachments.list(id);
        return ok({
          attachment: row,
          supplementalCount: all.length,
          pagesAppended,
          invoicePdfUpdated: true,
        });
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
