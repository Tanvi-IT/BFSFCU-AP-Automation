/**
 * Application settings, API keys, webhooks and auto-approval rules.
 *
 * Single-tenant: settings are a single row.
 *
 * Secrets are never returned or stored here — AI credentials come from Managed
 * Identity, and webhook/ERP secrets are Key Vault references.
 */

import { app } from '@azure/functions';
import { createHandler, createMethodHandler, ok, noContent } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { query, queryOne } from '../../shared/db';
import { recordAudit } from '../../shared/repository/activity';
import { createHash, randomBytes } from 'node:crypto';

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------
const SETTABLE = new Set([
  'session_timeout_minutes', 'require_mfa', 'ip_allowlist', 'password_policy',
  'ai_provider', 'azure_doc_intel_endpoint', 'azure_openai_endpoint',
  'azure_openai_deployment', 'azure_openai_api_version',
  'auto_approve_high_confidence', 'require_new_vendor_review',
  'confidence_threshold', 'max_auto_approve_amount', 'require_vendor_active',
  'require_bank_verified', 'require_no_alerts', 'enable_ingestion_logging',
  'fiscal_year_start', 'timezone',
]);

app.http('settings', {
  methods: ['GET', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'settings',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async () => {
        const row = await queryOne(`SELECT * FROM app_settings WHERE id = true`);
        return ok(row ?? {});
      },
    },
    PATCH: {
      roles: Roles.admin,
      handler: async ({ req, user }) => {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

        const sets: string[] = [];
        const params: unknown[] = [];
        for (const [key, value] of Object.entries(body)) {
          if (!SETTABLE.has(key)) continue;
          params.push(value);
          sets.push(`${key} = $${params.length}`);
        }

        if (sets.length === 0) throw AppError.validation('No recognised settings supplied');

        const row = await queryOne(
          `UPDATE app_settings SET ${sets.join(', ')} WHERE id = true RETURNING *`,
          params
        );

        await recordAudit({
          entityType: 'settings',
          entityId: null,
          action: 'settings_updated',
          userId: user.id,
          metadata: { changed: Object.keys(body).filter((k) => SETTABLE.has(k)) },
        });

        return ok(row ?? {});
      },
    },
  }),
});

// --------------------------------------------------------------------------
// API keys
// --------------------------------------------------------------------------
app.http('api-keys', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'api-keys',
  handler: createMethodHandler({
    GET: {
      roles: Roles.admin,
      handler: async () => {
        const keys = await query(
          `SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_at
             FROM api_keys ORDER BY created_at DESC`
        );
        return ok({ keys });
      },
    },
    POST: {
      roles: Roles.admin,
      handler: async ({ req, user }) => {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
        if (!name) throw AppError.validation('Key name is required');

        // Generated once, hashed immediately. The plaintext is returned in this
        // response and never persisted, so it cannot be recovered later.
        const secret = `sk_${randomBytes(24).toString('hex')}`;
        const hash = createHash('sha256').update(secret).digest('hex');
        const prefix = secret.slice(0, 11);

        const row = await queryOne<{ id: string }>(
          `INSERT INTO api_keys (name, key_hash, key_prefix, created_by)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [name, hash, prefix, user.id]
        );

        await recordAudit({
          entityType: 'api_key',
          entityId: row?.id ?? null,
          action: 'api_key_created',
          userId: user.id,
          metadata: { name },
        });

        return ok({ id: row?.id, name, key: secret, keyPrefix: prefix });
      },
    },
  }),
});

app.http('api-keys-revoke', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'api-keys/{id}',
  handler: createHandler({ roles: Roles.admin }, async ({ req, user }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing key id');

    await query(`UPDATE api_keys SET revoked_at = now() WHERE id = $1`, [id]);
    await recordAudit({
      entityType: 'api_key',
      entityId: id,
      action: 'api_key_revoked',
      userId: user.id,
    });

    return noContent();
  }),
});

// --------------------------------------------------------------------------
// Webhooks
// --------------------------------------------------------------------------
app.http('webhooks', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'webhooks',
  handler: createMethodHandler({
    GET: {
      roles: Roles.admin,
      handler: async () => {
        const webhooks = await query(
          `SELECT * FROM webhook_endpoints ORDER BY created_at DESC`
        );
        return ok({ webhooks });
      },
    },
    POST: {
      roles: Roles.admin,
      handler: async ({ req }) => {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const url = typeof body['url'] === 'string' ? body['url'] : '';

        // https only: a webhook carries invoice data off-platform.
        if (!/^https:\/\//.test(url)) {
          throw AppError.validation('Webhook URL must use https');
        }

        const events = Array.isArray(body['events'])
          ? (body['events'] as unknown[]).filter((e): e is string => typeof e === 'string')
          : [];

        const row = await queryOne(
          `INSERT INTO webhook_endpoints (url, events) VALUES ($1, $2) RETURNING *`,
          [url, events]
        );
        return ok(row ?? {});
      },
    },
  }),
});

app.http('webhooks-delete', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'webhooks/{id}',
  handler: createHandler({ roles: Roles.admin }, async ({ req }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing webhook id');
    await query(`DELETE FROM webhook_endpoints WHERE id = $1`, [id]);
    return noContent();
  }),
});

// --------------------------------------------------------------------------
// Auto-approval rules
// --------------------------------------------------------------------------
app.http('auto-approval-rules', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auto-approval-rules',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async () => {
        const rules = await query(
          `SELECT * FROM auto_approval_rules ORDER BY created_at DESC`
        );
        return ok({ rules });
      },
    },
    POST: {
      roles: Roles.admin,
      handler: async ({ req, user }) => {
        const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
        if (!name) throw AppError.validation('Rule name is required');

        const row = await queryOne(
          `INSERT INTO auto_approval_rules
             (name, vendor_id, max_amount, confidence_threshold,
              require_vendor_active, require_bank_verified, require_no_alerts, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            name,
            typeof b['vendor_id'] === 'string' ? b['vendor_id'] : null,
            b['max_amount'] ?? null,
            b['confidence_threshold'] ?? null,
            b['require_vendor_active'] ?? true,
            b['require_bank_verified'] ?? false,
            b['require_no_alerts'] ?? true,
            user.id,
          ]
        );
        return ok(row ?? {});
      },
    },
  }),
});

app.http('rules-update', {
  methods: ['PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auto-approval-rules/{id}',
  handler: createHandler({ roles: Roles.admin }, async ({ req }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing rule id');

    if (req.method === 'DELETE') {
      await query(`DELETE FROM auto_approval_rules WHERE id = $1`, [id]);
      return noContent();
    }

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const row = await queryOne(
      `UPDATE auto_approval_rules
          SET name       = COALESCE($2, name),
              is_active  = COALESCE($3, is_active),
              max_amount = COALESCE($4, max_amount)
        WHERE id = $1 RETURNING *`,
      [id, b['name'] ?? null, b['is_active'] ?? null, b['max_amount'] ?? null]
    );
    return ok(row ?? {});
  }),
});

export {};
