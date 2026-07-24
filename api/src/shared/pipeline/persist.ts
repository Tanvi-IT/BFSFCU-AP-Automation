/**
 * Final write for a processed invoice.
 *
 * Everything happens in ONE transaction — invoice, line items, superseded
 * copies and audit entries commit together or not at all. The old
 * implementation wrote these as separate calls, so a mid-pipeline failure
 * could leave orphaned vendors and half-written invoices.
 */

import { transaction } from '../db';
import type { ExtractedLineItem } from '../ai/documentIntelligence';
import type { DuplicateResult } from './duplicateCheck';

export interface PersistInput {
  invoiceId: string;
  /** null when no vendor on the master list matched. */
  vendorId: string | null;
  /**
   * The matched vendor's name, recorded on the invoice at validation time so a
   * later vendor-list replacement cannot change or erase it.
   */
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  /** True when dueDate was filled in from the invoice date, not read off the document. */
  dueDateDefaulted: boolean;
  dueDateDefaultSource: string | null;
  currency: string;
  subtotalAmount: number | null;
  taxAmount: number | null;
  totalAmount: number;
  lineItems: ExtractedLineItem[];
  status: 'validated' | 'submitted' | 'exception';
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number | null;
  flags: string[];
  /** A taxable line was found on an invoice to a tax-exempt organisation. */
  taxFlagged: boolean;
  taxFlagReason: string | null;
  /** Which services produced the extraction and the normalisation. */
  extractionProvider: string;
  reasoningProvider: string | null;
  duplicate: DuplicateResult;
  extractionRaw: unknown;
  normalizationRaw: unknown;
}

/** Accept only YYYY-MM-DD; anything else becomes null rather than a bad date. */
function safeDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function saveProcessedInvoice(input: PersistInput): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE invoices
          SET vendor_id            = $2,
              vendor_name_snapshot = $18,
              invoice_number    = $3,
              invoice_date      = $4,
              due_date          = $5,
              due_date_defaulted      = $21,
              due_date_default_source = $22,
              currency          = $6,
              subtotal_amount   = $7,
              tax_amount        = $8,
              total_amount      = $9,
              status            = $10,
              risk_level        = $11,
              confidence_score  = $12,
              variation_flags   = $13,
              duplicate_of      = $14,
              duplicate_type    = $15,
              extraction_raw    = $16::jsonb,
              normalization_raw = $17::jsonb,
              tax_flagged       = $19,
              tax_flag_reason   = $20,
              extraction_provider     = $23,
              reasoning_provider      = $24,
              -- Carry the matched vendor's bank details onto the invoice so the
              -- review screens and the export show where payment will go. Null
              -- when no vendor matched.
              ach_routing_number = (SELECT ach_routing_number FROM vendors WHERE id = $2),
              ach_account_number = (SELECT ach_account_number FROM vendors WHERE id = $2),
              -- Never auto-routed to approval out of the pipeline; a human moves
              -- it forward from a queue.
              auto_routed       = false,
              processing_error  = NULL
        WHERE id = $1`,
      [
        input.invoiceId,
        input.vendorId,
        input.invoiceNumber,
        safeDate(input.invoiceDate),
        safeDate(input.dueDate),
        input.currency,
        input.subtotalAmount,
        input.taxAmount,
        input.totalAmount,
        input.status,
        input.riskLevel,
        input.confidence,
        input.flags,
        input.duplicate.duplicateOf,
        input.duplicate.type,
        JSON.stringify(input.extractionRaw),
        JSON.stringify(input.normalizationRaw),
        input.vendorName,
        input.taxFlagged,
        input.taxFlagReason,
        input.dueDateDefaulted,
        input.dueDateDefaultSource,
        input.extractionProvider,
        input.reasoningProvider,
      ]
    );

    // Tax flag: record an anomaly and an audit row alongside the invoice, in the
    // same transaction so the three never disagree.
    if (input.taxFlagged) {
      await client.query(
        `INSERT INTO invoice_anomalies (invoice_id, code, severity, message)
         VALUES ($1, 'tax_line_detected', 'medium', $2)`,
        [input.invoiceId, input.taxFlagReason]
      );

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
         VALUES ('invoice', $1, 'tax_flagged', $2::jsonb)`,
        [
          input.invoiceId,
          JSON.stringify({ taxAmount: input.taxAmount, reason: input.taxFlagReason }),
        ]
      );
    }

    // Line items are replaced wholesale so a reprocess cannot duplicate them.
    await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [
      input.invoiceId,
    ]);

    for (const [index, item] of input.lineItems.entries()) {
      await client.query(
        `INSERT INTO invoice_line_items
           (invoice_id, line_number, description, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.invoiceId,
          index + 1,
          item.description,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
        ]
      );
    }

    // Newest-wins: move superseded copies to Exceptions.
    for (const supersededId of input.duplicate.supersede) {
      await client.query(
        `UPDATE invoices
            SET status = 'exception',
                variation_flags =
                  array_append(variation_flags, 'superseded_by_new_submission')
          WHERE id = $1
            AND NOT ('superseded_by_new_submission' = ANY (variation_flags))`,
        [supersededId]
      );

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
         VALUES ('invoice', $1, 'superseded', $2::jsonb)`,
        [supersededId, JSON.stringify({ supersededBy: input.invoiceId })]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
       VALUES ('invoice', $1, 'processed', $2::jsonb)`,
      [
        input.invoiceId,
        JSON.stringify({
          status: input.status,
          riskLevel: input.riskLevel,
          confidence: input.confidence,
          flags: input.flags,
          duplicateType: input.duplicate.type,
        }),
      ]
    );
  });
}
