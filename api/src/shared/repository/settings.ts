/**
 * Application settings (the single app_settings row).
 *
 * Only the Entra SSO configuration is exposed here for now — all non-secret:
 * a public-client integration, so no client secret is ever stored.
 */

import { queryOne } from '../db';

export interface SsoConfig {
  enabled: boolean;
  tenantId: string | null;
  clientId: string | null;
}

interface SsoRow {
  entra_enabled: boolean;
  entra_tenant_id: string | null;
  entra_client_id: string | null;
}

function toConfig(row: SsoRow | undefined): SsoConfig {
  return {
    enabled: row?.entra_enabled ?? false,
    tenantId: row?.entra_tenant_id ?? null,
    clientId: row?.entra_client_id ?? null,
  };
}

export async function getSsoConfig(): Promise<SsoConfig> {
  const row = await queryOne<SsoRow>(
    `SELECT entra_enabled, entra_tenant_id, entra_client_id
       FROM app_settings WHERE id = true`
  );
  return toConfig(row);
}

export async function updateSsoConfig(input: SsoConfig): Promise<SsoConfig> {
  const row = await queryOne<SsoRow>(
    `UPDATE app_settings
        SET entra_enabled   = $1,
            entra_tenant_id = $2,
            entra_client_id = $3
      WHERE id = true
      RETURNING entra_enabled, entra_tenant_id, entra_client_id`,
    [input.enabled, input.tenantId, input.clientId]
  );
  return toConfig(row);
}
