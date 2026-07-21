/**
 * Entra ID token validation.
 *
 * This is the ONLY place a token is verified. Routes never parse the
 * Authorization header themselves — they receive an already-authenticated
 * principal from the handler wrapper.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { HttpRequest } from '@azure/functions';
import { config } from './config';
import { AppError } from './errors';

/**
 * Application roles. Mirrors the app_role enum values.
 *
 * Prefixed with "pp-" because these names double as Entra group names, and
 * bare names like "admin" are too generic to claim in a shared directory.
 * The prefix is storage and wire format only — the UI renders friendly labels.
 */
export type AppRole =
  | 'pp-superadmin'
  | 'pp-admin'
  | 'pp-ap_analyst'
  | 'pp-approver'
  | 'pp-read_only';

export const ALL_ROLES: readonly AppRole[] = [
  'pp-superadmin',
  'pp-admin',
  'pp-ap_analyst',
  'pp-approver',
  'pp-read_only',
] as const;

export function isAppRole(value: string): value is AppRole {
  return (ALL_ROLES as readonly string[]).includes(value);
}

/** The verified caller, as proven by Entra. */
export interface Principal {
  /** Entra object id — the stable user identifier. Replaces auth.users.id. */
  oid: string;
  /** Roles from the token's `roles` claim (Entra App Roles). */
  tokenRoles: AppRole[];
  email?: string;
  name?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/** Cached across invocations — the key set is fetched once, not per request. */
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.auth.jwksUri));
  }
  return jwks;
}

function readBearerToken(req: HttpRequest): string {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) {
    throw AppError.unauthorized('Missing Authorization header');
  }
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    throw AppError.unauthorized('Authorization header must be a Bearer token');
  }
  return token.trim();
}

function extractRoles(payload: JWTPayload): AppRole[] {
  const raw = payload['roles'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is AppRole => typeof r === 'string' && isAppRole(r));
}

/**
 * Verify the request's bearer token against Entra.
 * Throws AppError.unauthorized on any failure — never returns a partial result.
 */
export async function authenticate(req: HttpRequest): Promise<Principal> {
  const token = readBearerToken(req);

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, getJwks(), {
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      clockTolerance: 60,
    });
    payload = result.payload;
  } catch {
    // Deliberately opaque: never reveal why validation failed.
    //
    // When debugging local setup, the cause is nearly always an `iss` or `aud`
    // mismatch. Decode the token's payload segment by hand (WITHOUT verifying)
    // and compare against config.auth.issuer / config.auth.audience — a v1.0
    // token, or an `aud` carrying the api:// URI, means the app registration
    // is not on requestedAccessTokenVersion 2.
    throw AppError.unauthorized('Invalid or expired token');
  }

  const oid = typeof payload['oid'] === 'string' ? payload['oid'] : undefined;
  if (!oid) {
    throw AppError.unauthorized('Token is missing the oid claim');
  }

  const email =
    (typeof payload['preferred_username'] === 'string' ? payload['preferred_username'] : undefined) ??
    (typeof payload['email'] === 'string' ? payload['email'] : undefined);

  return {
    oid,
    tokenRoles: extractRoles(payload),
    ...(email ? { email } : {}),
    ...(typeof payload['name'] === 'string' ? { name: payload['name'] } : {}),
  };
}
