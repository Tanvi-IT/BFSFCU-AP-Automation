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

export interface NormalizedInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: number | null;
  vendorName: string | null;
  confidence: number;
  flags: string[];
}

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
   contract reference, search the raw text for a better one. Use a PO only as a
   last resort.
5. Normalise dates to YYYY-MM-DD.
6. Never invent a value. If a field is not clearly present, return null.
   For a regulated financial document, null is always better than a guess.

Return ONLY valid JSON:
{
  "invoice_number": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "due_date": "YYYY-MM-DD"|null,
  "total_amount": number|null,
  "vendor_name": string|null,
  "confidence": number,
  "flags": string[]
}`;

const MAX_RAW_TEXT = 3_000;

function stripCodeFence(text: string): string {
  return text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

async function chat(messages: Array<{ role: string; content: string }>, maxTokens: number) {
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
    body: JSON.stringify({ messages, ...limits }),
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
 * Normalise and validate extracted fields.
 * Returns null on any failure — the caller continues with the raw extraction.
 */
export async function normalizeInvoice(
  extracted: ExtractedInvoice
): Promise<NormalizedInvoice | null> {
  try {
    const payload = {
      invoice_number: extracted.invoiceNumber,
      invoice_date: extracted.invoiceDate,
      due_date: extracted.dueDate,
      total_amount: extracted.totalAmount,
      subtotal_amount: extracted.subtotalAmount,
      tax_amount: extracted.taxAmount,
      vendor_name: extracted.vendorName,
      line_items: extracted.lineItems,
    };

    const content = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `Extracted fields:\n${JSON.stringify(payload, null, 2)}\n\n` +
            `Raw document text (for verifying date labels):\n${extracted.rawText.slice(0, MAX_RAW_TEXT)}`,
        },
      ],
      1_500
    );

    const parsed = JSON.parse(stripCodeFence(content)) as Record<string, unknown>;

    return {
      invoiceNumber: typeof parsed['invoice_number'] === 'string' ? parsed['invoice_number'] : null,
      invoiceDate: typeof parsed['invoice_date'] === 'string' ? parsed['invoice_date'] : null,
      dueDate: typeof parsed['due_date'] === 'string' ? parsed['due_date'] : null,
      totalAmount: typeof parsed['total_amount'] === 'number' ? parsed['total_amount'] : null,
      vendorName: typeof parsed['vendor_name'] === 'string' ? parsed['vendor_name'] : null,
      confidence: typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0,
      flags: Array.isArray(parsed['flags'])
        ? (parsed['flags'] as unknown[]).filter((f): f is string => typeof f === 'string')
        : [],
    };
  } catch {
    // Non-blocking: the caller falls back to the Document Intelligence result.
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
