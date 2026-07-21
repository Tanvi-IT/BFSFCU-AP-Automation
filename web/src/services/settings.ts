/**
 * Settings, API keys, webhooks, auto-approval rules and ERP.
 */

import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Application settings (single row)
// ---------------------------------------------------------------------------
export interface AppSettings {
  session_timeout_minutes: number;
  require_mfa: boolean;
  ip_allowlist: string[];
  ai_provider: string;
  azure_doc_intel_endpoint: string | null;
  azure_openai_endpoint: string | null;
  azure_openai_deployment: string | null;
  azure_openai_api_version: string | null;
  auto_approve_high_confidence: boolean;
  require_new_vendor_review: boolean;
  confidence_threshold: number;
  max_auto_approve_amount: number | null;
  require_vendor_active: boolean;
  require_bank_verified: boolean;
  require_no_alerts: boolean;
  enable_ingestion_logging: boolean;
  fiscal_year_start: number;
  timezone: string;
  [key: string]: unknown;
}

export const settingsApi = {
  get: () => api.get<AppSettings>("/settings"),
  update: (fields: Partial<AppSettings>) => api.patch<AppSettings>("/settings", fields),
};

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export const apiKeysApi = {
  list: () => api.get<{ keys: ApiKey[] }>("/api-keys").then((r) => r.keys),
  /** The plaintext key is returned once here and never again. */
  create: (name: string) =>
    api.post<{ id: string; name: string; key: string; keyPrefix: string }>("/api-keys", {
      name,
    }),
  revoke: (id: string) => api.delete<void>(`/api-keys/${id}`),
};

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_status: number | null;
  last_sent_at: string | null;
  failure_count: number;
  created_at: string;
  [key: string]: unknown;
}

export const webhooksApi = {
  list: () => api.get<{ webhooks: Webhook[] }>("/webhooks").then((r) => r.webhooks),
  create: (url: string, events: string[]) =>
    api.post<Webhook>("/webhooks", { url, events }),
  remove: (id: string) => api.delete<void>(`/webhooks/${id}`),
};

// ---------------------------------------------------------------------------
// Auto-approval rules
// ---------------------------------------------------------------------------
export interface AutoApprovalRule {
  id: string;
  name: string;
  is_active: boolean;
  vendor_id: string | null;
  max_amount: number | null;
  confidence_threshold: number | null;
  require_vendor_active: boolean;
  require_bank_verified: boolean;
  require_no_alerts: boolean;
  created_at: string;
  [key: string]: unknown;
}

export const rulesApi = {
  list: () =>
    api.get<{ rules: AutoApprovalRule[] }>("/auto-approval-rules").then((r) => r.rules),
  create: (rule: Partial<AutoApprovalRule>) =>
    api.post<AutoApprovalRule>("/auto-approval-rules", rule),
  update: (id: string, fields: Partial<AutoApprovalRule>) =>
    api.patch<AutoApprovalRule>(`/auto-approval-rules/${id}`, fields),
  remove: (id: string) => api.delete<void>(`/auto-approval-rules/${id}`),
};

// ---------------------------------------------------------------------------
// ERP
// ---------------------------------------------------------------------------
export type ErpMasterEntity =
  | "vendors"
  | "gl-accounts"
  | "cost-centers"
  | "departments"
  | "tax-codes"
  | "payment-terms";

export const erpApi = {
  connectors: () =>
    api.get<{ connectors: any[] }>("/erp/connectors").then((r) => r.connectors),
  createConnector: (c: Record<string, unknown>) => api.post<any>("/erp/connectors", c),
  deleteConnector: (id: string) => api.delete<void>(`/erp/connectors/${id}`),

  mappings: () => api.get<{ mappings: any[] }>("/erp/mappings").then((r) => r.mappings),
  createMapping: (m: Record<string, unknown>) => api.post<any>("/erp/mappings", m),

  master: (entity: ErpMasterEntity) =>
    api.get<{ entity: string; records: any[] }>(`/erp/master/${entity}`).then((r) => r.records),
  /** Not available yet — the ERP sync mechanism was a stub in the old system. */
  syncMaster: () => api.post<void>("/erp/master/sync", {}),

  exportHistory: () =>
    api.get<{ history: any[] }>("/erp/export-history").then((r) => r.history),
  recordExport: (e: Record<string, unknown>) => api.post<any>("/erp/export-history", e),

  reconciliation: () =>
    api.get<{ events: any[] }>("/erp/reconciliation").then((r) => r.events),

  emailLogs: () =>
    api.get<{ logs: any[] }>("/email-ingestion-logs").then((r) => r.logs),
};
