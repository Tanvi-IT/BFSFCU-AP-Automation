/**
 * Application users.
 *
 * Identity lives in Entra; this table holds the application-side profile and
 * role, keyed on the Entra object id (`oid`). It replaces the Supabase
 * `auth.users` table and the foreign keys that pointed at it.
 */

import { queryOne } from '../db';
import { AppError } from '../errors';
import type { AppRole, Principal } from '../auth';

export interface AppUser {
  id: string;
  entraOid: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
  isActive: boolean;
}

interface UserRow {
  id: string;
  entra_oid: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
}

function toUser(row: UserRow): AppUser {
  return {
    id: row.id,
    entraOid: row.entra_oid,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
  };
}

export async function findByEntraOid(oid: string): Promise<AppUser | undefined> {
  const row = await queryOne<UserRow>(
    `SELECT id, entra_oid, email, full_name, role, is_active
       FROM users
      WHERE entra_oid = $1`,
    [oid]
  );
  return row ? toUser(row) : undefined;
}

/**
 * Resolve the application user for a verified Entra principal.
 *
 * Provisioning is deliberate, not automatic: a valid Entra token proves who
 * someone is, not that they are permitted to use this application. Users are
 * created by an administrator (or by group sync), so an unknown but validly
 * authenticated caller is rejected rather than silently granted access.
 */
export async function resolveUser(principal: Principal): Promise<AppUser> {
  const user = await findByEntraOid(principal.oid);

  if (!user) {
    throw AppError.forbidden(
      'Your account is not provisioned for this application. Contact an administrator.'
    );
  }

  if (!user.isActive) {
    throw AppError.forbidden('Your account has been deactivated.');
  }

  return user;
}

/** Keep the local profile in step with Entra on sign-in. */
export async function syncProfile(
  userId: string,
  email: string | undefined,
  fullName: string | undefined
): Promise<void> {
  if (!email && !fullName) return;
  await queryOne(
    `UPDATE users
        SET email      = COALESCE($2, email),
            full_name  = COALESCE($3, full_name),
            updated_at = now()
      WHERE id = $1`,
    [userId, email ?? null, fullName ?? null]
  );
}
