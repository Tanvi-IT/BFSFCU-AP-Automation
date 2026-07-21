// Confidence thresholds used by the review queues to decide which invoices
// land in the high- vs low-confidence lists.
//
// This file previously also held POC_TENANT_ID and isPocTenant(), which chose
// between two navigation shells by comparing the signed-in tenant against a
// hardcoded GUID. This build is single-tenant, so that check could never pass;
// both have been removed along with the second shell.

// Confidence threshold for routing invoices
export const HIGH_CONFIDENCE_THRESHOLD = 0.7;
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
