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
import {
  getSsoConfig,
  updateSsoConfig,
  getPrologueSettings,
  updatePrologueSettings,
  type PrologueConfig,
} from '../../shared/repository/settings';
import * as prologue from '../../shared/prologue';

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

// ---------------------------------------------------------------------------
// Prologue (Fiserv) SQL Server connection
//
//   GET  /api/settings/prologue        current config (password NEVER returned)
//   PUT  /api/settings/prologue        update it
//   POST /api/settings/prologue/test   test the connection (stored or form values)
//
// Admin only. The password is write-only over the API: PUT stores it (encrypted)
// only when a non-empty value is sent; a blank field keeps the existing password.
// ---------------------------------------------------------------------------

/** Trimmed string field, or null when absent/blank. */
function strField(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

app.http('settings-prologue', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'settings/prologue',
  handler: createHandler({ roles: Roles.admin }, async ({ req, log }) => {
    if (req.method === 'GET') {
      return ok(await getPrologueSettings());
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const enabled = body['enabled'] === true;
    const host = strField(body, 'host');
    const database = strField(body, 'database');
    const user = strField(body, 'user');
    const portRaw = Number(body['port']);
    const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : 1433;
    const encrypt = body['encrypt'] !== false; // default TLS on
    const trustServerCertificate = body['trustServerCertificate'] === true;
    const companyId = strField(body, 'companyId') ?? '01';
    const defaultAccount = strField(body, 'defaultAccount') ?? '01886910800005';
    const sourceUser = strField(body, 'sourceUser') ?? 'TANVI';
    // Only replace the password when a non-empty value is sent.
    const password =
      typeof body['password'] === 'string' && (body['password'] as string).length > 0
        ? (body['password'] as string)
        : null;

    if (enabled && (!host || !database || !user)) {
      throw AppError.validation('Host, Database, and User are required to enable Prologue.');
    }

    const updated = await updatePrologueSettings({
      enabled,
      host,
      port,
      database,
      user,
      password,
      encrypt,
      trustServerCertificate,
      companyId,
      defaultAccount,
      sourceUser,
    });
    log.info('Prologue settings updated', { enabled: updated.enabled });
    return ok(updated);
  }),
});

app.http('settings-prologue-test', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'settings/prologue/test',
  handler: createHandler({ roles: Roles.admin }, async ({ req, log }) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Build an override from whatever the (possibly unsaved) form sent; the
    // password is only overridden when provided, otherwise the stored one is used.
    const override: Partial<PrologueConfig> = {};
    const host = strField(body, 'host');
    const database = strField(body, 'database');
    const user = strField(body, 'user');
    if (host) override.host = host;
    if (database) override.database = database;
    if (user) override.user = user;
    const portRaw = Number(body['port']);
    if (Number.isFinite(portRaw) && portRaw > 0) override.port = Math.trunc(portRaw);
    if (typeof body['encrypt'] === 'boolean') override.encrypt = body['encrypt'];
    if (typeof body['trustServerCertificate'] === 'boolean')
      override.trustServerCertificate = body['trustServerCertificate'];
    if (typeof body['password'] === 'string' && (body['password'] as string).length > 0)
      override.password = body['password'] as string;

    const result = await prologue.testConnection(override);
    log.info('Prologue connection test', { ok: result.ok });
    return ok(result);
  }),
});
