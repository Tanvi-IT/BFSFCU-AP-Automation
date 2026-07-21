// AP Automation Canonical Data Contract
// Universal schema for ERP exports

export interface CanonicalVendor {
  vendor_id: string;
  legal_name: string;
  display_name: string;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  bank_details: {
    account_number: string | null;
    routing_number: string | null;
  };
  risk_score: number | null;
  enrichment_summary: string | null;
}

export interface CanonicalLineItem {
  line_number: number;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  gl_code: string | null;
  cost_center: string | null;
  tax_code: string | null;
}

export interface CanonicalInvoice {
  invoice_id: string;
  vendor: {
    vendor_id: string;
    legal_name: string;
    tax_id: string | null;
    bank_account: string | null;
    routing_number: string | null;
    address: string | null;
  };
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number;
  line_items: CanonicalLineItem[];
  contract_mismatch_flags: string[];
  anomaly_flags: string[];
  po_number: string | null;
  erp_reference_id: string | null;
}

export interface CanonicalExportPayload {
  tenant_id: string;
  export_timestamp: string;
  erp_type: string;
  invoices: CanonicalInvoice[];
  vendor_count: number;
  total_value: number;
  currency_summary: Record<string, number>;
}

// ERP Connector configuration schemas
export interface ERPConnectorConfig {
  sap: {
    company_code?: string;
    plant?: string;
    client_number?: string;
    base_url?: string;
  };
  netsuite: {
    account_id?: string;
    subsidiary_id?: string;
    environment?: 'sandbox' | 'production';
  };
  oracle: {
    business_unit?: string;
    ledger_id?: string;
    legal_entity?: string;
  };
  dynamics: {
    company_id?: string;
    environment?: string;
    data_area_id?: string;
  };
  odoo: {
    database?: string;
    company_id?: number;
  };
  quickbooks: {
    realm_id?: string;
    environment?: 'sandbox' | 'production';
  };
  tally: {
    company_name?: string;
    export_format?: 'xml' | 'json';
  };
}

export type ERPType = keyof ERPConnectorConfig;

export const ERP_TYPES: { value: ERPType; label: string; description: string }[] = [
  { value: 'sap', label: 'SAP', description: 'SAP S/4HANA, ECC' },
  { value: 'netsuite', label: 'NetSuite', description: 'Oracle NetSuite ERP' },
  { value: 'oracle', label: 'Oracle Fusion', description: 'Oracle Cloud Financials' },
  { value: 'dynamics', label: 'Microsoft Dynamics', description: 'D365 Finance & Operations' },
  { value: 'odoo', label: 'Odoo', description: 'Odoo ERP' },
  { value: 'quickbooks', label: 'QuickBooks', description: 'QuickBooks Online' },
  { value: 'tally', label: 'Tally', description: 'Tally Prime' },
];

// Config field definitions for UI generation
export const ERP_CONFIG_FIELDS: Record<ERPType, { key: string; label: string; type: 'text' | 'select'; options?: string[] }[]> = {
  sap: [
    { key: 'company_code', label: 'Company Code', type: 'text' },
    { key: 'plant', label: 'Plant', type: 'text' },
    { key: 'client_number', label: 'Client Number', type: 'text' },
    { key: 'base_url', label: 'API Base URL', type: 'text' },
  ],
  netsuite: [
    { key: 'account_id', label: 'Account ID', type: 'text' },
    { key: 'subsidiary_id', label: 'Subsidiary ID', type: 'text' },
    { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'production'] },
  ],
  oracle: [
    { key: 'business_unit', label: 'Business Unit', type: 'text' },
    { key: 'ledger_id', label: 'Ledger ID', type: 'text' },
    { key: 'legal_entity', label: 'Legal Entity', type: 'text' },
  ],
  dynamics: [
    { key: 'company_id', label: 'Company ID', type: 'text' },
    { key: 'environment', label: 'Environment', type: 'text' },
    { key: 'data_area_id', label: 'Data Area ID', type: 'text' },
  ],
  odoo: [
    { key: 'database', label: 'Database Name', type: 'text' },
    { key: 'company_id', label: 'Company ID', type: 'text' },
  ],
  quickbooks: [
    { key: 'realm_id', label: 'Realm ID', type: 'text' },
    { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'production'] },
  ],
  tally: [
    { key: 'company_name', label: 'Company Name', type: 'text' },
    { key: 'export_format', label: 'Export Format', type: 'select', options: ['xml', 'json'] },
  ],
};

// Auth field definitions
export const ERP_AUTH_FIELDS: Record<ERPType, { key: string; label: string; type: 'text' | 'password' }[]> = {
  sap: [
    { key: 'username', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'api_key', label: 'API Key', type: 'password' },
  ],
  netsuite: [
    { key: 'consumer_key', label: 'Consumer Key', type: 'password' },
    { key: 'consumer_secret', label: 'Consumer Secret', type: 'password' },
    { key: 'token_id', label: 'Token ID', type: 'password' },
    { key: 'token_secret', label: 'Token Secret', type: 'password' },
  ],
  oracle: [
    { key: 'username', label: 'Username', type: 'text' },
    { key: 'password', label: 'Password', type: 'password' },
  ],
  dynamics: [
    { key: 'client_id', label: 'Client ID', type: 'text' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'tenant_id', label: 'Azure Tenant ID', type: 'text' },
  ],
  odoo: [
    { key: 'api_key', label: 'API Key', type: 'password' },
  ],
  quickbooks: [
    { key: 'client_id', label: 'Client ID', type: 'text' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'refresh_token', label: 'Refresh Token', type: 'password' },
  ],
  tally: [
    { key: 'license_key', label: 'License Key', type: 'password' },
  ],
};
