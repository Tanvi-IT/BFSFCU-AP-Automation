/**
 * Role checks. The only place authorization decisions are made.
 *
 * Two-role model: `admin` and `user`.
 *   - admin can do everything, including user management and vendor uploads.
 *   - user can do all invoice work: upload, review, edit, approve, decline.
 *
 * Segregation of duties (a submitter approving their own invoice) is handled
 * separately in the workflow layer, not by role — see repository/workflow.ts.
 */

import type { AppRole } from './auth';
import type { AppUser } from './repository/users';
import { AppError } from './errors';

/** admin implicitly satisfies every role requirement. */
export function hasRole(user: AppUser, allowed: readonly AppRole[]): boolean {
  if (user.role === 'admin') return true;
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

/**
 * Convenience guards. The named aliases (approver, reviewer, any) are kept so
 * existing routes keep compiling; in the two-role model they all resolve to
 * "any signed-in user", since a `user` can do all invoice work. Only `admin`
 * is genuinely restricted.
 */
export const Roles = {
  /** Administrative access: user management, vendor uploads, settings. */
  admin: ['admin'] as const,
  /** Approve or decline. Any user may. */
  approver: ['admin', 'user'] as const,
  /** Review and edit invoices. Any user may. */
  reviewer: ['admin', 'user'] as const,
  /** Any authenticated user. */
  any: ['admin', 'user'] as const,
} satisfies Record<string, readonly AppRole[]>;
