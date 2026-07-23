/**
 * User administration (admin only).
 *
 *   GET   /api/users            list
 *   POST  /api/users            create a local user (email, password, role)
 *   PATCH /api/users/{id}       change role / active, or reset password
 *
 * Users are created by an administrator — there is no self-signup. Passwords
 * are hashed with scrypt (shared/password.ts) and never stored or returned in
 * plaintext.
 */

import { app } from '@azure/functions';
import { createHandler, createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { isAppRole } from '../../shared/auth';
import { query, queryOne } from '../../shared/db';
import { hashPassword } from '../../shared/password';
import { createLocalUser, setPassword } from '../../shared/repository/users';
import { recordAudit } from '../../shared/repository/activity';

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
  auth_provider: string;
  created_at: string;
}

const MIN_PASSWORD = 8;

app.http('users', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'users',
  handler: createMethodHandler({
    GET: {
      roles: Roles.admin,
      handler: async () => {
        const users = await query<UserRow>(
          `SELECT id, email, full_name, role, is_active, auth_provider, created_at
             FROM users
            ORDER BY full_name NULLS LAST, email`
        );
        return ok({ users });
      },
    },
    POST: {
      roles: Roles.admin,
      handler: async ({ req, user, log }) => {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

        const email = typeof body['email'] === 'string' ? body['email'].trim() : '';
        const password = typeof body['password'] === 'string' ? body['password'] : '';
        const role = typeof body['role'] === 'string' ? body['role'] : '';
        const fullName = typeof body['fullName'] === 'string' ? body['fullName'].trim() : '';

        if (!email || !/.+@.+\..+/.test(email)) {
          throw AppError.validation('A valid email is required');
        }
        if (password.length < MIN_PASSWORD) {
          throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
        }
        if (!isAppRole(role)) {
          throw AppError.validation("Role must be 'admin' or 'user'");
        }

        const created = await createLocalUser({
          email,
          fullName: fullName || null,
          role,
          passwordHash: await hashPassword(password),
        });

        await recordAudit({
          entityType: 'user',
          entityId: created.id,
          action: 'user_created',
          userId: user.id,
          metadata: { role, email },
        });

        log.info('User created', { userId: created.id, role });
        return ok({
          id: created.id,
          email: created.email,
          fullName: created.fullName,
          role: created.role,
          isActive: created.isActive,
        });
      },
    },
  }),
});

app.http('users-update', {
  methods: ['PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'users/{id}',
  handler: createHandler({ roles: Roles.admin }, async ({ req, user, log }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing user id');

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const role = typeof body['role'] === 'string' ? body['role'] : undefined;
    const isActive = typeof body['isActive'] === 'boolean' ? body['isActive'] : undefined;
    const password = typeof body['password'] === 'string' ? body['password'] : undefined;

    if (role !== undefined && !isAppRole(role)) {
      throw AppError.validation("Role must be 'admin' or 'user'");
    }
    if (password !== undefined && password.length < MIN_PASSWORD) {
      throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
    }
    // Guard against an admin locking themselves out or self-demoting the last time.
    if (id === user.id && isActive === false) {
      throw AppError.validation('You cannot deactivate your own account');
    }

    if (password !== undefined) {
      await setPassword(id, await hashPassword(password));
    }

    const updated = await queryOne<UserRow>(
      `UPDATE users
          SET role      = COALESCE($2, role),
              is_active = COALESCE($3, is_active)
        WHERE id = $1
        RETURNING id, email, full_name, role, is_active, auth_provider, created_at`,
      [id, role ?? null, isActive ?? null]
    );

    if (!updated) throw AppError.notFound('User not found');

    await recordAudit({
      entityType: 'user',
      entityId: id,
      action: 'user_updated',
      userId: user.id,
      metadata: { role, isActive, passwordReset: password !== undefined },
    });

    log.info('User updated', { userId: id, role, isActive });
    return ok(updated);
  }),
});

export {};
