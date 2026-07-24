/**
 * ERP — the parts still used after the ERP-admin screens were removed:
 *
 *   GET  /api/erp/connectors        connector config for the export button
 *
 * Export history is gone: exports are not audited, so there is nothing to
 * record and nothing to list. The connector/mapping/master-data/reconciliation
 * management endpoints were removed earlier along with their admin pages.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { query } from '../../shared/db';

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

export {};
