/**
 * Deterministic tax-amount adjustment for a processed invoice.
 *
 * The organisation is tax-exempt, so a nonzero tax amount on an invoice is a
 * review reason. Keyed on the amount, not the model's advisory
 * `tax_line_detected` (which fires on a $0 tax line and would otherwise flag
 * an invoice that has no tax charge at all).
 *
 * "Surplus Tax" (also seen as "SurplusTax", no space, and "Surplus Tax
 * Charge") is a SURCHARGE, not a tax, despite the word "tax" appearing in its
 * label. It must be:
 *   - excluded from tax_amount (subtracted out, never left in), and
 *   - reported separately via a `surplus_amount_charged` flag,
 * while any other tax on the same invoice — Sales Tax, State Tax, Local Tax,
 * bare "Tax" — remains tax_amount and still drives tax_flagged.
 *
 * This runs AFTER both AI stages, as a final deterministic pass, for the same
 * reason total_mismatch and the $0-tax-line case are enforced in code rather
 * than trusted to the model: a reasoning model is a probabilistic best-effort
 * signal, and a regulated financial figure like tax_amount must not depend on
 * a model reliably following an instruction on every invoice, every time.
 *
 * The amount to subtract is identified in priority order:
 *
 *  1. A line item's own `lineTotal`, when a line item description matches
 *     the Surplus Tax pattern AND carries a numeric amount. This is the
 *     strongest signal — a structured, itemised figure.
 *
 *  2. Azure OpenAI's own `surplus_amount_charged` estimate (stage 2), used
 *     ONLY to fill in a missing number when a Surplus Tax line item was
 *     already identified by (1) but had no numeric `lineTotal` of its own.
 *     This never triggers detection by itself — detection is always driven
 *     by (1) or (3), never solely by the model's opinion.
 *
 *  3. Raw OCR text (`extracted.rawText`), used ONLY when NO line item
 *     mentions tax or surplus at all. Document Intelligence's `TotalTax`
 *     field is a bare number with no label of its own — a totals-block line
 *     like "SurplusTax: $200.00" is captured as `taxAmount = 200` with the
 *     word "Surplus" nowhere else in the structured extraction. The raw text
 *     is the only place that label survives. This is accepted ONLY when the
 *     dollar figure next to "Surplus Tax" in the text matches taxAmount
 *     (within a cent) — that match is what keeps this safe from an unrelated
 *     "surplus tax" mention elsewhere in the document (e.g. boilerplate
 *     terms with no associated figure).
 */

export interface TaxFlagLineItem {
  description: string;
  /** The line item's own amount, when Document Intelligence captured one. */
  lineTotal?: number | null;
}

export interface TaxAdjustmentResult {
  /**
   * tax_amount with any identified surplus charge subtracted out, floored at
   * 0. This is the value that must be persisted — never the raw pre-
   * adjustment figure.
   */
  taxAmount: number | null;
  /** Whether the (adjusted) tax_amount should still flag the invoice for review. */
  taxFlagged: boolean;
  /**
   * The dollar amount identified as a Surplus Tax charge and excluded from
   * tax_amount, or null if none was found. Drives the `surplus_amount_charged`
   * flag independently of taxFlagged — case 3 in the requirements needs both
   * flags set on the same invoice.
   */
  surplusAmountCharged: number | null;
  /** Line items whose description mentions "tax" — surfaced for logging. */
  taxLines: TaxFlagLineItem[];
  /** Whether the surplus amount was identified via the raw-text fallback (3) rather than a line item. */
  surplusFromRawText: boolean;
}

/** Matches any line-item description that mentions "tax" as a whole word. */
const TAX_MENTION = /\btax\b/i;

/**
 * Matches the "Surplus Tax" pattern. `\s*` (not `\s+`) so it matches both the
 * spaced form ("Surplus Tax") and the run-together form some vendors print
 * ("SurplusTax"). An optional "Charge" suffix is also covered.
 */
const SURPLUS_TAX_PATTERN = /\bsurplus\s*tax\b(?:\s*charge)?/i;

/**
 * A Surplus Tax label followed, within a short span, by a dollar figure —
 * i.e. a totals-block line, not just the words appearing somewhere in the
 * document. The captured number is compared against taxAmount by the caller.
 */
const SURPLUS_TAX_TOTALS_LINE = /\bsurplus\s*tax\b(?:\s*charge)?[^0-9$]{0,20}\$?\s*([\d,]+(?:\.\d{1,2})?)/i;
const SURPLUS_TAX_TOTALS_LINE_REVERSED = /\$?\s*([\d,]+(?:\.\d{1,2})?)[^\r\n]{0,20}\bsurplus\s*tax\b(?:\s*charge)?/i;

const AMOUNT_TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Whether the raw OCR text shows a dollar figure next to "Surplus Tax" that
 * matches the given amount — i.e. the totals-block line is the source of
 * that figure, not an unrelated mention elsewhere in the document.
 */
