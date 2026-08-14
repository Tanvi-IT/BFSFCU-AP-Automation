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
import { config } from '../../shared/config';

/** The reasoning deployment, shown as provenance on each processed invoice. */
const AOAI_MODEL = config.ai.openAiDeployment;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Default term when an invoice states no due date. */
const DEFAULT_DUE_DATE_DAYS = 30;

/** Add whole calendar days to a YYYY-MM-DD date, in UTC to avoid DST drift. */
function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

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
      const normalized = await normalizeInvoice(extracted, invoiceLog);
      if (!normalized) {
        invoiceLog.warn('Normalisation unavailable; continuing with raw extraction');
      }

      // Stage 2 returns the canonical form of every stored field, so prefer it
      // throughout and fall back to the raw OCR value field by field.
      const invoiceNumber = normalized?.invoiceNumber ?? extracted.invoiceNumber;
      const vendorName = normalized?.vendorName ?? extracted.vendorName;
      const totalAmount = normalized?.totalAmount ?? extracted.totalAmount;
      const currency = normalized?.currency ?? extracted.currency;
      const subtotalAmount = normalized?.subtotalAmount ?? extracted.subtotalAmount;
      const taxAmount = normalized?.taxAmount ?? extracted.taxAmount;
      const vendorTaxId = normalized?.vendorTaxId ?? extracted.vendorTaxId;

      // 4. Vendor: exact identifiers → trigram similarity → AI as last resort.
      //    Matching only — vendors are created solely by an admin's spreadsheet
      //    import, so an unknown payee lands in Low Confidence for review rather
      //    than becoming a new vendor record.
      const vendor = await resolveVendor({
        name: vendorName,
        taxId: vendorTaxId,
        bankAccount: null,
      });
      if (!vendor.id) {
        invoiceLog.warn('Vendor not on the master list; routing to Low Confidence', {
          extractedName: vendorName,
        });
      }

      // 5. Duplicates.
      const duplicate = await detectDuplicate({
        invoiceId: job.invoiceId,
        // Exact re-upload guard: identical bytes are a duplicate even when the
        // number/vendor come out empty or inconsistent between uploads.
        fileHash: job.fileHash,
        vendorId: vendor.id,
        // The name stored on the invoice; lets re-uploads of an unmatched
        // vendor's invoice still be recognised as duplicates.
        vendorName: vendor.name ?? vendorName ?? null,
        invoiceNumber,
        totalAmount,
        invoiceDate: normalized?.invoiceDate ?? extracted.invoiceDate,
      });

      // 5b. Tax. The organisation is tax-exempt, so a tax *amount* on an invoice
      //     is a review reason. Keyed on the amount only — the model's
      //     `tax_line_detected` is advisory and fires on a $0 tax line, which
      //     must not flag an otherwise-clean invoice. The flag in variation_flags
      //     is reconciled to match the amount so the two never disagree.
      const taxFlagged = taxAmount !== null && taxAmount > 0;
      const taxFlagReason = taxFlagged
        ? 'Tax line detected — organisation is tax-exempt.'
        : null;

      // 5c. Due date. When the document states none, default it to the invoice
      //     date plus a standard term. This is a minor, expected fill-in — not a
      //     review reason — so the invoice can still reach High Confidence; the
      //     UI marks the date as system-calculated via due_date_defaulted.
      const invoiceDate = normalized?.invoiceDate ?? extracted.invoiceDate;
      const rawDueDate = normalized?.dueDate ?? extracted.dueDate;
      let dueDate = rawDueDate;
      let dueDateDefaulted = false;
      let dueDateDefaultSource: string | null = null;
      if (!dueDate && invoiceDate && ISO_DATE.test(invoiceDate)) {
        dueDate = addCalendarDays(invoiceDate, DEFAULT_DUE_DATE_DAYS);
        dueDateDefaulted = true;
        dueDateDefaultSource = 'invoice_date';
      }

      // Reconcile the tax flag, and drop the "due date missing" flag once it has
      // been defaulted — the due_date_defaulted column now carries that state.
      let flags = (normalized?.flags ?? []).filter(
        (f) => f !== 'tax_line_detected' && !(dueDateDefaulted && f === 'due_date_missed_on_document')
      );
      if (taxFlagged) flags = [...flags, 'tax_line_detected'];

      // 5d. GL coding: inherit this vendor's last coded invoice (approved first,
      //     then validated/submitted) so a new upload arrives already coded.
      //     persist.ts only fills blanks, so this never overwrites real coding.
      const inheritedCoding = await invoices
        .lastCodingForVendor(vendor.id, vendor.name ?? vendorName ?? null, job.invoiceId)
        .catch(() => undefined);
      if (inheritedCoding) {
        invoiceLog.info('Inheriting GL coding from vendor history', {
          glCode: inheritedCoding.gl_code,
          glApprover: inheritedCoding.gl_approver,
        });
      }

      // 6. Route to a queue based on confidence, flags and vendor standing.
      const routing = routeInvoice({
        confidence: normalized?.confidence ?? 0.5,
        flags,
        duplicate,
        vendorUnmatched: vendor.id === null,
        vendorActive: vendor.status === 'active',
        hasVendorName: Boolean(vendorName),
      });

      // 7. Persist everything in one transaction.
      await saveProcessedInvoice({
        invoiceId: job.invoiceId,
        vendorId: vendor.id,
        // Snapshot the matched vendor. Falls back to the extracted name so an
        // unmatched invoice still shows who it appears to be from.
        vendorName: vendor.name ?? vendorName ?? null,
        invoiceNumber,
        invoiceDate,
        dueDate,
        dueDateDefaulted,
        dueDateDefaultSource,
        currency,
        subtotalAmount,
        taxAmount,
        totalAmount,
        // ACH read off the document by stage 2; persist.ts falls back to the
        // matched vendor's details when the document has none.
        achRoutingNumber: normalized?.achRoutingNumber ?? null,
        achAccountNumber: normalized?.achAccountNumber ?? null,
        glCode: inheritedCoding?.gl_code ?? null,
        glApprover: inheritedCoding?.gl_approver ?? null,
        lineItems: extracted.lineItems,
        status: routing.status,
        riskLevel: routing.riskLevel,
        confidence: normalized?.confidence ?? null,
        flags: routing.flags,
        taxFlagged,
        taxFlagReason,
        // Provenance: Document Intelligence always ran; the reasoning model only
        // when normalisation succeeded (it is non-blocking).
        extractionProvider: 'Azure Document Intelligence',
        reasoningProvider: normalized ? `Azure OpenAI (${AOAI_MODEL})` : null,
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

      // How many times this message has been delivered. The host retries a
      // throwing handler up to maxDequeueCount (host.json → queues), so while
      // attempts remain we simply rethrow and let it try again. The invoice
      // stays `processing` in the meantime — moving it to Low Confidence on
      // every failed attempt would make it flicker in and out of the queue.
      const MAX_DEQUEUE = 5;
      const dequeueCount = Number(
        (context.triggerMetadata as Record<string, unknown> | undefined)?.['dequeueCount'] ?? 1
      );

      if (Number.isFinite(dequeueCount) && dequeueCount < MAX_DEQUEUE) {
        throw err; // retry
      }

      // Retries exhausted. Land it in Low Confidence for review — never
      // Exception, which is a user-only queue — with the reason attached, and
      // consume the message (return, no rethrow) so it does not also
      // poison-queue.
      invoiceLog.warn('Extraction failed after retries; routing to Low Confidence', {
        dequeueCount,
      });
      await invoices
        .markProcessingFailed(
          job.invoiceId,
          err instanceof Error ? err.message : 'Unknown processing error'
        )
        .catch(() => undefined);
    }
  },
});
