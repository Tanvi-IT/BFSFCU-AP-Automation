/**
 * Demo utilities — available only when DEMO_MODE is enabled.
 *
 *   POST /api/demo/reset   wipe transactional data (admin, demo-only)
 *
 * Clears the invoice graph and vendors so a presenter gets a clean slate
 * between demos. Deliberately PRESERVED:
 *   - users            (so you can still sign in)
 *   - audit_logs       (append-only by DB trigger; never cleared)
 *   - configuration    (app settings, ERP reference/mappings, departments)
 *
 * Disabled in production: with DEMO_MODE unset the endpoint 404s, so even a
 * caller who knows the route cannot wipe a production database.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { config } from '../../shared/config';
import { query } from '../../shared/db';
import { recordAudit } from '../../shared/repository/activity';

app.http('demo-reset', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'demo/reset',
  handler: createHandler({ roles: Roles.admin }, async ({ user, log }) => {
    if (!config.demo.enabled) {
      // Not a demo environment — behave as though the route does not exist.
      throw AppError.notFound('Not found');
    }

    // TRUNCATE ... CASCADE clears invoices + vendors and every table that
    // references them (line items, anomalies, notes, attachments, vendor
    // rules, invoice/vendor-linked logs). audit_logs references users, not
    // invoices, so CASCADE never reaches it; users and configuration tables
    // reference neither and are left intact.
    await query('TRUNCATE TABLE invoices, vendors RESTART IDENTITY CASCADE');

    // The reset itself is recorded — audit_logs is the one thing not wiped.
    await recordAudit({
      entityType: 'system',
      entityId: null,
      action: 'demo_reset',
      userId: user.id,
      metadata: {},
    });

    log.warn('Demo database reset', { by: user.id });
    return ok({ ok: true });
  }),
});

export {};
