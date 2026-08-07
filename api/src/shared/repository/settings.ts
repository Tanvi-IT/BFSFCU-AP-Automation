/**
 * Application settings (the single app_settings row).
 *
 * Entra SSO config is all non-secret (public client). The Prologue config below
 * includes a SQL Server password, stored ENCRYPTED (shared/crypto.ts) and never
 * returned to clients — the admin API exposes only a "password is set" flag.
 */

import { queryOne } from '../db';
import { encryptSecret, decryptSecret } from '../crypto';

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

// ---------------------------------------------------------------------------
// Prologue (Fiserv) SQL Server connection
// ---------------------------------------------------------------------------

/** Full connection config with the DECRYPTED password — for internal use only
 *  (shared/prologue.ts). Never send this to a client. */
export interface PrologueConfig {
  enabled: boolean;
  host: string | null;
  port: number;
  database: string | null;
  user: string | null;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  companyId: string;
  defaultAccount: string;
  sourceUser: string;
}

/** What the admin UI sees — the password is never returned, only whether one is set. */
export type PrologueSettings = Omit<PrologueConfig, 'password'> & { passwordSet: boolean };

/** Update payload — connection fields only. The posting defaults (company id,
 *  default GL account, source user) are handled in the Prologue stored procedure,
 *  so the app keeps their DB-default values and never updates them here.
 *  `password` replaces the stored one only when non-empty; null/omitted keeps it. */
export type PrologueUpdate = Pick<
  PrologueConfig,
  'enabled' | 'host' | 'port' | 'database' | 'user' | 'encrypt' | 'trustServerCertificate'
> & { password?: string | null };

interface PrologueRow {
  prologue_enabled: boolean;
  prologue_host: string | null;
  prologue_port: number;
  prologue_database: string | null;
  prologue_user: string | null;
  prologue_password: string | null;
  prologue_encrypt: boolean;
  prologue_trust_server_cert: boolean;
  prologue_company_id: string;
  prologue_default_account: string;
  prologue_source_user: string;
}

const PROLOGUE_COLUMNS = `prologue_enabled, prologue_host, prologue_port, prologue_database,
  prologue_user, prologue_password, prologue_encrypt, prologue_trust_server_cert,
  prologue_company_id, prologue_default_account, prologue_source_user`;

function toPrologueConfig(row: PrologueRow | undefined): PrologueConfig {
  return {
    enabled: row?.prologue_enabled ?? false,
    host: row?.prologue_host ?? null,
    port: row?.prologue_port ?? 1433,
    database: row?.prologue_database ?? null,
    user: row?.prologue_user ?? null,
    password: decryptSecret(row?.prologue_password),
    encrypt: row?.prologue_encrypt ?? true,
    trustServerCertificate: row?.prologue_trust_server_cert ?? false,
    companyId: row?.prologue_company_id ?? '01',
    defaultAccount: row?.prologue_default_account ?? '01886910800005',
    sourceUser: row?.prologue_source_user ?? 'TANVI',
  };
}

function toSettings(cfg: PrologueConfig): PrologueSettings {
  const { password, ...rest } = cfg;
  return { ...rest, passwordSet: password.length > 0 };
}

/** Internal: full config incl. decrypted password. Used by shared/prologue.ts. */
export async function getPrologueConfig(): Promise<PrologueConfig> {
  try {
    const row = await queryOne<PrologueRow>(
      `SELECT ${PROLOGUE_COLUMNS} FROM app_settings WHERE id = true`
    );
    return toPrologueConfig(row);
  } catch (err) {
    // Migration 0017 not applied yet (undefined_column): behave as "disabled" so
    // approve() and the rest of the app keep working until the columns exist.
    if ((err as { code?: string })?.code === '42703') return toPrologueConfig(undefined);
    throw err;
  }
}

/** For the admin API — the password is never included. */
export async function getPrologueSettings(): Promise<PrologueSettings> {
  return toSettings(await getPrologueConfig());
}

export async function updatePrologueSettings(input: PrologueUpdate): Promise<PrologueSettings> {
  // Keep the existing password when the client doesn't send a new one — the UI
  // never receives the stored password, so a blank field means "unchanged".
  const setPassword = typeof input.password === 'string' && input.password.length > 0;
  const encrypted = setPassword ? encryptSecret(input.password as string) : null;

  const row = await queryOne<PrologueRow>(
    `UPDATE app_settings SET
        prologue_enabled           = $1,
        prologue_host              = $2,
        prologue_port              = $3,
        prologue_database          = $4,
        prologue_user              = $5,
        prologue_password          = CASE WHEN $6::boolean THEN $7 ELSE prologue_password END,
        prologue_encrypt           = $8,
        prologue_trust_server_cert = $9
      WHERE id = true
      RETURNING ${PROLOGUE_COLUMNS}`,
    [
      input.enabled,
      input.host,
      input.port,
      input.database,
      input.user,
      setPassword,
      encrypted,
      input.encrypt,
      input.trustServerCertificate,
    ]
  );
  return toSettings(toPrologueConfig(row));
}
