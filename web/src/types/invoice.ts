export type RiskLevel = 'low' | 'medium' | 'high';
export type InvoiceStatus =
  | 'draft'
  | 'ingested'
  | 'submitted'
  | 'validated'
  | 'exception'
  | 'approved'
  | 'rejected'
  | 'exported';
export type InvoiceSource = 'manual_upload' | 'email' | 'api';
export type AppRole = 'admin' | 'user';
export type Severity = 'low' | 'medium' | 'high';

export interface CanonicalInvoiceLineItem {
  id: string;
  lineNumber: number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  glCode?: string | null;
  costCenter?: string | null;
  taxCode?: string | null;
  isFlagged: boolean;
}

export interface CanonicalInvoiceAnomaly {
  id: string;
  code: string;
  severity: Severity;
  fieldName?: string | null;
  message: string;
  createdAt: string;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}

export interface CanonicalInvoice {
  id: string;
  tenantId: string;
  vendorId: string;
  poId?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  currency: string;
  subtotalAmount?: number | null;
  taxAmount?: number | null;
  totalAmount: number;
  status: InvoiceStatus;
  source: InvoiceSource;
  anomalyScore?: number | null;
  riskLevel: RiskLevel;
  rawFilePath?: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: CanonicalInvoiceLineItem[];
  anomalies?: CanonicalInvoiceAnomaly[];
  vendor?: {
    id: string;
    name: string;
  };
}

export interface Tenant {
  id: string;
  name: string;
  erpType?: string | null;
  emailAlias?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  externalId?: string | null;
  taxId?: string | null;
  bankAccount?: string | null;
  bankVerified: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}
