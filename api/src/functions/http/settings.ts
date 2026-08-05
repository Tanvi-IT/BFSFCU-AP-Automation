/**
 * Admin settings.
 *
 *   GET /api/settings/sso   -> current Entra SSO configuration
 *   PUT /api/settings/sso   -> update it   { enabled, tenantId, clientId }
 *
 * Admin only. Values are non-secret (public client / PKCE) — no client secret is
 * accepted or stored. GET and PUT share the route and the same (admin) role, so
 * one registration with a method switch is correct here.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { getSsoConfig, updateSsoConfig } from '../../shared/repository/settings';

app.http('settings-sso', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'settings/sso',
  handler: createHandler({ roles: Roles.admin }, async ({ req, log }) => {
    if (req.method === 'GET') {
      return ok(await getSsoConfig());
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const enabled = body['enabled'] === true;
    const tenantId =
      typeof body['tenantId'] === 'string' && body['tenantId'].trim()
        ? body['tenantId'].trim()
        : null;
    const clientId =
      typeof body['clientId'] === 'string' && body['clientId'].trim()
        ? body['clientId'].trim()
        : null;

    if (enabled && (!tenantId || !clientId)) {
      throw AppError.validation('Tenant ID and Client ID are required to enable SSO.');
    }

    const updated = await updateSsoConfig({ enabled, tenantId, clientId });
    log.info('Entra SSO settings updated', { enabled: updated.enabled });
    return ok(updated);
  }),
});
