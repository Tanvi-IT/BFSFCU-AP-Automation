/**
 * Session authentication.
 *
 * The application issues its own signed session token (HS256) on password
 * login and verifies it here. This is the ONLY place a token is verified.
 *
 * The token is carried in an httpOnly cookie (`session`); a Bearer header is
 * also accepted as a fallback for API clients. Either way, routes never parse
 * credentials themselves — they receive an already-authenticated principal
 * from the handler wrapper.
 *
 * This replaced Entra ID / MSAL. The seam is intentional: `authenticate()`
 * returns a Principal, and nothing downstream cares how identity was proven, so
 * an SSO provider can be added later as a second path without touching routes.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { HttpRequest } from '@azure/functions';
import { config } from './config';
import { AppError } from './errors';

/** Application roles. Two-role model: admin and user. */
export type AppRole = 'admin' | 'user';

export const ALL_ROLES: readonly AppRole[] = ['admin', 'user'] as const;

export function isAppRole(value: string): value is AppRole {
  return value === 'admin' || value === 'user';
}

/** Name of the session cookie. */
export const SESSION_COOKIE = 'session';

/** The verified caller. `sub` is the application user id (users.id). */
export interface Principal {
  sub: string;
  email?: string;
  name?: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(config.auth.sessionSecret);
}

/**
 * Issue a session token for a user. `sub` is users.id; the token is a bearer of
 * identity only — role and active status are re-read from the database on every
 * request, so a role change or deactivation takes effect immediately.
 */
export async function signSession(input: {
  userId: string;
  email?: string | null;
  name?: string | null;
}): Promise<string> {
  const jwt = new SignJWT({
    ...(input.email ? { email: input.email } : {}),
    ...(input.name ? { name: input.name } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(config.auth.sessionTtl);

  return jwt.sign(secretKey());
}

function readToken(req: HttpRequest): string | undefined {
  // Prefer the cookie; fall back to a Bearer header for API clients.
  const cookie = req.headers.get('cookie');
  if (cookie) {
    for (const part of cookie.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === SESSION_COOKIE && rest.length) {
        return decodeURIComponent(rest.join('='));
      }
    }
  }

  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header) {
    const [scheme, token] = header.split(' ');
    if (scheme && scheme.toLowerCase() === 'bearer' && token) {
      return token.trim();
    }
  }

  return undefined;
}

/**
 * Verify the request's session token.
 * Throws AppError.unauthorized on any failure — never returns a partial result.
 */
export async function authenticate(req: HttpRequest): Promise<Principal> {
  const token = readToken(req);
  if (!token) {
    throw AppError.unauthorized('Not signed in');
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, secretKey(), { clockTolerance: 30 });
    payload = result.payload;
  } catch {
    throw AppError.unauthorized('Invalid or expired session');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  if (!sub) {
    throw AppError.unauthorized('Session is missing its subject');
  }

  return {
    sub,
    ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
    ...(typeof payload['name'] === 'string' ? { name: payload['name'] } : {}),
  };
}
