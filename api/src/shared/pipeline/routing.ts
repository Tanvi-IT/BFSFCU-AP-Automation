/**
 * Queue routing — decides where a processed invoice lands.
 *
 *   exception  → duplicate, extraction problem, or a critical flag
 *   validated  → Low Confidence: a human should look at it
 *   submitted  → High Confidence: ready for approval
 *
 * Pure and synchronous, so the rules are easy to read and unit-test. Nothing
 * here touches the database.
 */

import type { DuplicateResult } from './duplicateCheck';

export interface RoutingInput {
  confidence: number;
  flags: string[];
  duplicate: DuplicateResult;
  isNewVendor: boolean;
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
  const flags = [...input.flags];

  if (input.duplicate.type) {
    flags.push(`duplicate_${input.duplicate.type}`);
  }
  if (!input.hasVendorName) {
    flags.push('vendor_missing');
  }
  if (input.isNewVendor) {
    flags.push('new_vendor');
  }

  const hasCritical = flags.some((f) => CRITICAL_FLAGS.has(f));

  // 1. A duplicate that must not proceed.
  if (input.duplicate.blockNew) {
    return { status: 'exception', riskLevel: 'high', flags };
  }

  // 2. Anything critical is a human decision.
  if (hasCritical) {
    return { status: 'exception', riskLevel: 'high', flags };
  }

  // 3. Missing vendor name, or a brand-new/unverified vendor: review.
  if (!input.hasVendorName || input.isNewVendor || !input.vendorActive) {
    return { status: 'validated', riskLevel: 'medium', flags };
  }

  // 4. Low confidence: review.
  if (input.confidence < HIGH_CONFIDENCE) {
    return { status: 'validated', riskLevel: 'medium', flags };
  }

  // 5. A soft duplicate is worth a look even when confidence is high.
  if (input.duplicate.type === 'soft') {
    return { status: 'validated', riskLevel: 'medium', flags };
  }

  // 6. Clean.
  return { status: 'submitted', riskLevel: 'low', flags };
}
