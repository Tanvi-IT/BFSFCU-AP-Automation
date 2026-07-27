/**
 * Duplicate detection.
 *
 * Duplicate uploads are allowed (file_hash is no longer unique — see migration
 * 0014), so re-uploading the same document produces a new invoice that this
 * check then routes. Duplicates are recognised by:
 *
 *   hard  — same vendor + same invoice number
 *   soft  — same vendor + same amount within 48 hours (a weaker signal)
 *
 * Active policy (newest-wins, approval-safe):
 *   - If an earlier copy is still in review (low/high confidence), the newest
 *     upload takes its place and every earlier copy is superseded to Exceptions.
 *   - If an earlier copy is already APPROVED, the approval stands and the NEW
 *     upload goes to Exceptions instead — an approval (possibly already paid or
 *     exported) is never silently reversed. `SUPERSEDE_APPROVED` guards this.
 */

import { query, queryOne } from '../db';

const SUPERSEDE_APPROVED = false;

const SOFT_MATCH_WINDOW_HOURS = 48;

export type DuplicateType = 'hard' | 'soft' | null;

export interface DuplicateInput {
  invoiceId: string;
  /** null when the vendor is not on the master list. */
  vendorId: string | null;
  /** The vendor name read off the invoice — used to match copies of an
   *  invoice from a vendor that is not (yet) on the master list. */
  vendorName: string | null;
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
  // Duplicate comparison is scoped to the same vendor — identified by id when
  // the vendor is on the master list, otherwise by the name captured on the
  // invoice so re-uploads of an unmatched vendor's invoice still supersede.
  if (!input.vendorId && !input.vendorName) return NONE;

  // ---- hard: same vendor + same invoice number -----------------------------
  if (input.invoiceNumber) {
    const priors = await query<PriorRow>(
      `SELECT id, status, approved_at
         FROM invoices
        WHERE invoice_number = $2
          AND id <> $3
          AND (
            ($1::uuid IS NOT NULL AND vendor_id = $1::uuid)
            OR ($1::uuid IS NULL AND $4::text IS NOT NULL
                AND lower(COALESCE(vendor_name_snapshot, '')) = lower($4))
          )
        ORDER BY created_at ASC`,
      [input.vendorId, input.invoiceNumber, input.invoiceId, input.vendorName]
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
  // Kept to matched vendors: amount alone is too weak to compare across the
  // whole table by name.
  if (input.vendorId && input.totalAmount !== null && input.invoiceDate) {
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
