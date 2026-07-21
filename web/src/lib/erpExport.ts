// ERP Export Format Functions
// Converts mapped invoice data to ERP-specific file formats

export type ERPSystem = 'SAP' | 'Oracle' | 'NetSuite' | 'Dynamics' | 'Odoo' | 'Workday' | 'JackHenry' | 'FIS' | 'Fiserv';

export interface ExportedInvoice {
  canonical_invoice: Record<string, any>;
  mapped_invoice: Record<string, any>;
  erp_system: ERPSystem;
  format: string;
  generated_at: string;
  warnings?: string[];
}

interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

// Helper to flatten nested objects for CSV
const flattenObject = (obj: Record<string, any>, prefix = ''): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] = value?.toString() ?? '';
    }
  }
  return result;
};

// Convert object to CSV format
const toCSV = (data: Record<string, any>): string => {
  const flat = flattenObject(data);
  const headers = Object.keys(flat).join(',');
  const values = Object.values(flat).map(v => `"${v?.replace(/"/g, '""') || ''}"`).join(',');
  return `${headers}\n${values}`;
};

// Convert object to XML format
const toXML = (data: Record<string, any>, rootElement = 'Invoice'): string => {
  const escapeXml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const convertToXml = (obj: any, indent = '  '): string => {
    let xml = '';
    for (const [key, value] of Object.entries(obj)) {
      const tagName = key.replace(/[^a-zA-Z0-9_]/g, '_');
      if (value === null || value === undefined) {
        xml += `${indent}<${tagName}/>\n`;
      } else if (Array.isArray(value)) {
        xml += `${indent}<${tagName}>\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            xml += `${indent}  <Item>\n${convertToXml(item, indent + '    ')}${indent}  </Item>\n`;
          } else {
            xml += `${indent}  <Item>${escapeXml(String(item))}</Item>\n`;
          }
        }
        xml += `${indent}</${tagName}>\n`;
      } else if (typeof value === 'object') {
        xml += `${indent}<${tagName}>\n${convertToXml(value, indent + '  ')}${indent}</${tagName}>\n`;
      } else {
        xml += `${indent}<${tagName}>${escapeXml(String(value))}</${tagName}>\n`;
      }
    }
    return xml;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n${convertToXml(data)}</${rootElement}>`;
};

// SAP Export - CSV format
export function generateSAPExport(data: ExportedInvoice): ExportResult {
  const mapped = data.mapped_invoice;
  const csv = toCSV({
    ...mapped,
    line_items: undefined, // Exclude line items from main CSV
  });
  
  // Line items as separate CSV if present
  let fullCSV = csv;
  if (mapped.line_items?.length) {
    fullCSV += '\n\n# Line Items\n';
    const lineHeaders = Object.keys(mapped.line_items[0]).join(',');
    fullCSV += lineHeaders + '\n';
    for (const item of mapped.line_items) {
      fullCSV += Object.values(item).map(v => `"${v?.toString()?.replace(/"/g, '""') || ''}"`).join(',') + '\n';
    }
  }

  return {
    blob: new Blob([fullCSV], { type: 'text/csv' }),
    filename: `invoice_${mapped.invoice_number || 'export'}_SAP.csv`,
    mimeType: 'text/csv',
  };
}

// NetSuite Export - JSON format
export function generateNetSuiteExport(data: ExportedInvoice): ExportResult {
  const netsuitePayload = {
    type: 'vendorbill',
    ...data.mapped_invoice,
    exportMetadata: {
      source: 'AP Automation',
      generatedAt: data.generated_at,
      format: 'NetSuite JSON',
    },
  };

  return {
    blob: new Blob([JSON.stringify(netsuitePayload, null, 2)], { type: 'application/json' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_NetSuite.json`,
    mimeType: 'application/json',
  };
}

// Oracle Export - XML format
export function generateOracleExport(data: ExportedInvoice): ExportResult {
  const xml = toXML({
    Header: {
      InvoiceNumber: data.mapped_invoice.invoice_number,
      InvoiceDate: data.mapped_invoice.invoice_date,
      DueDate: data.mapped_invoice.due_date,
      TransactionDate: data.mapped_invoice.transaction_date,
      Currency: data.mapped_invoice.currency,
      TotalAmount: data.mapped_invoice.total_amount,
      TaxAmount: data.mapped_invoice.tax_amount,
      SubtotalAmount: data.mapped_invoice.subtotal_amount,
    },
    Vendor: data.mapped_invoice.vendor || {
      VendorName: data.mapped_invoice.vendor_name,
      VendorId: data.mapped_invoice.vendor_id,
      VendorTaxId: data.mapped_invoice.vendor_tax_id,
    },
    LineItems: data.mapped_invoice.line_items || [],
    Metadata: {
      Source: 'AP Automation',
      GeneratedAt: data.generated_at,
    },
  }, 'OracleAPInvoice');

  return {
    blob: new Blob([xml], { type: 'application/xml' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_Oracle.xml`,
    mimeType: 'application/xml',
  };
}

// Dynamics 365 Export - CSV format
export function generateDynamicsExport(data: ExportedInvoice): ExportResult {
  const csv = toCSV({
    ...data.mapped_invoice,
    line_items: undefined,
  });

  return {
    blob: new Blob([csv], { type: 'text/csv' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_Dynamics.csv`,
    mimeType: 'text/csv',
  };
}

// Odoo Export - JSON format
export function generateOdooExport(data: ExportedInvoice): ExportResult {
  const odooPayload = {
    model: 'account.move',
    method: 'create',
    args: [{
      move_type: 'in_invoice',
      ref: data.mapped_invoice.invoice_number,
      invoice_date: data.mapped_invoice.invoice_date,
      invoice_date_due: data.mapped_invoice.due_date,
      transaction_date: data.mapped_invoice.transaction_date,
      currency_id: data.mapped_invoice.currency,
      amount_total: data.mapped_invoice.total_amount,
      partner_id: data.mapped_invoice.vendor_external_id || data.mapped_invoice.vendor_name,
      invoice_line_ids: (data.mapped_invoice.line_items || []).map((line: any) => [0, 0, {
        name: line.description,
        quantity: line.quantity,
        price_unit: line.unit_price,
        account_id: line.gl_code,
      }]),
    }],
    kwargs: {},
  };

  return {
    blob: new Blob([JSON.stringify(odooPayload, null, 2)], { type: 'application/json' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_Odoo.json`,
    mimeType: 'application/json',
  };
}

// Workday Export - JSON format
export function generateWorkdayExport(data: ExportedInvoice): ExportResult {
  const workdayPayload = {
    SupplierInvoice: {
      InvoiceNumber: data.mapped_invoice.invoice_number,
      InvoiceDate: data.mapped_invoice.invoice_date,
      DueDate: data.mapped_invoice.due_date,
      TransactionDate: data.mapped_invoice.transaction_date,
      Currency: data.mapped_invoice.currency,
      TotalAmount: data.mapped_invoice.total_amount,
      Supplier: {
        Name: data.mapped_invoice.vendor_name,
        TaxID: data.mapped_invoice.vendor_tax_id,
      },
      Lines: data.mapped_invoice.line_items || [],
    },
    Metadata: {
      Source: 'AP Automation',
      GeneratedAt: data.generated_at,
    },
  };

  return {
    blob: new Blob([JSON.stringify(workdayPayload, null, 2)], { type: 'application/json' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_Workday.json`,
    mimeType: 'application/json',
  };
}

// Jack Henry Export - JSON format
export function generateJackHenryExport(data: ExportedInvoice): ExportResult {
  const jhPayload = {
    TransactionType: 'AP_INVOICE',
    ...data.mapped_invoice,
    CoreSystemFormat: 'JackHenry',
    ExportSource: 'AP Automation',
    GeneratedAt: data.generated_at,
  };

  return {
    blob: new Blob([JSON.stringify(jhPayload, null, 2)], { type: 'application/json' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_JackHenry.json`,
    mimeType: 'application/json',
  };
}

// FIS Export - JSON format
export function generateFISExport(data: ExportedInvoice): ExportResult {
  const fisPayload = {
    TransactionType: 'VENDOR_PAYMENT',
    ...data.mapped_invoice,
    CoreSystemFormat: 'FIS',
    ExportSource: 'AP Automation',
    GeneratedAt: data.generated_at,
  };

  return {
    blob: new Blob([JSON.stringify(fisPayload, null, 2)], { type: 'application/json' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_FIS.json`,
    mimeType: 'application/json',
  };
}

// Fiserv Export - JSON format
export function generateFiservExport(data: ExportedInvoice): ExportResult {
  const fiservPayload = {
    TransactionType: 'AP_PAYMENT',
    ...data.mapped_invoice,
    CoreSystemFormat: 'Fiserv',
    ExportSource: 'AP Automation',
    GeneratedAt: data.generated_at,
  };

  return {
    blob: new Blob([JSON.stringify(fiservPayload, null, 2)], { type: 'application/json' }),
    filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}_Fiserv.json`,
    mimeType: 'application/json',
  };
}

// Main export function that routes to correct formatter
export function generateERPExport(data: ExportedInvoice): ExportResult {
  switch (data.erp_system) {
    case 'SAP':
      return generateSAPExport(data);
    case 'NetSuite':
      return generateNetSuiteExport(data);
    case 'Oracle':
      return generateOracleExport(data);
    case 'Dynamics':
      return generateDynamicsExport(data);
    case 'Odoo':
      return generateOdooExport(data);
    case 'Workday':
      return generateWorkdayExport(data);
    case 'JackHenry':
      return generateJackHenryExport(data);
    case 'FIS':
      return generateFISExport(data);
    case 'Fiserv':
      return generateFiservExport(data);
    default:
      // Default to JSON export
      return {
        blob: new Blob([JSON.stringify(data.mapped_invoice, null, 2)], { type: 'application/json' }),
        filename: `invoice_${data.mapped_invoice.invoice_number || 'export'}.json`,
        mimeType: 'application/json',
      };
  }
}

// Download helper
export function downloadExport(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ERP Systems list for UI
export const ERP_SYSTEMS: { value: ERPSystem; label: string; format: string }[] = [
  { value: 'SAP', label: 'SAP', format: 'CSV' },
  { value: 'Oracle', label: 'Oracle Fusion', format: 'XML' },
  { value: 'NetSuite', label: 'NetSuite', format: 'JSON' },
  { value: 'Dynamics', label: 'Microsoft Dynamics 365', format: 'CSV' },
  { value: 'Odoo', label: 'Odoo', format: 'JSON' },
  { value: 'Workday', label: 'Workday Finance', format: 'JSON' },
  { value: 'JackHenry', label: 'Jack Henry', format: 'JSON' },
  { value: 'FIS', label: 'FIS', format: 'JSON' },
  { value: 'Fiserv', label: 'Fiserv', format: 'JSON' },
];
