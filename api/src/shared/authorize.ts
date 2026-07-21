/**
 * Role checks. The only place authorization decisions are made.
 *
 * Single-tenant system: there is no tenant scoping. Authorization is
 * role-based only.
 */

import type { AppRole } from './auth';
import type { AppUser } from './repository/users';
import { AppError } from './errors';

/** superadmin implicitly satisfies every role requirement. */
export function hasRole(user: AppUser, allowed: readonly AppRole[]): boolean {
  if (user.role === 'pp-superadmin') return true;
  return allowed.includes(user.role);
}

/** Throws AppError.forbidden if the user lacks all of the allowed roles. */
export function requireRole(user: AppUser, allowed: readonly AppRole[]): void {
  if (!hasRole(user, allowed)) {
    throw AppError.forbidden(
      `This action requires one of: ${allowed.join(', ')}`
    );
  }
}

/** Convenience guards for common cases. */
export const Roles = {
  /** Full administrative access. */
  admin: ['pp-admin'] as const,
  /** Can approve or decline invoices. */
  approver: ['pp-admin', 'pp-approver'] as const,
  /** Can review and edit invoices in the queues. */
  reviewer: ['pp-admin', 'pp-approver', 'pp-ap_analyst'] as const,
  /** Any authenticated user, including read-only. */
  any: ['pp-admin', 'pp-approver', 'pp-ap_analyst', 'pp-read_only'] as const,
} satisfies Record<string, readonly AppRole[]>;
