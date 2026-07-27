/**
 * Integration management (admin only).
 *
 *   GET  /api/integrations/power-automate/key   status of the current key
 *   POST /api/integrations/power-automate/key   rotate: burn the old, mint new
 *
 * The Power Automate service account authenticates with an API key sent as the
 * `X-Api-Key` header. Only a hash is stored, so the raw key is returned exactly
 * once — by the POST (rotate) below. GET never returns the raw key, only its
 * prefix and usage metadata.
 */

import { app } from '@azure/functions';
import { createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import * as apiKeys from '../../shared/repository/apiKeys';
import { recordAudit } from '../../shared/repository/activity';

app.http('integration-power-automate-key', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'integrations/power-automate/key',
  handler: createMethodHandler({
    // Current key status — prefix + usage only, never the raw secret.
    GET: {
      roles: Roles.admin,
      handler: async () => {
        const userId = await apiKeys.getServiceUserId();
        if (!userId) {
          // Migration 0013 not applied yet.
          return ok({ accountExists: false, configured: false });
        }
        const meta = await apiKeys.getActiveKeyMeta();
        return ok({
          accountExists: true,
          email: apiKeys.POWER_AUTOMATE_EMAIL,
          configured: !!meta,
          prefix: meta?.prefix ?? null,
          createdAt: meta?.createdAt ?? null,
          lastUsedAt: meta?.lastUsedAt ?? null,
        });
      },
    },

    // Rotate: revoke any existing key and return a brand-new raw key ONCE.
    POST: {
      roles: Roles.admin,
      handler: async ({ user, log }) => {
        const userId = await apiKeys.getServiceUserId();
        if (!userId) {
          throw AppError.notFound(
            'The Power Automate service account does not exist. Apply database migrations first.'
          );
        }

        const { rawKey, prefix } = await apiKeys.rotateKey(user.id);

        await recordAudit({
          entityType: 'system',
          entityId: userId,
          action: 'api_key_rotated',
          userId: user.id,
          metadata: { integration: 'power-automate', prefix },
        });

        log.warn('Power Automate API key rotated', { by: user.id, prefix });

        // The ONLY time the raw key is exposed.
        return ok({ key: rawKey, prefix });
      },
    },
  }),
});

export {};
