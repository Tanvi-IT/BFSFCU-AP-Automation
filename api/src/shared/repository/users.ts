/**
 * Application users.
 *
 * Holds the application-side profile, role, and — for local authentication —
 * the password hash. `auth_provider` and `external_id` are the seam for adding
 * an SSO provider later without another schema change.
 */

import { queryOne } from '../db';
import { AppError } from '../errors';
import type { AppRole, Principal } from '../auth';

export interface AppUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
  isActive: boolean;
  authProvider: string;
}

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  auth_provider: string;
}

function toUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    authProvider: row.auth_provider,
  };
}

export async function findById(id: string): Promise<AppUser | undefined> {
  const row = await queryOne<UserRow>(
    `SELECT id, email, full_name, role, is_active, auth_provider
       FROM users WHERE id = $1`,
    [id]
  );
  return row ? toUser(row) : undefined;
}

/** Full row including the password hash — for the login path only. */
export async function findByEmailForLogin(email: string): Promise<
  (AppUser & { passwordHash: string | null }) | undefined
> {
  const row = await queryOne<UserRow & { password_hash: string | null }>(
    `SELECT id, email, full_name, role, is_active, auth_provider, password_hash
       FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  if (!row) return undefined;
  return { ...toUser(row), passwordHash: row.password_hash };
}

/**
 * Resolve the application user for a verified session.
 *
 * The session's `sub` is users.id. Role and active status are read fresh here
 * on every request, so a role change or deactivation takes effect at once.
 */
export async function resolveUser(principal: Principal): Promise<AppUser> {
  const user = await findById(principal.sub);

  if (!user) {
    throw AppError.forbidden('Your account no longer exists.');
  }
  if (!user.isActive) {
    throw AppError.forbidden('Your account has been deactivated.');
  }

  return user;
}

export interface CreateUserInput {
  email: string;
  fullName: string | null;
  role: AppRole;
  passwordHash: string;
}

export async function createLocalUser(input: CreateUserInput): Promise<AppUser> {
  const row = await queryOne<UserRow>(
    `INSERT INTO users (email, full_name, role, auth_provider, password_hash, is_active)
     VALUES ($1, $2, $3, 'local', $4, true)
     ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
     RETURNING id, email, full_name, role, is_active, auth_provider`,
    [input.email, input.fullName, input.role, input.passwordHash]
  );
  if (!row) {
    throw AppError.conflict('A user with that email already exists');
  }
  return toUser(row);
}

export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await queryOne(
    `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [userId, passwordHash]
  );
}

/**
 * Find the application user for an Entra sign-in.
 *
 * Match by `external_id` (the Entra object id) first — the stable link once
 * established — then fall back to email so an admin-created local user can sign
 * in via SSO the first time. Returns undefined if neither matches; SSO does not
 * create accounts (match-existing-only), so the caller rejects unknown users.
 */
export async function findByEntra(
  externalId: string,
  email: string | null
): Promise<(AppUser & { externalId: string | null }) | undefined> {
  let row = await queryOne<UserRow & { external_id: string | null }>(
    `SELECT id, email, full_name, role, is_active, auth_provider, external_id
       FROM users WHERE external_id = $1`,
    [externalId]
  );
  if (!row && email) {
    row = await queryOne<UserRow & { external_id: string | null }>(
      `SELECT id, email, full_name, role, is_active, auth_provider, external_id
         FROM users WHERE lower(email) = lower($1)`,
      [email]
    );
  }
  return row ? { ...toUser(row), externalId: row.external_id } : undefined;
}

/** Store the Entra object id on first SSO login. Only fills a blank value. */
export async function linkExternalId(userId: string, externalId: string): Promise<void> {
  await queryOne(
    `UPDATE users SET external_id = $2, updated_at = now()
      WHERE id = $1 AND external_id IS NULL`,
    [userId, externalId]
  );
}
