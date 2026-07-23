/**
 * ERP — the parts still used after the ERP-admin screens were removed:
 *
 *   GET  /api/erp/connectors        connector config for the export button
 *   GET  /api/erp/export-history    the Export History list
 *   POST /api/erp/export-history    record an export
 *
 * The connector/mapping/master-data/reconciliation management endpoints were
 * removed along with their (unlinked) admin pages. Their tables remain.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { query, queryOne } from '../../shared/db';

app.http('erp-connectors', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/connectors',
  handler: createHandler({ roles: Roles.any }, async () => {
    const connectors = await query(
      `SELECT * FROM erp_connectors ORDER BY created_at DESC`
    );
    return ok({ connectors });
  }),
});

app.http('erp-export-history', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/export-history',
  handler: createHandler({ roles: Roles.any }, async ({ req, user }) => {
    if (req.method === 'GET') {
      const history = await query(
        `SELECT * FROM erp_export_history ORDER BY created_at DESC LIMIT 200`
      );
      return ok({ history });
    }

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = Array.isArray(b['invoice_ids'])
      ? (b['invoice_ids'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];

    const row = await queryOne(
      `INSERT INTO erp_export_history
         (erp_system, export_format, delivery_method, status, invoice_ids, invoice_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        typeof b['erp_system'] === 'string' ? b['erp_system'] : 'csv',
        typeof b['export_format'] === 'string' ? b['export_format'] : 'csv',
        typeof b['delivery_method'] === 'string' ? b['delivery_method'] : 'manual',
        typeof b['status'] === 'string' ? b['status'] : 'completed',
        ids,
        ids.length,
        user.id,
      ]
    );
    return ok(row ?? {});
  }),
});

export {};
