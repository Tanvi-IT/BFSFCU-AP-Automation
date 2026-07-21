/**
 * User administration.
 *
 *   GET   /api/users            list
 *   POST  /api/users            provision an Entra user into this application
 *   PATCH /api/users/{id}       change role / activate / deactivate
 *
 * Note what is NOT here: no password handling, no invitation email, no signup.
 * Entra owns identity. This only grants an existing Entra user access to this
 * application and assigns their role — which is why the old unauthenticated
 * `setup-admin-user` endpoint no longer needs to exist.
 */

import { app } from '@azure/functions';
import { createHandler, createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { isAppRole, type AppRole } from '../../shared/auth';
import { query, queryOne } from '../../shared/db';
import { recordAudit } from '../../shared/repository/activity';

interface UserRow {
  id: string;
  entra_oid: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
}

app.http('users', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'users',
  handler: createMethodHandler({
    GET: {
      roles: Roles.admin,
      handler: async () => {
        const users = await query<UserRow>(
          `SELECT id, entra_oid, email, full_name, role, is_active, created_at
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

        const entraOid = typeof body['entraOid'] === 'string' ? body['entraOid'].trim() : '';
        const role = typeof body['role'] === 'string' ? body['role'] : '';

        if (!entraOid) {
          throw AppError.validation(
            'entraOid is required — find it in the Entra portal on the user profile'
          );
        }
        if (!isAppRole(role)) {
          throw AppError.validation('A valid role is required');
        }
        // Only a superadmin may mint another superadmin.
        if (role === 'superadmin' && user.role !== 'superadmin') {
          throw AppError.forbidden('Only a superadmin can grant the superadmin role');
        }

        const created = await queryOne<UserRow>(
          `INSERT INTO users (entra_oid, email, full_name, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (entra_oid) DO NOTHING
           RETURNING id, entra_oid, email, full_name, role, is_active, created_at`,
          [
            entraOid,
            typeof body['email'] === 'string' ? body['email'] : null,
            typeof body['fullName'] === 'string' ? body['fullName'] : null,
            role,
          ]
        );

        if (!created) {
          throw AppError.conflict('That Entra user already has access to this application');
        }

        await recordAudit({
          entityType: 'user',
          entityId: created.id,
          action: 'user_provisioned',
          userId: user.id,
          metadata: { role },
        });

        log.info('User provisioned', { userId: created.id, role });
        return ok(created);
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

    if (role !== undefined && !isAppRole(role)) {
      throw AppError.validation('Invalid role');
    }
    if (role === 'superadmin' && user.role !== 'superadmin') {
      throw AppError.forbidden('Only a superadmin can grant the superadmin role');
    }
    // Guard against an admin locking themselves out.
    if (id === user.id && isActive === false) {
      throw AppError.validation('You cannot deactivate your own account');
    }

    const updated = await queryOne<UserRow>(
      `UPDATE users
          SET role      = COALESCE($2, role),
              is_active = COALESCE($3, is_active)
        WHERE id = $1
        RETURNING id, entra_oid, email, full_name, role, is_active, created_at`,
      [id, role ?? null, isActive ?? null]
    );

    if (!updated) throw AppError.notFound('User not found');

    await recordAudit({
      entityType: 'user',
      entityId: id,
      action: 'user_updated',
      userId: user.id,
      metadata: { role, isActive },
    });

    log.info('User updated', { userId: id, role, isActive });
    return ok(updated);
  }),
});

export {};
