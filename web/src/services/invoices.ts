/**
 * Invoice API. Pages call these instead of touching a database.
 */

import { api } from "@/lib/api";

/**
 * Invoice status — matches the original schema exactly.
 *
 * These are the values the existing UI already uses. An earlier iteration of
 * this migration renamed 'rejected' to 'declined'; that was reverted, because
 * the goal is a faithful port — the UI and its behaviour must be unchanged.
 *
 * 'queued' and 'processing' are the only additions, covering the window
 * between upload and the worker finishing. The old system had no such window
 * because extraction ran inside the upload request.
 */
export type InvoiceStatus =
  | "ingested"
  | "queued"
  | "processing"
  | "draft"
  | "validated"
  | "submitted"
  | "approved"
  | "rejected"
  | "exception"
  | "exported"
  | "archived";

/**
 * Statuses the background worker still owns. Anything else is a resting place
 * the user can act on, so this is what "is it finished yet?" polling watches.
 */
const IN_FLIGHT_STATUSES: readonly InvoiceStatus[] = ["ingested", "queued", "processing"];

export const isInFlight = (status: InvoiceStatus) => IN_FLIGHT_STATUSES.includes(status);

/** Response from POST /invoices — the invoice exists, extraction has not run yet. */
export interface UploadAccepted {
  invoiceId: string;
  status: string;
  duplicate?: boolean;
  message?: string;
}

/** Queue definitions, so every queue page filters the same way. */
export const QUEUE = {
  lowConfidence: "validated",
  highConfidence: "submitted",
  exceptions: "exception",
  declined: "rejected",
  approved: "approved",
} as const satisfies Record<string, InvoiceStatus>;

export interface Invoice {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_status?: string | null;
  vendor_bank_verified?: boolean | null;
  po_id?: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  due_date_defaulted?: boolean | null;
  due_date_default_source?: string | null;
  currency: string;
  subtotal_amount?: string | null;
  tax_amount?: string | null;
  total_amount: string;
  status: InvoiceStatus;
  source: string;
  risk_level: "low" | "medium" | "high" | null;
  confidence_score: string | null;
  anomaly_score?: number | null;
  variation_score?: number | null;
  variation_flags: string[];
  blob_path: string;
  raw_file_path?: string | null;
  original_filename: string | null;
  sanitized_filename?: string | null;
  system_filename?: string | null;
  file_hash: string;
  sender_email?: string | null;
  document_type?: string | null;
  checker_comment?: string | null;
  duplicate_of: string | null;
  duplicate_type: string | null;
  tax_flagged?: boolean | null;
  tax_flag_reason?: string | null;
  bad_file_flag?: boolean | null;
  bad_file_reason?: string | null;
  supplemental_pdf_count?: number | null;
  ach_routing_number?: string | null;
  ach_account_number?: string | null;
  gl_code?: string | null;
  gl_approver?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  transaction_date?: string | null;
  source_transaction_date?: string | null;
  extraction_provider?: string | null;
  reasoning_provider?: string | null;
  auto_routed?: boolean | null;
  auto_approval_status?: string | null;
  is_critical?: boolean | null;
  erp_status?: string | null;
  erp_reference_id?: string | null;
  exported_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  submitted_by?: string | null;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
  /** The API returns every column; this keeps unmigrated readers compiling. */
  [key: string]: unknown;
}

/**
 * Which timestamp a date range filters on. The historical queues each care
 * about a different one — Approved reads `approved_at`, Declined the
 * `updated_at` that recorded the decline.
 */
export type DateField = "created_at" | "updated_at" | "approved_at";

/** A supplemental document linked to an invoice. */
export interface Attachment {
  id: string;
  invoice_id: string;
  original_filename: string;
  content_type: string;
  bytes: number;
  uploaded_by_email: string | null;
  created_at: string;
}

