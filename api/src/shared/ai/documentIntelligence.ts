/**
 * Azure Document Intelligence — invoice extraction (stage 1).
 *
 * Uses the `prebuilt-invoice` model. The API is asynchronous: submit, then
 * poll the Operation-Location header until it succeeds.
 *
 * Polling here is safe because this runs in the queue worker — no user is
 * waiting on the request. In the old system this ran inside the HTTP request,
 * which is why uploads blocked for up to a minute.
 */

import { config } from '../config';
import { docIntelAuthHeaders } from './credential';
import { AppError } from '../errors';

/**
 * What the document is. Only `invoice` is a payable invoice; `credit_memo` and
 * `non_invoice` are parked for a human to view, not run through the AI data
 * stage. `non_invoice` is the catch-all for recognisable non-invoice documents
 * (purchase orders, statements, remittance advices, etc.).
 */
export type DocumentType = 'invoice' | 'credit_memo' | 'non_invoice';

export interface ExtractedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotalAmount: number | null;
  taxAmount: number | null;
  totalAmount: number;
  vendorName: string | null;
  vendorTaxId: string | null;
  lineItems: ExtractedLineItem[];
  /**
   * Invoice vs. credit memo, decided from the OCR result (see
   * `classifyDocumentType`). The worker parks credit memos in their own list
   * and skips the AI data stage for them.
   */
  documentType: DocumentType;
  /** Raw OCR text — needed to correct date-label swaps in stage 2. */
  rawText: string;
}

/** Titles a credit memo announces itself with. Matched case-insensitively. */
const CREDIT_MEMO_PATTERNS: readonly RegExp[] = [
  /credit\s*memo(?:randum)?/i,
  /credit\s*note/i,
];

/**
 * Strong signals that a document IS a payable invoice. Checked BEFORE the
 * non-invoice titles below, so a real invoice that merely references a PO
 * number or a statement is never diverted into the non-invoice bucket.
 */
const INVOICE_PATTERNS: readonly RegExp[] = [
  /\btax\s+invoice\b/i,
  /\binvoice\b/i,
  /\bamount\s+due\b/i,
  /\binvoice\s*(?:number|no\.?|#)/i,
];

/**
 * Titles of documents that are NOT payable invoices. Positive matches only —
 * these are document titles (not incidental references), and they are only
 * consulted after the invoice check above fails.
 */
const NON_INVOICE_PATTERNS: readonly RegExp[] = [
  /\bpurchase\s*order\b/i,
  /\bsales\s+order\b/i,
  /\bwork\s+order\b/i,
  /\bstatement\s+of\s+account\b/i,
  /\baccount\s+statement\b/i,
  /\bremittance\s+advice\b/i,
  /\bpacking\s*(?:slip|list)\b/i,
  /\bdelivery\s*(?:note|order)\b/i,
  /\bpurchase\s+agreement\b/i,
  /\bquotation\b/i,
  /\bform\s+w-?9\b/i,
];

/**
 * Classify the document from its OCR text — the same lightweight keyword scan
 * used for credit memos, extended to a `non_invoice` catch-all:
 *
 *   1. a CREDIT MEMO (credit note / memorandum),
 *   2. otherwise a payable INVOICE (matched positively, so it wins over a
 *      referenced PO / statement),
 *   3. otherwise a recognisable NON-INVOICE document (PO, statement, quote…),
 *   4. otherwise defaults to INVOICE — never park a document we can't place,
 *      since the core flow is invoice processing.
 *
 * The `prebuilt-invoice` model labels everything `docType: "invoice"`, so we
 * read the text ourselves. Only the header region (first ~1500 chars, where a
 * document states what it is) is examined. Deliberately simple and no-extra-AI,
 * isolated here so it can be upgraded to a trained classifier without touching
 * the worker.
 */
export function classifyDocumentType(rawText: string): DocumentType {
  const header = (rawText ?? '').slice(0, 1500);
  for (const pattern of CREDIT_MEMO_PATTERNS) {
    if (pattern.test(header)) return 'credit_memo';
  }
  for (const pattern of INVOICE_PATTERNS) {
    if (pattern.test(header)) return 'invoice';
  }
  for (const pattern of NON_INVOICE_PATTERNS) {
    if (pattern.test(header)) return 'non_invoice';
  }
  return 'invoice';
}

export interface ExtractedLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

// First poll after 800ms, then every 800ms. Document Intelligence usually
// finishes a single invoice in 2–4s, so a shorter interval shaves a second or
// two off perceived latency without hammering the service.
const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 120_000;

interface DocIntelField {
  content?: string;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencyCode?: string };
  valueArray?: Array<{ valueObject?: Record<string, DocIntelField> }>;
}

