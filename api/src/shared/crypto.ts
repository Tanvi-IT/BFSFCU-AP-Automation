/**
 * At-rest encryption for the few secrets that must live in the database (the
 * Prologue SQL Server password). AES-256-GCM with a key derived from
 * `SETTINGS_ENC_KEY` (falling back to `SESSION_SECRET`, so it works without extra
 * configuration for the demo). Do not rotate the key without re-saving the
 * encrypted settings, or they can no longer be decrypted.
 *
 * Format: `enc:v1:` + base64(iv[12] ‖ authTag[16] ‖ ciphertext).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { config } from './config';

const PREFIX = 'enc:v1:';

/** 32-byte key derived from the configured secret. */
function key(): Buffer {
  return createHash('sha256').update(config.auth.settingsEncKey).digest();
}

/** Encrypt a secret for storage. Empty in → empty out. */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypt a value produced by `encryptSecret`. A value WITHOUT the prefix is
 * returned unchanged — this tolerates a plaintext seed (e.g. a value set
 * directly in the DB) so the connection still works. Empty in → empty out.
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key or corrupted value — treat as "no usable secret" rather than
    // throwing, so a misconfigured key surfaces as a connection failure the
    // admin can act on, not a 500 on every settings read.
    return '';
  }
}
