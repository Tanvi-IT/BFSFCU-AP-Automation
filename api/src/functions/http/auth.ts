/**
 * Local authentication — login and logout.
 *
 *   POST /api/auth/login   { email, password }  -> sets session cookie
 *   POST /api/auth/logout                       -> clears session cookie
 *
 * These are the only anonymous routes that issue identity. The session token is
 * returned as an httpOnly cookie so it is not reachable from JavaScript.
 */

import { app, type HttpResponseInit } from '@azure/functions';
import { createAnonymousHandler, ok } from '../../shared/handler';
import { AppError } from '../../shared/errors';
import { signSession, SESSION_COOKIE } from '../../shared/auth';
import { config } from '../../shared/config';
import { findByEmailForLogin, findByEntra, linkExternalId } from '../../shared/repository/users';
import { verifyPassword } from '../../shared/password';
import { getSsoConfig } from '../../shared/repository/settings';
import { validateEntraIdToken } from '../../shared/entra';

const TWELVE_HOURS = 12 * 60 * 60;

function sessionCookie(value: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value,
    path: '/',
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'Lax' as const,
    maxAge,
  };
}

app.http('auth-login', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: createAnonymousHandler(async ({ req, log }): Promise<HttpResponseInit> => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body['email'] === 'string' ? body['email'].trim() : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';

    if (!email || !password) {
      throw AppError.validation('Email and password are required');
    }

    const user = await findByEmailForLogin(email);

    // One generic message for "no such user", "wrong password", and "not a
    // local account" — never reveal which.
    const invalid = AppError.unauthorized('Invalid email or password');

    if (!user || user.authProvider !== 'local' || !user.passwordHash) {
      throw invalid;
    }
    const good = await verifyPassword(password, user.passwordHash);
    if (!good) {
      throw invalid;
    }
    if (!user.isActive) {
      throw AppError.forbidden('Your account has been deactivated.');
    }

    const token = await signSession({
      userId: user.id,
      email: user.email,
      name: user.fullName,
    });

    log.info('User signed in', { userId: user.id, role: user.role });

    return {
      ...ok({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      }),
      cookies: [sessionCookie(token, TWELVE_HOURS)],
    };
  }),
});

app.http('auth-logout', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: createAnonymousHandler(async (): Promise<HttpResponseInit> => {
    return {
      ...ok({ ok: true }),
      // Expire the cookie immediately.
      cookies: [sessionCookie('', 0)],
    };
  }),
});

/**
 * GET /api/auth/sso/config — anonymous.
 *
 * Tells the login page whether to offer Microsoft sign-in, and (if so) the
 * public tenant/client ids the SPA needs to initialise MSAL. Nothing secret is
 * returned; when SSO is off or not fully configured, only `{ enabled: false }`.
 */
app.http('auth-sso-config', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/sso/config',
  handler: createAnonymousHandler(async (): Promise<HttpResponseInit> => {
    const cfg = await getSsoConfig();
    const ready = cfg.enabled && !!cfg.tenantId && !!cfg.clientId;
    return ok(
      ready
        ? { enabled: true, tenantId: cfg.tenantId, clientId: cfg.clientId }
        : { enabled: false }
    );
  }),
});

/**
 * POST /api/auth/sso/entra — anonymous.  { idToken }
 *
 * Verifies the Entra ID token, maps it to an existing application user, and
 * issues the same session cookie a password login would. Match-existing-only:
 * an Entra user with no application account is rejected (no self-provisioning).
 */
app.http('auth-sso-entra', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/sso/entra',
  handler: createAnonymousHandler(async ({ req, log }): Promise<HttpResponseInit> => {
    const cfg = await getSsoConfig();
    if (!cfg.enabled || !cfg.tenantId || !cfg.clientId) {
      throw AppError.forbidden('Microsoft sign-in is not enabled.');
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const idToken = typeof body['idToken'] === 'string' ? body['idToken'] : '';
    if (!idToken) {
      throw AppError.validation('idToken is required');
    }

    const identity = await validateEntraIdToken(idToken, {
      tenantId: cfg.tenantId,
      clientId: cfg.clientId,
    });

    const user = await findByEntra(identity.oid, identity.email);
    if (!user) {
      throw AppError.forbidden(
        'No account is provisioned for this Microsoft user. Contact an administrator.'
      );
    }
    if (!user.isActive) {
      throw AppError.forbidden('Your account has been deactivated.');
    }

    // Record the Entra object id on the first SSO login so later logins match
    // by external_id directly (and email changes don't break the link).
    if (!user.externalId) {
      await linkExternalId(user.id, identity.oid);
    }

    const token = await signSession({
      userId: user.id,
      email: user.email,
      name: user.fullName,
    });

    log.info('User signed in via Entra', { userId: user.id, role: user.role });

    return {
      ...ok({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      }),
      cookies: [sessionCookie(token, TWELVE_HOURS)],
    };
  }),
});
