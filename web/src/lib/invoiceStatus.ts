/**
 * The single source of truth for how an invoice status is shown as a tag across
 * the app — the audit trail, the audit filter, and the upload page's recent
 * uploads. The internal review states (queued / processing / validated /
 * submitted) all still sit in a review queue awaiting a decision, so they
 * collapse to one reviewer-facing label. Keeping this in one place is what stops
 * the same invoice from reading as two different things on two screens.
 */
export function invoiceStatusLabel(status: unknown): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
    case "declined":
      return "Declined";
    case "exception":
      return "Exception";
    default:
      // queued / processing / validated / submitted — still in the queue.
      return "In Queue";
  }
}
