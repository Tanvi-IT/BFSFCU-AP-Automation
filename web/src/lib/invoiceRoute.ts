/**
 * Where a "View"/row click should land, by invoice status. Each review status
 * goes to its own queue page; approved goes to the Approved list (the sidebar
 * view), never the bare /invoices all-status page.
 *
 * `queued` / `processing` are NOT review states — the worker hasn't finished (or
 * hasn't started) yet, so the invoice is in no review queue. Sending them to
 * `/low-confidence/:id` renders that queue's "No Low-Confidence Invoices" empty
 * state, which reads as "the invoice vanished". Route them to the single-invoice
 * detail page instead, which loads any invoice by id and shows its real "In
 * Queue" status. Only `validated` belongs in Low Confidence.
 *
 * Shared by the Upload page's Recent Uploads and the Inbox Monitor so both route
 * a "View" the same way.
 */
export function invoiceRoute(status: string | undefined, id: string | undefined): string {
  switch (status) {
    case "exception":
      return `/exceptions/${id}`;
    case "submitted":
      return `/high-confidence/${id}`;
    case "approved":
      return "/invoices?status=approved";
    case "rejected":
    case "declined":
      return "/declined";
    case "validated":
      return `/low-confidence/${id}`;
    default: // queued / processing — not in any review queue yet
      return `/invoices/${id}`;
  }
}
