// POC Mode Configuration
// This tenant ID gets the simplified POC navigation and UI
export const POC_TENANT_ID = "f99fbaa7-49b4-4d99-818e-c793f45c16f5";

export const isPocTenant = (tenantId: string | null): boolean => {
  return tenantId === POC_TENANT_ID;
};

// Confidence threshold for routing invoices
export const HIGH_CONFIDENCE_THRESHOLD = 0.7;
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