export interface ListParams {
  status?: InvoiceStatus;
  search?: string;
  /** Inclusive `YYYY-MM-DD` bounds. Both ends are optional. */
  dateFrom?: string;
  dateTo?: string;
  dateField?: DateField;
  /** Sort direction on `dateField`. Defaults to `desc` (newest first). */
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export const invoicesApi = {
  /**
   * Search and date filtering are applied server-side, before LIMIT/OFFSET.
   * Filtering the returned page in the browser instead would only ever search
   * the rows already loaded — useless on the historical queues, which page.
   */
  list: (params: ListParams = {}) =>
    api
      .get<{ invoices: Invoice[] }>("/invoices", {
        status: params.status,
        search: params.search,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        dateField: params.dateField,
        order: params.order,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      })
      .then((r) => r.invoices),

  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),

  stats: () => api.get<Record<string, number>>("/invoices-stats"),

  /** Supplemental documents linked to an invoice. */
  supplemental: {
    list: (invoiceId: string) =>
      api
        .get<{ attachments: Attachment[] }>(`/invoices/${invoiceId}/supplemental`)
        .then((r) => r.attachments),

    add: (invoiceId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<{
        attachment: Attachment;
        supplementalCount: number;
        /** Pages appended to the invoice PDF, and whether the PDF was rewritten. */
        pagesAppended?: number;
        invoicePdfUpdated?: boolean;
      }>(`/invoices/${invoiceId}/supplemental`, form);
    },

    /** Short-lived URL for viewing one attachment. */
    fileUrl: (invoiceId: string, attachmentId: string) =>
      api
        .get<{ url: string; filename: string }>(
          `/invoices/${invoiceId}/supplemental/${attachmentId}/file`
        )
        .then((r) => r.url),

    remove: (invoiceId: string, attachmentId: string) =>
      api.delete<{ ok: boolean }>(`/invoices/${invoiceId}/supplemental/${attachmentId}`),
  },

  /**
   * Upload a document. Resolves as soon as the file is stored and queued —
   * extraction happens in the background worker, so callers that want to show
   * the invoice reaching a final state must poll `get()` afterwards.
   *
   * `onProgress` reports bytes sent, 0–100.
   */
  upload: (file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return api.uploadWithProgress<UploadAccepted>("/invoices", form, onProgress);
  },

  /** Short-lived URL for viewing the original document. */
  fileUrl: (id: string) =>
    api.get<{ url: string; expiresInMinutes: number }>(`/invoices/${id}/file`).then((r) => r.url),

  approve: (id: string, note?: string) =>
    api.post<{ id: string; status: string }>(`/invoices/${id}/approve`, { note }),

  decline: (id: string, reason: string) =>
    api.post<{ id: string; status: string }>(`/invoices/${id}/decline`, { reason }),

  /** Approve several invoices in one transaction. */
  batchApprove: (invoiceIds: string[]) =>
    api.post<{ approved: string[]; skipped: string[] }>("/invoices/batch-approve", {
      invoiceIds,
    }),

  /** Move a reviewed invoice to the approval queue. */
  submitForApproval: (id: string) =>
    api.post<{ id: string; status: string }>(`/invoices/${id}/submit`, {}),

  /** Escalate to the Exceptions queue for investigation. */
  escalate: (id: string, reason: string) =>
    api.post<{ id: string; status: string }>(`/invoices/${id}/escalate`, { reason }),

  /** Send an exception back for review (lands in Low Confidence). */
  returnToReview: (
    id: string,
    reason: string,
    action: "resolved" | "returned_to_submitter" = "resolved",
    /**
     * Destination queue. The original system differs by screen: the Exceptions
     * list resolves to High Confidence ('submitted'), the Exceptions detail
     * page resolves to Low Confidence ('validated'). Both are preserved.
     */
    target: "submitted" | "validated" = "submitted"
  ) =>
    api.post<{ id: string; status: string }>(`/invoices/${id}/return-to-review`, {
      reason,
      action,
      target,
    }),

  update: (
    id: string,
    fields: {
      invoiceNumber?: string;
      invoiceDate?: string;
      dueDate?: string;
      totalAmount?: number;
      vendorId?: string;
      glCode?: string;
      glApprover?: string;
      departmentName?: string;
      departmentId?: string;
      achRoutingNumber?: string;
      achAccountNumber?: string;
      systemFilename?: string;
      /** Move to the approval queue in the same transaction. */
      submitAfterSave?: boolean;
    }
  ) => api.patch<{ id: string; updated: string[] }>(`/invoices/${id}`, fields),
};
