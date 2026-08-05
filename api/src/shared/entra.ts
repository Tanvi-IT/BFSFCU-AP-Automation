/**
 * Microsoft Entra (Azure AD) ID-token validation.
 *
 * The SPA signs the user in with MSAL (public client, PKCE) and posts the
 * resulting ID token here. This module verifies that token against Entra's
 * published signing keys and returns the caller's stable identity. It never
 * handles a client secret — the app is a public client, so there is nothing
 * secret to store or protect.
 *
 * The verified identity is then mapped to an application user in the SSO login
 * route, which issues the normal session cookie — Entra is only an identity
 * source; everything downstream is unchanged.
 */

import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import { AppError } from './errors';

export interface EntraIdentity {
  /** Stable per-tenant object id (`oid`) — the value linked to users.external_id. */
  oid: string;
  email: string | null;
  name: string | null;
}

/** One remote JWKS per tenant; jose caches and refreshes the keys internally. */
const jwksByTenant = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(tenantId: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByTenant.get(tenantId);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
    jwksByTenant.set(tenantId, jwks);
  }
  return jwks;
}

/**
 * Verify an Entra ID token for the configured tenant + client.
 *
 * Checks the signature (against Entra's JWKS), the issuer (the configured
 * tenant), and the audience (our client id). Throws AppError.unauthorized on any
 * failure — an unverifiable token must never be treated as a sign-in.
 */
export async function validateEntraIdToken(
  idToken: string,
  opts: { tenantId: string; clientId: string }
): Promise<EntraIdentity> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(idToken, jwksFor(opts.tenantId), {
      issuer: `https://login.microsoftonline.com/${opts.tenantId}/v2.0`,
      audience: opts.clientId,
      clockTolerance: 60,
    });
    payload = result.payload;
  } catch {
    throw AppError.unauthorized('Microsoft sign-in could not be verified.');
  }

  // Prefer `oid` (stable, per-tenant). `sub` is pairwise per-app and also stable,
  // used only as a fallback if a token somehow lacks `oid`.
  const oid =
    typeof payload['oid'] === 'string'
      ? payload['oid']
      : typeof payload.sub === 'string'
        ? payload.sub
        : undefined;
  if (!oid) {
    throw AppError.unauthorized('Microsoft token is missing the user identifier.');
  }

  const email =
    typeof payload['preferred_username'] === 'string'
      ? (payload['preferred_username'] as string)
      : typeof payload['email'] === 'string'
        ? (payload['email'] as string)
        : null;
  const name = typeof payload['name'] === 'string' ? (payload['name'] as string) : null;

  return { oid, email, name };
}
