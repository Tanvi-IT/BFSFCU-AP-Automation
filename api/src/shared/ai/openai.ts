/**
 * Azure OpenAI — normalisation and validation (stage 2).
 *
 * Non-blocking by design: if this fails, the invoice keeps the Document
 * Intelligence output and is flagged. A reasoning failure must never lose an
 * invoice.
 *
 * The old system had a Gemini fallback path against a third-party endpoint.
 * That is gone — Azure OpenAI is the only provider, with Managed Identity.
 */

import { config } from '../config';
import { openAiAuthHeaders } from './credential';
import type { ExtractedInvoice } from './documentIntelligence';
import type { Logger } from '../logger';

/**
 * The stage-2 contract. Every field is always present — never undefined — so
 * persistence and the UI can rely on the shape without per-field guards.
 *
 * Values are canonical by the time they leave this module:
 *   dates    `YYYY-MM-DD` or null (never a timestamp, never a locale format)
 *   amounts  finite number rounded to 2 decimals, or null
 *   currency uppercase ISO-4217, always present
 *   confidence  0..1 inclusive
 *   flags    deduplicated snake_case identifiers from FLAG_VALUES
 */
export interface NormalizedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotalAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  vendorName: string | null;
  vendorTaxId: string | null;
  poNumber: string | null;
  confidence: number;
  flags: string[];
}

/**
 * The flag vocabulary. Closed on purpose: the UI maps these to labels in
 * web/src/lib/invoiceReasons.ts, and a free-text flag would render as a raw
 * identifier. Anything the model returns outside this list is dropped.
 */
const FLAG_VALUES = [
  'date_swap_corrected',
  'due_date_missed_on_document',
  'due_date_before_invoice_date',
  'invoice_number_from_po',
  'invoice_number_missing',
  // Deliberately the same identifier routing.ts emits, not a synonym: two
  // flags meaning "no vendor name" would render as two separate reasons.
  'vendor_missing',
  'total_amount_missing',
  'total_mismatch',
  'tax_line_detected',
  'multiple_invoices_in_document',
  'non_invoice_document',
  'low_ocr_quality',
] as const;

/**
 * Strict JSON schema. With `strict: true` the model is *constrained* to this
 * shape rather than asked for it — the previous "Return ONLY valid JSON"
 * instruction was advisory, and a reasoning model that prefixed a sentence or
 * dropped a key produced a parse failure that this module swallowed silently.
 *
 * Strict mode requires every property listed in `required` (nullability is
 * expressed in the type union, not by omission) and `additionalProperties`
 * false. It does not support `pattern`/`minimum`, so value-level formats are
 * enforced in canonicalize() below.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'invoice_number',
    'invoice_date',
    'due_date',
    'currency',
    'subtotal_amount',
    'tax_amount',
    'total_amount',
    'vendor_name',
    'vendor_tax_id',
    'po_number',
    'confidence',
    'flags',
  ],
  properties: {
    invoice_number: { type: ['string', 'null'] },
    invoice_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    currency: { type: 'string', description: 'ISO-4217, uppercase' },
    subtotal_amount: { type: ['number', 'null'] },
    tax_amount: { type: ['number', 'null'] },
    total_amount: { type: ['number', 'null'] },
    vendor_name: { type: ['string', 'null'] },
    vendor_tax_id: { type: ['string', 'null'] },
    po_number: { type: ['string', 'null'] },
    confidence: { type: 'number', description: '0 to 1' },
    flags: { type: 'array', items: { type: 'string', enum: FLAG_VALUES } },
  },
} as const;

const SYSTEM_PROMPT = `You validate and normalise invoice data extracted by OCR.

Rules:
1. Dates are ALWAYS MM/DD/YYYY. 10/12/2024 is October 12 2024, never December 10.
   This applies to every vendor regardless of country.
2. invoice_date is when the invoice was issued and is ALWAYS earlier than due_date.
   If the two are reversed relative to their labels in the raw text, swap them and
   add "date_swap_corrected" to flags.
3. Never return a due_date earlier than or equal to invoice_date.
4. invoice_number must be the vendor's own invoice identifier (Invoice Number,
   Invoice No, Invoice #, Billing Reference). If the value looks like a PO or
   contract reference, search the raw text for a better one and add
   "invoice_number_from_po" if you must fall back to the PO. Put any purchase
   order reference in po_number, never in invoice_number.
5. Emit every date as YYYY-MM-DD with zero padding. No other format is accepted.
6. Amounts are plain numbers: no currency symbol, no thousands separator, a dot
   as the decimal mark, at most 2 decimals. currency is an uppercase ISO-4217
   code; use USD when the document does not state one.
7. subtotal_amount + tax_amount should equal total_amount. If they do not, keep
   the values as printed and add "total_mismatch" — never adjust a figure to
   make it balance.
8. confidence is your own certainty in the whole record, from 0 to 1.
9. Never invent a value. If a field is not clearly present, return null.
   For a regulated financial document, null is always better than a guess.
   Do not substitute an empty string, "N/A", or 0 for a missing value.`;

const MAX_RAW_TEXT = 3_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function stripCodeFence(text: string): string {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

/** A calendar date or nothing. Rejects timestamps and impossible dates alike. */
function asDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return null;

  // Round-trip through UTC to reject 2026-02-31 and friends, which the regex
  // happily accepts and Postgres would reject at insert time.
  const [y, m, d] = trimmed.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? trimmed : null;
}

/** A finite money amount at 2 decimals, or null. Never NaN, never Infinity. */
function asAmount(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : // A model told not to use separators may still send "1,234.50".
        typeof value === 'string'
        ? Number(value.replace(/[,\s$]/g, ''))
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Models reach for these instead of null despite being told not to.
  if (!trimmed || /^(n\/?a|none|unknown|null|-|—)$/i.test(trimmed)) return null;
  return trimmed;
}