function str(field: DocIntelField | undefined): string | null {
  if (!field) return null;
  const value = field.valueString ?? field.content ?? null;
  return value && value.trim() !== '' ? value.trim() : null;
}

function num(field: DocIntelField | undefined): number | null {
  if (!field) return null;
  if (field.valueCurrency?.amount !== undefined) return field.valueCurrency.amount;
  if (field.valueNumber !== undefined) return field.valueNumber;
  return null;
}

function date(field: DocIntelField | undefined): string | null {
  if (!field) return null;
  return field.valueDate ?? (field.content ? field.content.trim() : null);
}

function mapLineItems(items: DocIntelField | undefined): ExtractedLineItem[] {
  if (!items?.valueArray) return [];

  const out: ExtractedLineItem[] = [];
  for (const entry of items.valueArray) {
    const obj = entry.valueObject;
    if (!obj) continue;
    out.push({
      description: str(obj['Description']) ?? 'Item',
      quantity: num(obj['Quantity']),
      unitPrice: num(obj['UnitPrice']),
      lineTotal: num(obj['Amount']),
    });
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extract invoice fields from a PDF or image.
 * Throws AppError.upstream on any failure — the worker decides whether to retry.
 */
export async function analyzeInvoice(file: Buffer): Promise<ExtractedInvoice> {
  const endpoint = config.ai.docIntelEndpoint.replace(/\/$/, '');
  const url =
    `${endpoint}/documentintelligence/documentModels/prebuilt-invoice:analyze` +
    `?api-version=${config.ai.docIntelApiVersion}`;

  const headers = {
    ...(await docIntelAuthHeaders()),
    'Content-Type': 'application/json',
  };

  const submit = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base64Source: file.toString('base64') }),
  });

  if (!submit.ok) {
    const detail = await submit.text().catch(() => '');
    throw AppError.upstream(
      `Document Intelligence rejected the document (${submit.status}): ${detail.slice(0, 300)}`
    );
  }

  const operationUrl = submit.headers.get('operation-location');
  if (!operationUrl) {
    throw AppError.upstream('Document Intelligence did not return an Operation-Location header');
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await fetch(operationUrl, { headers: await docIntelAuthHeaders() });
    if (!poll.ok) {
      // Transient poll failures are worth one more loop, not an immediate abort.
      continue;
    }

    const body = (await poll.json()) as {
      status?: string;
      error?: { message?: string };
      analyzeResult?: {
        content?: string;
        documents?: Array<{ fields?: Record<string, DocIntelField> }>;
      };
    };

    if (body.status === 'succeeded') {
      const doc = body.analyzeResult?.documents?.[0];
      if (!doc?.fields) {
        throw AppError.upstream('Document Intelligence returned no recognisable invoice');
      }

      const f = doc.fields;
      const subtotal = num(f['SubTotal']);
      const tax = num(f['TotalTax']);
      // "Amount Due" / "Balance Due" carries the payable figure when a document
      // has no explicit "Invoice Total" line.
      const total = num(f['InvoiceTotal']) ?? num(f['AmountDue']);
      const lineItems = mapLineItems(f['Items']);

      // Fall back through subtotal+tax, then line-item sum, before giving up.
      const resolvedTotal =
        total ??
        (subtotal !== null ? subtotal + (tax ?? 0) : null) ??
        (lineItems.length > 0
          ? lineItems.reduce((sum, li) => sum + (li.lineTotal ?? 0), 0)
          : 0);

      return {
        invoiceNumber: str(f['InvoiceId']) ?? str(f['VendorInvoiceId']),
        invoiceDate: date(f['InvoiceDate']),
        dueDate: date(f['DueDate']),
        // All invoices are USD regardless of vendor country.
        currency: 'USD',
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: resolvedTotal,
        vendorName: str(f['VendorName']),
        vendorTaxId: str(f['VendorTaxId']),
        lineItems,
        documentType: classifyDocumentType(body.analyzeResult?.content ?? ''),
        rawText: body.analyzeResult?.content ?? '',
      };
    }

    if (body.status === 'failed') {
      throw AppError.upstream(
        `Document extraction failed: ${body.error?.message ?? 'unknown error'}`
      );
    }
    // status is running / notStarted — keep polling.
  }

  throw AppError.upstream('Document Intelligence timed out');
}
