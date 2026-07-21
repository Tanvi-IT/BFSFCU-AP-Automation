/**
 * Invoice processing worker.
 *
 * Triggered by a queue message, so nothing here blocks a user request. On an
 * unhandled throw the host returns the message to the queue and retries; after
 * `maxDequeueCount` (5) it lands in the poison queue for a human to inspect.
 *
 * Pipeline:
 *   download → Document Intelligence → Azure OpenAI (non-blocking)
 *            → vendor match (SQL first, AI last) → duplicate check → write
 */

import { app, type InvocationContext } from '@azure/functions';
import { parseInvoiceJob, type InvoiceJob } from '../../shared/queue';
import { downloadBlob } from '../../shared/blob';
import { analyzeInvoice } from '../../shared/ai/documentIntelligence';
import { normalizeInvoice } from '../../shared/ai/openai';
import { resolveVendor } from '../../shared/pipeline/vendorMatch';
import { detectDuplicate } from '../../shared/pipeline/duplicateCheck';
import { routeInvoice } from '../../shared/pipeline/routing';
import { saveProcessedInvoice } from '../../shared/pipeline/persist';
import * as invoices from '../../shared/repository/invoices';
import { createLogger } from '../../shared/logger';

app.storageQueue('process-invoice', {
  queueName: '%QUEUE_NAME%',
  connection: 'AzureWebJobsStorage',
  handler: async (message: unknown, context: InvocationContext) => {
    const log = createLogger(context);
    let job: InvoiceJob;

    try {
      job = parseInvoiceJob(message);
    } catch (err) {
      // Unparseable message: throwing would retry forever, so drop it here.
      log.error('Discarding unparseable queue message', err);
      return;
    }

    const invoiceLog = log.child({ invoiceId: job.invoiceId });
    invoiceLog.info('Processing started', { source: job.source });

    try {
      await invoices.setStatus(job.invoiceId, 'processing');

      // 1. Fetch the document.
      const file = await downloadBlob(job.blobPath);

      // 2. Extract (required — a failure here fails the invoice).
      const extracted = await analyzeInvoice(file);
      invoiceLog.info('Extraction complete', {
        invoiceNumber: extracted.invoiceNumber,
        lineItems: extracted.lineItems.length,
      });

      // 3. Normalise (non-blocking — never lose an invoice to a reasoning failure).
      const normalized = await normalizeInvoice(extracted);
      if (!normalized) {
        invoiceLog.warn('Normalisation unavailable; continuing with raw extraction');
      }

      const invoiceNumber = normalized?.invoiceNumber ?? extracted.invoiceNumber;
      const vendorName = normalized?.vendorName ?? extracted.vendorName;
      const totalAmount = normalized?.totalAmount ?? extracted.totalAmount;

      // 4. Vendor: exact identifiers → trigram similarity → AI as last resort.
      const vendor = await resolveVendor({
        name: vendorName,
        taxId: extracted.vendorTaxId,
        bankAccount: null,
      });

      // 5. Duplicates.
      const duplicate = await detectDuplicate({
        invoiceId: job.invoiceId,
        vendorId: vendor.id,
        invoiceNumber,
        totalAmount,
        invoiceDate: normalized?.invoiceDate ?? extracted.invoiceDate,
      });

      // 6. Route to a queue based on confidence, flags and vendor standing.
      const routing = routeInvoice({
        confidence: normalized?.confidence ?? 0.5,
        flags: normalized?.flags ?? [],
        duplicate,
        isNewVendor: vendor.created,
        vendorActive: vendor.status === 'active',
        hasVendorName: Boolean(vendorName),
      });

      // 7. Persist everything in one transaction.
      await saveProcessedInvoice({
        invoiceId: job.invoiceId,
        vendorId: vendor.id,
        invoiceNumber,
        invoiceDate: normalized?.invoiceDate ?? extracted.invoiceDate,
        dueDate: normalized?.dueDate ?? extracted.dueDate,
        currency: extracted.currency,
        subtotalAmount: extracted.subtotalAmount,
        taxAmount: extracted.taxAmount,
        totalAmount,
        lineItems: extracted.lineItems,
        status: routing.status,
        riskLevel: routing.riskLevel,
        confidence: normalized?.confidence ?? null,
        flags: routing.flags,
        duplicate,
        extractionRaw: { rawTextLength: extracted.rawText.length },
        normalizationRaw: normalized ? { ...normalized } : { unavailable: true },
      });

      invoiceLog.info('Processing complete', {
        status: routing.status,
        vendorId: vendor.id,
        duplicate: duplicate.type,
      });
    } catch (err) {
      invoiceLog.error('Processing failed', err);

      // Record the reason so the invoice is visible in the UI rather than
      // silently stuck in `processing`.
      await invoices
        .setStatus(
          job.invoiceId,
          'exception',
          err instanceof Error ? err.message : 'Unknown processing error'
        )
        .catch(() => undefined);

      // Rethrow so the host retries, then poison-queues after 5 attempts.
      throw err;
    }
  },
});
