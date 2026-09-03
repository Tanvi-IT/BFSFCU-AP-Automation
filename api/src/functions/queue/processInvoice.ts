/**
 * Invoice processing worker.
 *
 * Triggered by a queue message, so nothing here blocks a user request. On an
 * unhandled throw the host returns the message to the queue and retries; after
 * `maxDequeueCount` (5) it lands in the poison queue for a human to inspect.
 *
 * Two stages, chosen per job:
 *   • split   — (only when a classifier is configured, and only for the initial
 *               upload job) classify the file, and if it holds several invoices
 *               cut it into per-invoice pieces and enqueue one extract job each.
 *   • extract — download → Document Intelligence → Azure OpenAI (non-blocking)
 *               → vendor match → duplicate check → write.
 *
 * With no classifier configured, every job runs the extract stage exactly as
 * before — the split feature is entirely inert.
 */

import { app, type InvocationContext } from '@azure/functions';
import { createHash, randomUUID } from 'node:crypto';
import { parseInvoiceJob, enqueueInvoiceJob, type InvoiceJob } from '../../shared/queue';
import { downloadBlob, uploadBlob, buildBlobPath } from '../../shared/blob';
import { analyzeInvoice } from '../../shared/ai/documentIntelligence';
import { normalizeInvoice } from '../../shared/ai/openai';
import {
  classifyAndSplit,
  classifierEnabled,
  isInvoiceClass,
} from '../../shared/ai/documentClassifier';
import { resolveVendor } from '../../shared/pipeline/vendorMatch';
import { detectDuplicate } from '../../shared/pipeline/duplicateCheck';
import { routeInvoice } from '../../shared/pipeline/routing';
import { saveProcessedInvoice, saveCreditMemo } from '../../shared/pipeline/persist';
import { keepPageRange } from '../../shared/pdf';
import * as invoices from '../../shared/repository/invoices';
import { recordAudit } from '../../shared/repository/activity';
import { createLogger, type Logger } from '../../shared/logger';
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

/** Insert a " (n)" part number before the file extension, to tell splits apart. */
function suffixName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}

/**
 * Split stage: classify the file and, when it holds more than one invoice, cut
 * it into per-invoice pieces and enqueue an extract job for each. Runs only for
 * the initial upload job and only when a classifier is configured.
 *
 * The first piece reuses the uploaded row; the rest become new rows. Every
 * piece is then processed by the ordinary extract stage, so extraction itself
 * is unchanged. If the classifier is unavailable, or finds one invoice (or
 * none), the whole file is extracted as a single document — nothing is lost.
 */
async function splitStage(job: InvoiceJob, invoiceLog: Logger): Promise<void> {
  await invoices.setStatus(job.invoiceId, 'processing');
  const file = await downloadBlob(job.blobPath);

  let segments;
  try {
    segments = await classifyAndSplit(file);
  } catch (err) {
    invoiceLog.warn('Classifier unavailable; extracting the whole file as one invoice', {
      error: err instanceof Error ? err.message : String(err),
    });
    return extractInvoice(job, invoiceLog);
  }

  const invoiceSegments = segments.filter((s) => isInvoiceClass(s.docType));
  invoiceLog.info('Classifier split complete', {
    documents: segments.length,
    invoices: invoiceSegments.length,
    ranges: invoiceSegments.map((s) => `${s.startPage}-${s.endPage}`),
  });

  // 0 or 1 invoice → nothing to split; process the whole file in place.
  if (invoiceSegments.length <= 1) {
    return extractInvoice(job, invoiceLog);
  }

  const ingest = await invoices.ingestInfo(job.invoiceId);
  const baseName = ingest?.original_filename ?? 'invoice.pdf';
  const submittedBy = ingest?.submitted_by ?? null;
  if (!submittedBy) {
    // Every upload records its submitter; if somehow absent we can't own the
    // new rows, so fall back to whole-file extraction rather than orphan them.
    invoiceLog.warn('Split source has no submitter; extracting the whole file instead');
    return extractInvoice(job, invoiceLog);
  }

  for (const [i, seg] of invoiceSegments.entries()) {
    const part = i + 1;
    const sub = await keepPageRange(file, seg.startPage, seg.endPage);
    const fileHash = createHash('sha256').update(sub).digest('hex');
    const name = suffixName(baseName, part);
    const blobPath = buildBlobPath(name, randomUUID());
    await uploadBlob(blobPath, sub, 'application/pdf');

    // First piece reuses the uploaded row; the rest become new rows.
    let childId: string;
    if (i === 0) {
      await invoices.repointToSplit(job.invoiceId, blobPath, fileHash, name);
      childId = job.invoiceId;
    } else {
      const created = await invoices.createQueued({
        blobPath,
        fileHash,
        originalFilename: name,
        source: job.source,
        submittedBy,
      });
      childId = created.id;
    }

    await enqueueInvoiceJob({
      invoiceId: childId,
      blobPath,
      fileHash,
      source: job.source,
      stage: 'extract',
    });
    await recordAudit({
      entityType: 'invoice',
      entityId: childId,
      action: 'split_from_bundle',
      userId: submittedBy,
      metadata: {
        part,
        of: invoiceSegments.length,
        pages: [seg.startPage, seg.endPage],
        confidence: seg.confidence,
        sourceInvoiceId: job.invoiceId,
      },
    });
  }

  invoiceLog.info('Bundle split into invoices', { count: invoiceSegments.length });
}

/**
 * Extract stage: the full single-document pipeline. Runs for an `extract` job,
 * for every job when no classifier is configured, and for a single-invoice file
 * detected by the split stage.
 */
async function extractInvoice(job: InvoiceJob, invoiceLog: Logger): Promise<void> {
  await invoices.setStatus(job.invoiceId, 'processing');

  // 1. Fetch the document.
  const file = await downloadBlob(job.blobPath);

  // 2. Extract (required — a failure here fails the invoice).
  const extracted = await analyzeInvoice(file);
  invoiceLog.info('Extraction complete', {
    invoiceNumber: extracted.invoiceNumber,
    lineItems: extracted.lineItems.length,
    documentType: extracted.documentType,
  });

  // 2b. Classify. A credit memo is not a payable invoice: tag it and park it
  //     in the Credit Memo list for a human to view. No fields are extracted
  //     for now — the AI data stage, vendor matching, duplicate detection and
  //     routing are all skipped.
  if (extracted.documentType === 'credit_memo') {
    invoiceLog.info('Classified as credit memo; skipping AI data stage', {
      documentNumber: extracted.invoiceNumber,
    });
    await saveCreditMemo({ invoiceId: job.invoiceId });
    invoiceLog.info('Credit memo stored');
    return;
  }

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
    invoiceLog.info('Processing started', { source: job.source, stage: job.stage ?? 'initial' });

    try {
      // The initial upload job runs the split stage when a classifier is
      // configured; an `extract` job (or any job with no classifier) runs the
      // ordinary extraction pipeline.
      if (job.stage !== 'extract' && classifierEnabled()) {
        await splitStage(job, invoiceLog);
      } else {
        await extractInvoice(job, invoiceLog);
      }
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
