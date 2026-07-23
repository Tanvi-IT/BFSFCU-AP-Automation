/**
 * GET /api/me — the signed-in user's application profile and role.
 *
 * The frontend calls this after login to discover who the user is. A 401 means
 * "no valid session"; the app shows the login page.
 */

import { app } from '@azure/functions';
import { createHandler, ok } from '../../shared/handler';

app.http('me', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous', // session tokens are validated in createHandler
  route: 'me',
  handler: createHandler({}, async ({ user, log }) => {
    log.info('Resolved current user', { role: user.role });

    return ok({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
    });
  }),
});
