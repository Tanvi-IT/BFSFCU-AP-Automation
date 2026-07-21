/**
 * The single entry point for every HTTP route.
 *
 * This is the fix for the 32-duplicated-functions problem. Authentication,
 * role checks, CORS, error shaping and logging happen HERE, once. A route
 * that needs auth cannot forget it, because it never sees the raw request
 * until this wrapper has already run.
 *
 * Usage:
 *
 *   app.http('invoices-list', {
 *     methods: ['GET'],
 *     authLevel: 'anonymous',        // we validate Entra tokens ourselves
 *     route: 'invoices',
 *     handler: createHandler({ roles: ['admin', 'ap_analyst'] }, async (ctx) => {
 *       return ok(await listInvoices());
 *     }),
 *   });
 */

import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { authenticate, type AppRole, type Principal } from './auth';
import { requireRole } from './authorize';
import { resolveUser, type AppUser } from './repository/users';
import { AppError, toErrorBody } from './errors';
import { createLogger, type Logger } from './logger';
import { corsHeaders, preflightResponse } from './cors';

export interface HandlerContext {
  req: HttpRequest;
  /** Verified Entra principal. Absent only on anonymous routes. */
  principal: Principal;
  /** The application user record (role, profile) for the caller. */
  user: AppUser;
  log: Logger;
}

export interface HandlerOptions {
  /** Roles permitted to call this route. Omit to allow any authenticated user. */
  roles?: readonly AppRole[];
  /**
   * Opt out of authentication. Use ONLY for webhooks that authenticate by
   * signature or API key, and verify inside the handler.
   */
  anonymous?: boolean;
}

export interface AnonymousHandlerContext {
  req: HttpRequest;
  log: Logger;
}

/** JSON success response. */
export function ok(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: { 'Content-Type': 'application/json' },
  };
}

/** 202 for work that has been queued rather than completed. */
export function accepted(body: unknown): HttpResponseInit {
  return ok(body, 202);
}

/** 204 with no body. */
export function noContent(): HttpResponseInit {
  return { status: 204 };
}

function withCors(res: HttpResponseInit, origin: string | null): HttpResponseInit {
  return {
    ...res,
    headers: { ...(res.headers ?? {}), ...corsHeaders(origin) },
  };
}

/** What a request resolves to: the roles it requires and the code that serves it. */
interface Resolved {
  roles?: readonly AppRole[] | undefined;
  fn: (ctx: HandlerContext) => Promise<HttpResponseInit>;
}

/**
 * The authenticate → resolve user → check role → run pipeline, shared by every
 * authenticated entry point so the two public wrappers cannot drift apart.
 *
 * `select` runs before authentication, so an unsupported method is rejected
 * without a token round-trip.
 */
function createDispatcher(
  select: (req: HttpRequest) => Resolved
): (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit> {
  return async (req, context) => {
    const origin = req.headers.get('origin');
    const log = createLogger(context);

    if (req.method === 'OPTIONS') {
      return preflightResponse(origin);
    }

    try {
      const { roles, fn } = select(req);

      // 1. Prove who is calling.
      const principal = await authenticate(req);

      // 2. Load the application user (role, status) for that identity.
      const user = await resolveUser(principal);

      // 3. Enforce role. Throws AppError.forbidden on failure.
      if (roles && roles.length > 0) {
        requireRole(user, roles);
      }

      log.setUser(user.id);
      const res = await fn({ req, principal, user, log });
      return withCors(res, origin);
    } catch (err) {
      const { status, body } = toErrorBody(err);
      if (status >= 500) {
        log.error('Unhandled error in route', err);
      } else {
        log.warn(`Request rejected (${status})`, {
          code: body.error.code,
          message: body.error.message,
        });
      }
      return withCors({ status, jsonBody: body }, origin);
    }
  };
}

/**
 * Wrap an authenticated route handler.
 * Every non-webhook route MUST be created through this function.
 */
export function createHandler(
  options: HandlerOptions,
  fn: (ctx: HandlerContext) => Promise<HttpResponseInit>
): (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit> {
  return createDispatcher(() => {
    if (options.anonymous) {
      throw new AppError(
        'internal_error',
        'Use createAnonymousHandler for unauthenticated routes'
      );
    }
    return { roles: options.roles, fn };
  });
}

/** One method's share of a route: who may call it, and what it does. */
export interface MethodRoute {
  /** Roles permitted to call this method. Omit to allow any authenticated user. */
  roles?: readonly AppRole[];
  handler: (ctx: HandlerContext) => Promise<HttpResponseInit>;
}

/**
 * Wrap several HTTP methods that share one route.
 *
 * Azure Functions permits exactly one registration per route, so GET and POST
 * on `/invoices` have to be a single function. Roles are declared per method
 * rather than per route on purpose: collapsing them onto one role set would
 * silently widen access on whichever method is the stricter of the two — a
 * read-only user gaining write access, not merely a tidiness problem.
 *
 *   app.http('invoices', {
 *     methods: ['GET', 'POST', 'OPTIONS'],
 *     route: 'invoices',
 *     handler: createMethodHandler({
 *       GET:  { roles: Roles.any,      handler: listInvoices },
 *       POST: { roles: Roles.reviewer, handler: uploadInvoice },
 *     }),
 *   });
 */
export function createMethodHandler(
  routes: Readonly<Record<string, MethodRoute>>
): (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit> {
  return createDispatcher((req) => {
    const route = routes[req.method.toUpperCase()];
    if (!route) {
      throw AppError.methodNotAllowed(req.method);
    }
    return { roles: route.roles, fn: route.handler };
  });
}

/**
 * Wrap a route that authenticates by some means other than an Entra token —
 * Stripe signatures, hashed API keys, etc. The handler MUST verify the caller
 * itself. This exists so such routes still get CORS, logging and error shaping.
 */
export function createAnonymousHandler(
  fn: (ctx: AnonymousHandlerContext) => Promise<HttpResponseInit>
): (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit> {
  return async (req, context) => {
    const origin = req.headers.get('origin');
    const log = createLogger(context);

    if (req.method === 'OPTIONS') {
      return preflightResponse(origin);
    }

    try {
      const res = await fn({ req, log });
      return withCors(res, origin);
    } catch (err) {
      const { status, body } = toErrorBody(err);
      if (status >= 500) {
        log.error('Unhandled error in anonymous route', err);
      }
      return withCors({ status, jsonBody: body }, origin);
    }
  };
}