function surplusTaxRawTextAmount(rawText: string, taxAmount: number): number | null {
  const match = rawText
    .split(/\r?\n/)
    .map((line) => SURPLUS_TAX_TOTALS_LINE.exec(line) ?? SURPLUS_TAX_TOTALS_LINE_REVERSED.exec(line))
    .find((candidate) => candidate);
  if (!match) return null;

  const captured = Number(match[1]!.replace(/,/g, ''));
  if (!Number.isFinite(captured)) return null;

  return Math.abs(captured - taxAmount) <= AMOUNT_TOLERANCE ? captured : null;
}

/**
 * Identify any Surplus Tax charge, subtract it from tax_amount (never
 * negative), and decide the resulting tax flag.
 *
 * @param taxAmount - The extracted/normalised tax amount, or null if absent.
 *   This is the PRE-adjustment figure (Document Intelligence's TotalTax,
 *   possibly refined by stage 2) — it may still include a surplus charge
 *   lumped in with real tax.
 * @param lineItems - The invoice's extracted line items.
 * @param rawText - The full OCR text of the document. Optional; when
 *   omitted, priority (3) above is simply never consulted.
 * @param normalizedSurplusAmountCharged - Azure OpenAI's own extracted
 *   surplus amount (stage 2), if any. Optional; only used per priority (2)
 *   above.
 */
export function computeTaxAdjustment(
  taxAmount: number | null,
  lineItems: readonly TaxFlagLineItem[],
  rawText?: string,
  normalizedSurplusAmountCharged?: number | null
): TaxAdjustmentResult {
  // A line item mentions tax if it contains the whole word "tax" OR matches
  // the Surplus Tax pattern specifically. The second half matters for the
  // run-together spelling: in "SurplusTax" there is no boundary between "s"
  // and "T", so \btax\b alone never recognises it as tax-related at all —
  // without this, such a line item would silently skip detection entirely
  // and fall through to the (wrong) amount-only path.
  const taxLines = lineItems.filter(
    (item) => TAX_MENTION.test(item.description) || SURPLUS_TAX_PATTERN.test(item.description)
  );
  const surplusLineItems = taxLines.filter((item) => SURPLUS_TAX_PATTERN.test(item.description));
  const realTaxLineItems = taxLines.filter((item) => !SURPLUS_TAX_PATTERN.test(item.description));

  let surplusAmountCharged: number | null = null;
  let surplusFromRawText = false;

  if (surplusLineItems.length > 0) {
    // Priority 1: sum whatever numeric lineTotals the surplus line item(s)
    // actually carry.
    const knownAmounts = surplusLineItems
      .map((item) => item.lineTotal)
      .filter(isFiniteNumber);

    if (knownAmounts.length > 0) {
      surplusAmountCharged = round2(knownAmounts.reduce((sum, n) => sum + n, 0));
    } else if (isFiniteNumber(normalizedSurplusAmountCharged)) {
      // Priority 2: no lineTotal on the surplus item itself — fall back to
      // stage 2's own extracted amount, since detection already happened via
      // the line-item description match above.
      surplusAmountCharged = round2(normalizedSurplusAmountCharged);
    } else if (taxAmount !== null && realTaxLineItems.length === 0) {
      // Neither has a number, and the surplus line is the ONLY tax-mentioning
      // line item — attribute the whole tax_amount to it. (When a real tax
      // line ALSO exists with no way to split the combined figure, we
      // deliberately do not guess a split; the surplus flag is still set
      // below via the general condition, but no amount is subtracted.)
      surplusAmountCharged = taxAmount;
    }
  } else if (
    isFiniteNumber(normalizedSurplusAmountCharged) &&
    normalizedSurplusAmountCharged > 0 &&
    realTaxLineItems.length === 0 &&
    taxAmount !== null &&
    (taxAmount === 0 || normalizedSurplusAmountCharged <= taxAmount)
  ) {
    // Stage 2 may identify the surplus amount even when Document Intelligence
    // does not preserve the totals label in either Items or raw OCR text. When
    // no real tax line competes with it and the amount fits inside TotalTax,
    // keep that AI-derived amount as the separate surplus-charge signal.
    surplusAmountCharged = round2(normalizedSurplusAmountCharged);
  } else if (taxAmount !== null && taxAmount > 0 && realTaxLineItems.length === 0 && rawText) {
    // Priority 3: no line item mentions tax or surplus at all — check the
    // raw OCR text for a Surplus Tax totals line whose amount matches
    // taxAmount exactly (within a cent).
    const rawAmount = surplusTaxRawTextAmount(rawText, taxAmount);
    if (rawAmount !== null) {
      surplusAmountCharged = rawAmount;
      surplusFromRawText = true;
    }
  }

  const adjustedTaxAmount =
    taxAmount !== null && surplusAmountCharged !== null
      ? Math.max(0, round2(taxAmount - surplusAmountCharged))
      : taxAmount;

  const taxFlagged = adjustedTaxAmount !== null && adjustedTaxAmount > 0;

  return {
    taxAmount: adjustedTaxAmount,
    taxFlagged,
    surplusAmountCharged,
    taxLines,
    surplusFromRawText,
  };
}