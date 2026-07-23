/**
 * ERP integration: connectors, field mappings, master data, export history
 * and reconciliation events.
 *
 * Read/write of configuration is implemented. The outbound delivery mechanisms
 * (SFTP push, ERP API sync) are NOT ported — in the original system those were
 * stubs that only logged, so nothing working has been lost. See the notes on
 * each stubbed route.
 */

import { app } from '@azure/functions';
import { createHandler, ok, noContent } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { query, queryOne } from '../../shared/db';

/** Master-data tables the UI can read. */
const MASTER_TABLES: Record<string, string> = {
  vendors: 'erp_vendors',
  'gl-accounts': 'erp_gl_accounts',
  'cost-centers': 'erp_cost_centers',
  departments: 'erp_departments',
  'tax-codes': 'erp_tax_codes',
  'payment-terms': 'erp_payment_terms',
};

// --------------------------------------------------------------------------
// Connectors
// --------------------------------------------------------------------------
app.http('erp-connectors', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/connectors',
  handler: createHandler({ roles: Roles.any }, async ({ req, user }) => {
    if (req.method === 'GET') {
      const connectors = await query(
        `SELECT * FROM erp_connectors ORDER BY created_at DESC`
      );
      return ok({ connectors });
    }

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
    const erpSystem = typeof b['erp_system'] === 'string' ? b['erp_system'] : '';
    if (!name || !erpSystem) {
      throw AppError.validation('name and erp_system are required');
    }

    const row = await queryOne(
      `INSERT INTO erp_connectors (name, erp_system, delivery_method, settings)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
      [
        name,
        erpSystem,
        typeof b['delivery_method'] === 'string' ? b['delivery_method'] : 'manual',
        JSON.stringify(b['settings'] ?? {}),
      ]
    );
    return ok(row ?? {});
  }),
});

app.http('erp-connector-delete', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/connectors/{id}',
  handler: createHandler({ roles: Roles.admin }, async ({ req }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing connector id');
    await query(`DELETE FROM erp_connectors WHERE id = $1`, [id]);
    return noContent();
  }),
});

// --------------------------------------------------------------------------
// Field mappings
// --------------------------------------------------------------------------
app.http('erp-mappings', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/mappings',
  handler: createHandler({ roles: Roles.any }, async ({ req, user }) => {
    if (req.method === 'GET') {
      const mappings = await query(
        `SELECT * FROM erp_field_mappings ORDER BY target_field`
      );
      return ok({ mappings });
    }

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const source = typeof b['source_field'] === 'string' ? b['source_field'] : '';
    const target = typeof b['target_field'] === 'string' ? b['target_field'] : '';
    if (!source || !target) {
      throw AppError.validation('source_field and target_field are required');
    }

    const row = await queryOne(
      `INSERT INTO erp_field_mappings (connector_id, source_field, target_field, transform, is_required)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        typeof b['connector_id'] === 'string' ? b['connector_id'] : null,
        source,
        target,
        typeof b['transform'] === 'string' ? b['transform'] : null,
        b['is_required'] === true,
      ]
    );
    return ok(row ?? {});
  }),
});

// --------------------------------------------------------------------------
// Master data
// --------------------------------------------------------------------------
app.http('erp-master', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/master/{entity}',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const entity = req.params['entity'] ?? '';
    const table = MASTER_TABLES[entity];
    if (!table) {
      throw AppError.validation(
        `Unknown entity. Expected one of: ${Object.keys(MASTER_TABLES).join(', ')}`
      );
    }

    // Table name comes from a fixed allow-list above, never from user input.
    const rows = await query(`SELECT * FROM ${table} ORDER BY name LIMIT 1000`);
    return ok({ entity, records: rows });
  }),
});

app.http('erp-master-sync', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/master/sync',
  handler: createHandler({ roles: Roles.admin }, async () => {
    // NOT PORTED: the original `pull-erp-master` function fetched master data
    // from the ERP. It requires ERP connectivity that does not exist in this
    // environment, so it fails loudly rather than pretending to sync.
    throw AppError.upstream(
      'ERP master-data sync is not available yet in the Azure build.'
    );
  }),
});

// --------------------------------------------------------------------------
// Export history & reconciliation
// --------------------------------------------------------------------------
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

app.http('erp-reconciliation', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'erp/reconciliation',
  handler: createHandler({ roles: Roles.any }, async () => {
    const events = await query(
      `SELECT e.*, i.invoice_number
         FROM erp_reconciliation_events e
         LEFT JOIN invoices i ON i.id = e.invoice_id
        ORDER BY e.created_at DESC
        LIMIT 200`
    );
    return ok({ events });
  }),
});

// --------------------------------------------------------------------------
// Email ingestion log
// --------------------------------------------------------------------------
app.http('email-ingestion-logs', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'email-ingestion-logs',
  handler: createHandler({ roles: Roles.admin }, async () => {
    const logs = await query(
      `SELECT * FROM email_ingestion_logs ORDER BY created_at DESC LIMIT 200`
    );
    return ok({ logs });
  }),
});

export {};
