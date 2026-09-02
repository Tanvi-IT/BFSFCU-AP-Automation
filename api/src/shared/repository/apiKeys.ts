/**
 * API keys for machine clients (the Power Automate ingestion flow).
 *
 * Only a scrypt hash of each key is stored — the raw key is shown once, at
 * generation, and never again (matching the "no secrets in the database" rule).
 * A valid key authenticates as the Power Automate service account; role and
 * permissions then flow from that user exactly as for an interactive session.
 *
 * Keys are tagged by `name` (KEY_NAME) rather than a dedicated column, so this
 * needs only INSERT/UPDATE/SELECT on the existing api_keys table — no schema
 * change, which the app's least-privileged DB role could not perform anyway.
 */

import { randomBytes, scrypt } from 'node:crypto';
import { config } from '../config';
import { query, queryOne } from '../db';

/** scrypt cost parameters — the same as password hashing (shared/password.ts). */
const SCRYPT: { N: number; r: number; p: number } = { N: 16384, r: 8, p: 1 };

function deriveScrypt(plain: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** The default service account a Power Automate key authenticates as. */
export const POWER_AUTOMATE_EMAIL = 'power-automate@peapod.com';

/** Marks api_keys rows that belong to the Power Automate integration. */
const KEY_NAME = 'Power Automate';

export interface ApiKeyMeta {
  prefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Deterministically hash a raw key for storage and lookup.
 *
 * scrypt (a memory-hard KDF) with the server-side pepper used as the salt. A
 * fixed salt keeps the output deterministic, so the indexed `WHERE key_hash = $1`
 * lookup in verifyKey still works; because that salt is the secret pepper, a
 * database-only leak cannot be used to verify guessed keys offline.
 *
 * The raw key is already 256 bits of CSPRNG entropy (see generateRawKey), so it
 * was never brute-forceable — but a plain SHA-256/HMAC is not accepted by
 * password-hashing static analysis, whereas a real KDF (scrypt) is.
 */
async function hashKey(raw: string): Promise<string> {
  const salt = Buffer.from(config.auth.apiKeyPepper, 'utf8');
  const derived = await deriveScrypt(raw, salt);
  return derived.toString('hex');
}

/** A new raw key: 'pa_' + 43 url-safe chars. Only ever returned once. */
function generateRawKey(): string {
  return 'pa_' + randomBytes(32).toString('base64url');
}

export async function getServiceUserId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [POWER_AUTOMATE_EMAIL]
  );
  return row?.id ?? null;
}

/** Metadata for the active (non-revoked) Power Automate key, or null. */
export async function getActiveKeyMeta(): Promise<ApiKeyMeta | null> {
  const row = await queryOne<{
    key_prefix: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
  }>(
    `SELECT key_prefix, name, created_at, last_used_at
       FROM api_keys
      WHERE name = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [KEY_NAME]
  );
  if (!row) return null;
  return {
    prefix: row.key_prefix,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

/**
 * Rotate the Power Automate key: revoke any active key and mint a new one.
 * Returns the RAW key exactly once; only its hash is persisted.
 */
export async function rotateKey(
  createdBy: string
): Promise<{ rawKey: string; prefix: string }> {
  const rawKey = generateRawKey();
  const keyHash = await hashKey(rawKey);
  const prefix = rawKey.slice(0, 11); // 'pa_' + 8 chars, safe to display

  await query(
    `UPDATE api_keys SET revoked_at = now() WHERE name = $1 AND revoked_at IS NULL`,
    [KEY_NAME]
  );
  await query(
    `INSERT INTO api_keys (name, key_hash, key_prefix, scopes, created_by)
     VALUES ($1, $2, $3, ARRAY['invoices:write'], $4)`,
    [KEY_NAME, keyHash, prefix, createdBy]
  );
  return { rawKey, prefix };
}

/**
 * Verify a raw API key. Returns the service-account user id it authenticates
 * as, or null when the key is unknown/revoked. Touches last_used_at on success.
 */
export async function verifyKey(rawKey: string): Promise<string | null> {
  const keyHash = await hashKey(rawKey);
  const row = await queryOne<{ id: string; user_id: string | null }>(
    `SELECT k.id,
            (SELECT id FROM users WHERE lower(email) = lower($3)) AS user_id
       FROM api_keys k
      WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND k.name = $2`,
    [keyHash, KEY_NAME, POWER_AUTOMATE_EMAIL]
  );
  if (!row || !row.user_id) return null;
  await query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [row.id]).catch(
    () => undefined
  );
  return row.user_id;
}
