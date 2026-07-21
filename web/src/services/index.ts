/**
 * API services. Every data call in the app goes through one of these.
 *
 * If you are adding a `supabase.from(...)` call, stop — add a service function
 * here and the matching route in `azure/api/src/functions/http`.
 */

import { api } from "@/lib/api";

export * from "./invoices";

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
export type VendorStatus = "pending_verification" | "active" | "blocked";

export interface Vendor {
  id: string;
  name: string;
  tax_id: string | null;
  external_id: string | null;
  email_domain: string | null;
  bank_account: string | null;
  status: VendorStatus;
  bank_verified: boolean;
  source: string;
  invoice_count?: string;
  vendor_risk_score?: number | null;
  ach_routing_number?: string | null;
  ach_account_number?: string | null;
  contact_email?: string | null;
  address?: string | null;
  created_at: string;
  updated_at: string;
  /** The API returns every column; keeps unmigrated readers compiling. */
  [key: string]: unknown;
}

export const vendorsApi = {
  list: (params: { status?: VendorStatus; search?: string } = {}) =>
    api
      .get<{ vendors: Vendor[] }>("/vendors", {
        status: params.status,
        search: params.search,
      })
      .then((r) => r.vendors),

  get: (id: string) => api.get<Vendor>(`/vendors/${id}`),

  update: (id: string, fields: { name?: string; taxId?: string; bankAccount?: string }) =>
    api.patch<Vendor>(`/vendors/${id}`, fields),

  setStatus: (id: string, status: VendorStatus) =>
    api.post<Vendor>(`/vendors/${id}/status`, { status }),

  /** Merge this vendor into another; invoices are reassigned atomically. */
  merge: (sourceId: string, targetVendorId: string) =>
    api.post<{ merged: boolean; invoicesMoved: number }>(`/vendors/${sourceId}/merge`, {
      targetVendorId,
    }),

  /** Apply GL coding to every non-approved invoice for this vendor. */
  applyCoding: (id: string, coding: { glCode: string | null; departmentId: string | null }) =>
    api.post<{ vendorId: string; invoicesUpdated: number }>(
      `/vendors/${id}/apply-coding`,
      coding
    ),
};

// ---------------------------------------------------------------------------
// Notes & audit
// ---------------------------------------------------------------------------
export interface Note {
  id: string;
  invoice_id: string;
  user_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const activityApi = {
  notes: (invoiceId: string) =>
    api.get<{ notes: Note[] }>(`/invoices/${invoiceId}/notes`).then((r) => r.notes),

  addNote: (invoiceId: string, body: string) =>
    api.post<Note>(`/invoices/${invoiceId}/notes`, { body }),

  audit: (invoiceId: string) =>
    api.get<{ entries: AuditEntry[] }>(`/invoices/${invoiceId}/audit`).then((r) => r.entries),

  recentAudit: (limit = 100) =>
    api.get<{ entries: AuditEntry[] }>("/audit", { limit }).then((r) => r.entries),
};

// ---------------------------------------------------------------------------
// Departments (GL coding lookup)
// ---------------------------------------------------------------------------
export interface Department {
  id: string;
  erp_department_id: string;
  name: string;
}

export const departmentsApi = {
  list: (search?: string) =>
    api
      .get<{ departments: Department[] }>("/departments", search ? { search } : undefined)
      .then((r) => r.departments),

  /** Find an existing department by name, or create it. */
  findOrCreate: (name: string) => api.post<Department>("/departments", { name }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminApi = {
  /** Clear demo data. Destructive; admin only. */
  demoReset: () =>
    api.post<{ success: boolean; invoices: number; vendors: number }>(
      "/maintenance/demo-reset",
      { confirm: "DELETE" }
    ),
};

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------
export type AppRole = "superadmin" | "admin" | "ap_analyst" | "approver" | "read_only";

export interface ManagedUser {
  id: string;
  entra_oid: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

export const usersApi = {
  list: () => api.get<{ users: ManagedUser[] }>("/users").then((r) => r.users),

  /** Grant an existing Entra user access to this application. */
  create: (input: { entraOid: string; role: AppRole; email?: string; fullName?: string }) =>
    api.post<ManagedUser>("/users", input),

  update: (id: string, fields: { role?: AppRole; isActive?: boolean }) =>
    api.patch<ManagedUser>(`/users/${id}`, fields),
};
export * from "./settings";
