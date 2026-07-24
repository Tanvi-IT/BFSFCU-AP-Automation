// Unified invoice reason labels — single source of truth for all views
// Any change to labels must be made here only

const FLAG_LABELS: Record<string, string> = {
  TAX_LINE_DETECTED: "Tax amount charged",
  tax_line_detected: "Tax amount charged",
  price_spike: "Price spike detected",
  duplicate_exact: "Duplicate invoice — under review",
  duplicate_invoice_number: "Duplicate invoice number",
  extraction_failed: "Extraction failed",
  vendor_missing: "Vendor name not found",
  // Ingest never creates vendors — an admin must import the vendor list first.
  vendor_not_found: "Vendor not on the approved list — import the vendor",
  invoice_date_due_date_swapped: "Invoice date after due date",
  date_fields_identical: "Invoice and due date identical",
  due_date_missed_on_document: "Due date not found on document",
  date_corrected_by_ai_reasoning: "Date corrected by AI reasoning",
  ach_new_account_captured: "New bank account captured — review required",
  ach_routing_changed: "Routing number changed",
  ach_account_changed: "Account number changed",
  duplicate_possible_duplicate: "Possible Duplicate",
  superseded_by_new_submission: "Superseded by new submission",
  non_invoice_document: "Non-invoice document — review and decline if not payable",
  gl_code_updated: "GL code updated",
  // Stage-2 normalisation vocabulary. Every value the model may return has a
  // label here — an unmapped flag falls through to a title-cased identifier,
  // which reads like a bug to a reviewer.
  date_swap_corrected: "Invoice and due date were swapped — corrected",
  due_date_before_invoice_date: "Due date not after invoice date — due date dropped",
  invoice_number_from_po: "Invoice number taken from a PO reference",
  invoice_number_missing: "Invoice number not found",
  total_amount_missing: "Total amount not found",
  total_mismatch: "Subtotal plus tax does not equal the total",
  multiple_invoices_in_document: "Multiple invoices in one document",
  low_ocr_quality: "Poor scan quality — verify the values",
};

function formatFlag(flag: string): string {
  return FLAG_LABELS[flag] ??
    flag.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export interface InvoiceForReasons {
  tax_flagged?: boolean | null;
  anomaly_score?: number | null;
  variation_flags?: string[] | null;
  duplicate_type?: string | null;
  bad_file_flag?: boolean | null;
  vendor?: { status?: string | null; bank_verified?: boolean | null } | null;
}

export const HIGH_CONFIDENCE_THRESHOLD = 0.75;

export function getReasonLabels(invoice: InvoiceForReasons): string[] {
  const reasons: string[] = [];

  // Duplicate reasons (read from the duplicate_type column, used by Exception views).
  if (invoice.duplicate_type === "hard") reasons.push("Duplicate (hard)");
  else if (invoice.duplicate_type === "soft") reasons.push("Duplicate (soft)");
  else if (invoice.duplicate_type === "file") reasons.push("Duplicate (file)");

  if (invoice.bad_file_flag) reasons.push("Bad File");

  if (invoice.tax_flagged) {
    const hasTaxLine =
      invoice.variation_flags?.some((f) =>
        f === "TAX_LINE_DETECTED" || f === "tax_line_detected"
      ) ?? false;
    reasons.push(hasTaxLine ? "Tax amount charged" : "Tax keywords found");
  }

  if (invoice.vendor && invoice.vendor.status !== "active") {
    reasons.push("Vendor not verified");
  }

  if (invoice.vendor && !invoice.vendor.bank_verified) {
    reasons.push("Bank account not verified");
  }

  if (invoice.variation_flags && invoice.variation_flags.length > 0) {
    invoice.variation_flags
      .filter((f) => !["TAX_LINE_DETECTED", "tax_line_detected", "duplicate_possible_duplicate", "duplicate_file"].includes(f))
      .forEach((flag) => {
        const label = formatFlag(flag);
        if (!reasons.includes(label)) {
          reasons.push(label);
        }
      });
  }

  return reasons;
}
