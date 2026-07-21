/**
 * Administrative actions.
 *
 *   POST /api/maintenance/demo-reset   clear demo data
 *
 * NOTE: this is destructive and admin-only. Unlike the endpoint it replaces,
 * it requires an authenticated administrator — the original `demo-reset`
 * function was reachable by anyone who knew the URL.
 *
 * The route is `maintenance/`, not `admin/`: the Functions host reserves the
 * `admin` path segment for its own management API and refuses to register a
 * function that claims it, routePrefix notwithstanding.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { transaction } from '../../shared/db';
import { recordAudit } from '../../shared/repository/activity';

app.http('admin-demo-reset', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'maintenance/demo-reset',
  handler: createHandler({ roles: Roles.admin }, async ({ req, user, log }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Deliberate friction: the caller must confirm explicitly.
    if (body['confirm'] !== 'DELETE') {
      throw AppError.validation('Confirmation required: send { "confirm": "DELETE" }');
    }

    const counts = await transaction(async (client) => {
      // Children first, then invoices, then vendors (FK order).
      await client.query('DELETE FROM invoice_line_items');
      await client.query('DELETE FROM invoice_anomalies');
      await client.query('DELETE FROM invoice_notes');
      const inv = await client.query('DELETE FROM invoices RETURNING id');
      const ven = await client.query('DELETE FROM vendors RETURNING id');
      return { invoices: inv.rowCount ?? 0, vendors: ven.rowCount ?? 0 };
    });

    // audit_logs is append-only and deliberately NOT cleared — the record of
    // who reset the data must survive the reset.
    await recordAudit({
      entityType: 'system',
      entityId: null,
      action: 'demo_reset',
      userId: user.id,
      metadata: counts,
    });

    log.warn('Demo data reset', counts);
    return ok({ success: true, ...counts });
  }),
});

export {};
