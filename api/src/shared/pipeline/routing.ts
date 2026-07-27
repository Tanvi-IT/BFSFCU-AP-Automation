/**
 * Queue routing — decides where a processed invoice lands.
 *
 *   validated  → Low Confidence: a human should look at it
 *   submitted  → High Confidence: clean, ready for approval
 *
 * Automatic routing never selects Exception. Exception is a user-managed queue:
 * a reviewer escalates into it, and a reviewer resolves out of it. So anything
 * an upload would previously have auto-flagged as an exception — a duplicate, an
 * unknown vendor, a critical flag — now lands in Low Confidence for review, with
 * the flag attached so the reviewer sees why. From there the reviewer can
 * escalate to Exception, approve, or decline.
 *
 * Pure and synchronous, so the rules are easy to read and unit-test. Nothing
 * here touches the database.
 */

import type { DuplicateResult } from './duplicateCheck';

export interface RoutingInput {
  confidence: number;
  flags: string[];
  duplicate: DuplicateResult;
  /** The extracted vendor is not on the admin-imported vendor master. */
  vendorUnmatched: boolean;
  vendorActive: boolean;
  hasVendorName: boolean;
}

export interface RoutingResult {
  status: 'validated' | 'submitted' | 'exception';
  riskLevel: 'low' | 'medium' | 'high';
  flags: string[];
}

/** At or above this, an invoice can skip Low Confidence. */
const HIGH_CONFIDENCE = 0.7;

/** Flags that always force a human decision. */
const CRITICAL_FLAGS = new Set([
  'bank_change',
  'tax_mismatch',
  'non_invoice_document',
  'extraction_failed',
]);

export function routeInvoice(input: RoutingInput): RoutingResult {
  // Deduplicated: stage-2 normalisation shares this flag vocabulary, so a flag
  // it already raised must not be pushed again below and rendered twice.
  const seen = new Set(input.flags);

  if (input.duplicate.type) {
    seen.add(`duplicate_${input.duplicate.type}`);
  }
  if (!input.hasVendorName) {
    seen.add('vendor_missing');
  }
  if (input.vendorUnmatched) {
    seen.add('vendor_not_found');
  }

  const flags = [...seen];
  const hasCritical = flags.some((f) => CRITICAL_FLAGS.has(f));

  // A duplicate of an already-APPROVED invoice cannot supersede that approval
  // (it may already be paid/exported), so the new upload goes straight to
  // Exceptions for a human to reconcile. This is the one place automatic
  // routing selects Exception, by product rule.
  if (input.duplicate.blockNew) {
    return { status: 'exception', riskLevel: 'high', flags };
  }

  // Other high-risk reasons land in a review queue — Low Confidence — rather
  // than being sent straight to Exception. A reviewer decides from there.
  //   - a critical flag (bad file, non-invoice, bank/tax mismatch)
  //   - a vendor that is not on the approved master list
  if (hasCritical || input.vendorUnmatched) {
    return { status: 'validated', riskLevel: 'high', flags };
  }

  // A tax line on an invoice to a tax-exempt organisation is always a review
  // reason. It forces Low Confidence regardless of how clean everything else is
  // — an otherwise-perfect invoice with tax must never reach High Confidence.
  if (flags.includes('tax_line_detected')) {
    return { status: 'validated', riskLevel: 'medium', flags };
  }

  // A missing total is a review reason on its own: an invoice with no amount
  // cannot be approved for payment, so it never clears to High Confidence — even
  // if the model reported high confidence in the rest of the record. (A missing
  // invoice number is deliberately NOT treated this way; see TC-13.)
  if (flags.includes('total_amount_missing')) {
    return { status: 'validated', riskLevel: 'high', flags };
  }

  // Medium-risk reasons: missing/inactive vendor, low confidence, soft dup.
  if (
    !input.hasVendorName ||
    !input.vendorActive ||
    input.confidence < HIGH_CONFIDENCE ||
    input.duplicate.type === 'soft'
  ) {
    return { status: 'validated', riskLevel: 'medium', flags };
  }

  // Clean: high confidence, active known vendor, no duplicate, no flags.
  return { status: 'submitted', riskLevel: 'low', flags };
}
