/**
 * Duplicate detection.
 *
 * File-level duplicates are already impossible: `invoices.file_hash` is unique,
 * so the same bytes are rejected at upload. What remains is:
 *
 *   hard  — same vendor + same invoice number
 *   soft  — same vendor + same amount within 48 hours (a weaker signal)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PENDING PRODUCT DECISION — do not change without sign-off.
 *
 * The requested rule is "the newest upload always wins: it goes to LC/HC and
 * every earlier copy moves to Exceptions". That is implemented here for copies
 * that are still in review.
 *
 * It is deliberately NOT applied when an earlier copy is already APPROVED,
 * because that copy may already have been paid or exported, and superseding it
 * would silently reverse an approval. In that case the NEW upload goes to
 * Exceptions instead. Flip `SUPERSEDE_APPROVED` only after an explicit decision.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, queryOne } from '../db';

const SUPERSEDE_APPROVED = false;

const SOFT_MATCH_WINDOW_HOURS = 48;

export type DuplicateType = 'hard' | 'soft' | null;

export interface DuplicateInput {
  invoiceId: string;
  /** null when the vendor is not on the master list. */
  vendorId: string | null;
  invoiceNumber: string | null;
  totalAmount: number | null;
  invoiceDate: string | null;
}

export interface DuplicateResult {
  type: DuplicateType;
  /** The earlier invoice this one duplicates. */
  duplicateOf: string | null;
  /** Earlier copies to move to Exceptions (the newest-wins rule). */
  supersede: string[];
  /** True when the new invoice itself must go to Exceptions. */
  blockNew: boolean;
  message: string | null;
}

const NONE: DuplicateResult = {
  type: null,
  duplicateOf: null,
  supersede: [],
  blockNew: false,
  message: null,
};

interface PriorRow {
  id: string;
  status: string;
  approved_at: string | null;
}

export async function detectDuplicate(input: DuplicateInput): Promise<DuplicateResult> {
  // Every rule below is scoped to a vendor. With no vendor there is nothing to
  // compare against, and the invoice is already headed for Exceptions.
  if (!input.vendorId) return NONE;

  // ---- hard: same vendor + same invoice number -----------------------------
  if (input.invoiceNumber) {
    const priors = await query<PriorRow>(
      `SELECT id, status, approved_at
         FROM invoices
        WHERE vendor_id = $1
          AND invoice_number = $2
          AND id <> $3
        ORDER BY created_at ASC`,
      [input.vendorId, input.invoiceNumber, input.invoiceId]
    );

    if (priors.length > 0) {
      const approved = priors.filter((p) => p.approved_at !== null);

      if (approved.length > 0 && !SUPERSEDE_APPROVED) {
        return {
          type: 'hard',
          duplicateOf: approved[0]?.id ?? null,
          supersede: [],
          blockNew: true,
          message: 'Hard duplicate — an earlier copy of this invoice is already approved.',
        };
      }

      // Newest wins: every earlier copy is superseded.
      return {
        type: 'hard',
        duplicateOf: priors[priors.length - 1]?.id ?? null,
        supersede: priors.map((p) => p.id),
        blockNew: false,
        message: 'Vendor reissued this invoice — earlier copies moved to Exceptions.',
      };
    }
  }

  // ---- soft: same vendor + same amount, close in time ----------------------
  if (input.totalAmount !== null && input.invoiceDate) {
    const soft = await queryOne<{ id: string }>(
      `SELECT id
         FROM invoices
        WHERE vendor_id = $1
          AND total_amount = $2
          AND id <> $3
          AND invoice_date IS NOT NULL
          AND abs(extract(epoch FROM (invoice_date::timestamp - $4::timestamp))) <= $5
        ORDER BY created_at DESC
        LIMIT 1`,
      [
        input.vendorId,
        input.totalAmount,
        input.invoiceId,
        input.invoiceDate,
        SOFT_MATCH_WINDOW_HOURS * 3600,
      ]
    );

    if (soft) {
      // A weak signal — flag for review rather than auto-superseding anything.
      return {
        type: 'soft',
        duplicateOf: soft.id,
        supersede: [],
        blockNew: false,
        message: 'Similar invoice: same vendor and amount within 48 hours.',
      };
    }
  }

  return NONE;
}
