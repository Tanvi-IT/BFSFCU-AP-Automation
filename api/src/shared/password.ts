/**
 * Password hashing for local authentication.
 *
 * Uses Node's built-in scrypt — a memory-hard password hash — so there is no
 * native dependency to build for the Functions runtime. The stored value is
 * self-describing:
 *
 *   scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 *
 * The parameters travel with the hash, so they can be raised later without
 * invalidating existing passwords. Verification is constant-time.
 *
 * Passwords exist only for the `local` auth provider. When SSO is added, those
 * users have no password and authenticate through their provider instead.
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelization
const KEYLEN = 64;

function derive(plain: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4]!, 'hex');
  const expected = Buffer.from(parts[5]!, 'hex');

  let derived: Buffer;
  try {
    derived = await derive(plain, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }

  // Length check guards timingSafeEqual, which throws on mismatched lengths.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
