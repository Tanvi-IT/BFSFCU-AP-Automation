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
  /** Raw OCR text — needed to correct date-label swaps in stage 2. */
  rawText: string;
}

export interface ExtractedLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

const POLL_INTERVAL_MS = 2_000;
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
      const total = num(f['InvoiceTotal']);
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
