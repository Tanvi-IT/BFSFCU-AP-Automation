/**
 * ERP export services.
 *
 * Trimmed to what the app still uses after the settings/ERP-admin screens were
 * removed: reading ERP connectors (for the export button's config) and the
 * export history list.
 */

import { api } from "@/lib/api";

export const erpApi = {
  connectors: () =>
    api.get<{ connectors: any[] }>("/erp/connectors").then((r) => r.connectors),

  exportHistory: () =>
    api.get<{ history: any[] }>("/erp/export-history").then((r) => r.history),
};