async function chat(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  responseFormat?: Record<string, unknown>
) {
  const endpoint = config.ai.openAiEndpoint.replace(/\/$/, '');
  const url =
    `${endpoint}/openai/deployments/${config.ai.openAiDeployment}/chat/completions` +
    `?api-version=${config.ai.openAiApiVersion}`;

  // Reasoning deployments take max_completion_tokens and reject a non-default
  // temperature; gpt-4o-style ones take max_tokens and honour temperature 0,
  // which is what we want for deterministic extraction.
  const limits = config.ai.openAiReasoningModel
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens, temperature: 0 };

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...(await openAiAuthHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      ...limits,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure OpenAI error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? '';
}

/**
 * Force the model's reply into the fixed contract.
 *
 * The schema guarantees which keys arrive and their JSON types; this guarantees
 * the *values* are storable and renderable — a date the database will accept, a
 * number the UI can call toLocaleString on, a flag the label map knows. Belt and
 * braces on purpose: schema enforcement is a provider feature, and this module
 * must not emit a malformed record if that feature is ever unavailable.
 */
function canonicalize(parsed: Record<string, unknown>): NormalizedInvoice {
  const invoiceDate = asDate(parsed['invoice_date']);
  let dueDate = asDate(parsed['due_date']);

  const flags = new Set(
    (Array.isArray(parsed['flags']) ? parsed['flags'] : [])
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.trim().toLowerCase())
      .filter((f): f is (typeof FLAG_VALUES)[number] =>
        (FLAG_VALUES as readonly string[]).includes(f)
      )
  );

  // Rule 3 stated in the prompt, enforced here. A due date at or before the
  // invoice date is not a payable term; drop it rather than store a date that
  // would drive an incorrect payment schedule.
  if (invoiceDate && dueDate && dueDate <= invoiceDate) {
    flags.add('due_date_before_invoice_date');
    dueDate = null;
  }
  if (!dueDate) flags.add('due_date_missed_on_document');

  const currencyRaw = asText(parsed['currency']);
  const currency =
    currencyRaw && /^[A-Za-z]{3}$/.test(currencyRaw) ? currencyRaw.toUpperCase() : 'USD';

  const confidenceRaw = typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0;
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0;

  return {
    invoiceNumber: asText(parsed['invoice_number']),
    invoiceDate,
    dueDate,
    currency,
    subtotalAmount: asAmount(parsed['subtotal_amount']),
    taxAmount: asAmount(parsed['tax_amount']),
    totalAmount: asAmount(parsed['total_amount']),
    vendorName: asText(parsed['vendor_name']),
    vendorTaxId: asText(parsed['vendor_tax_id']),
    poNumber: asText(parsed['po_number']),
    confidence,
    flags: [...flags],
  };
}

/**
 * Normalise and validate extracted fields.
 *
 * Returns null on failure — the caller continues with the raw extraction, so a
 * reasoning outage never loses an invoice. Pass `log` to find out that happened:
 * this step failing is invisible in the data (the invoice simply keeps the OCR
 * values and no confidence score), so silence here reads exactly like success.
 */
export async function normalizeInvoice(
  extracted: ExtractedInvoice,
  log?: Logger
): Promise<NormalizedInvoice | null> {
  let content = '';
  try {
    const payload = {
      invoice_number: extracted.invoiceNumber,
      invoice_date: extracted.invoiceDate,
      due_date: extracted.dueDate,
      currency: extracted.currency,
      total_amount: extracted.totalAmount,
      subtotal_amount: extracted.subtotalAmount,
      tax_amount: extracted.taxAmount,
      vendor_name: extracted.vendorName,
      vendor_tax_id: extracted.vendorTaxId,
      line_items: extracted.lineItems,
    };

    content = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Extracted fields:\n${JSON.stringify(payload, null, 2)}\n\n` +
            `Raw document text (for verifying date labels):\n${extracted.rawText.slice(0, MAX_RAW_TEXT)}`,
        },
      ],
      1_500,
      {
        type: 'json_schema',
        json_schema: { name: 'normalized_invoice', strict: true, schema: RESPONSE_SCHEMA },
      }
    );

    const parsed = JSON.parse(stripCodeFence(content)) as Record<string, unknown>;
    return canonicalize(parsed);
  } catch (err) {
    log?.warn('Normalisation failed; keeping raw extraction', {
      reason: err instanceof Error ? err.message : String(err),
      // The reply itself is the only way to tell a refusal or a truncated
      // response from a transport error.
      replyPreview: content.slice(0, 200),
    });
    return null;
  }
}

/**
 * Disambiguate a vendor name against a shortlist.
 *
 * Called only when SQL similarity matching is inconclusive — never as the
 * first strategy. Returns an exact name from the candidate list, or null.
 */
export async function resolveVendorName(
  extractedName: string,
  candidates: readonly string[]
): Promise<string | null> {
  if (candidates.length === 0) return null;

  try {
    const content = await chat(
      [
        {
          role: 'user',
          content:
            `You match vendor names for an accounts payable system.\n` +
            `Return ONLY an exact name from the candidate list that is the same legal entity, ` +
            `or the word null. Do not guess; if uncertain, return null.\n\n` +
            `Extracted name: "${extractedName}"\n\nCandidates:\n${candidates.join('\n')}`,
        },
      ],
      60
    );

    const answer = content.trim();
    if (!answer || answer.toLowerCase() === 'null') return null;

    // Only trust an exact match against the shortlist we supplied.
    return candidates.find((c) => c === answer) ?? null;
  } catch {
    return null;
  }
}
