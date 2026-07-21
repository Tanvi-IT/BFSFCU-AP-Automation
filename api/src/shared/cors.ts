/**
 * CORS, configured in ONE place.
 *
 * The old system copied `Access-Control-Allow-Origin: *` into ~30 functions.
 * Here the allowed origins come from configuration and are echoed only when
 * they match — a wildcard is never sent.
 */

import type { HttpResponseInit } from '@azure/functions';
import { config } from './config';

const ALLOWED_HEADERS = 'authorization, content-type, x-requested-with';
const ALLOWED_METHODS = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';

/**
 * Returns the CORS headers for a request origin.
 * An unknown origin gets no CORS headers, so the browser blocks the response.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = config.http.allowedOrigins;

  if (!origin || allowed.length === 0 || !allowed.includes(origin)) {
    return { Vary: 'Origin' };
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin',
  };
}

/** Response to a CORS preflight request. */
export function preflightResponse(origin: string | null): HttpResponseInit {
  return { status: 204, headers: corsHeaders(origin) };
}
