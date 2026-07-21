/**
 * GET /api/me — the signed-in user's application profile and role.
 *
 * The frontend calls this immediately after MSAL sign-in to discover who the
 * user is on the application side. A 403 here means "authenticated with Entra
 * but not provisioned in this application", which the UI surfaces as a clear
 * message rather than an empty screen.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';
import { syncProfile } from '../../shared/repository/users';

app.http('me', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous', // Entra tokens are validated in createHandler
  route: 'me',
  handler: createHandler({}, async ({ user, principal, log }) => {
    // Keep the local profile in step with Entra on each sign-in.
    await syncProfile(user.id, principal.email, principal.name);

    log.info('Resolved current user', { role: user.role });

    return ok({
      id: user.id,
      entraOid: user.entraOid,
      email: principal.email ?? user.email,
      fullName: principal.name ?? user.fullName,
      role: user.role,
      isActive: user.isActive,
    });
  }),
});
