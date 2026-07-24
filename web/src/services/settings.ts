/**
 * ERP export services.
 *
 * Only the connector config the export button reads. Export history was removed
 * outright — exports are not audited, so nothing records or lists them.
 */

import { api } from "@/lib/api";

export const erpApi = {
  connectors: () =>
    api.get<{ connectors: any[] }>("/erp/connectors").then((r) => r.connectors),
};
