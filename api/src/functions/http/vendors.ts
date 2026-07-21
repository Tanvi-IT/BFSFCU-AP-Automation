/**
 * Vendor routes.
 *
 *   GET   /api/vendors            list (filter by status / search)
 *   GET   /api/vendors/{id}
 *   PATCH /api/vendors/{id}       edit details
 *   POST  /api/vendors/{id}/status   approve / block a vendor
 */

import { app } from '@azure/functions';
import { createHandler, createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import * as vendors from '../../shared/repository/vendors';

const VALID_STATUS = new Set(['pending_verification', 'active', 'blocked']);

app.http('vendors-list', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    const rows = await vendors.list({
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
      ...(status && VALID_STATUS.has(status)
        ? { status: status as vendors.VendorStatus }
        : {}),
      ...(search ? { search } : {}),
    });

    return ok({ vendors: rows });
  }),
});

app.http('vendor-by-id', {
  methods: ['GET', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{id}',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async ({ req }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing vendor id');

        const vendor = await vendors.getById(id);
        if (!vendor) throw AppError.notFound('Vendor not found');

        return ok(vendor);
      },
    },
    PATCH: {
      roles: Roles.reviewer,
      handler: async ({ req, user }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing vendor id');

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const updated = await vendors.update(
          id,
          {
            ...(typeof body['name'] === 'string' ? { name: body['name'] } : {}),
            ...(typeof body['taxId'] === 'string' ? { taxId: body['taxId'] } : {}),
            ...(typeof body['bankAccount'] === 'string'
              ? { bankAccount: body['bankAccount'] }
              : {}),
          },
          user.id
        );

        if (!updated) throw AppError.notFound('Vendor not found');
        return ok(updated);
      },
    },
  }),
});

app.http('vendors-status', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{id}/status',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing vendor id');

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof body['status'] === 'string' ? body['status'] : '';

    if (!VALID_STATUS.has(status)) {
      throw AppError.validation(
        `status must be one of: ${[...VALID_STATUS].join(', ')}`
      );
    }

    const updated = await vendors.setStatus(id, status as vendors.VendorStatus, user.id);
    if (!updated) throw AppError.notFound('Vendor not found');

    log.info('Vendor status changed', { vendorId: id, status });
    return ok(updated);
  }),
});

app.http('vendors-merge', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{id}/merge',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing vendor id');

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const targetId = typeof body['targetVendorId'] === 'string' ? body['targetVendorId'] : '';
    if (!targetId) throw AppError.validation('targetVendorId is required');
    if (targetId === id) throw AppError.validation('Cannot merge a vendor into itself');

    const result = await vendors.merge(id, targetId, user.id);
    log.info('Vendors merged', { sourceId: id, targetId, ...result });

    return ok({ merged: true, ...result });
  }),
});

export {};
