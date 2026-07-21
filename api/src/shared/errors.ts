/**
 * One error type and one response envelope for the whole API.
 *
 * Handlers throw; the shared handler wrapper catches and shapes the response.
 * Never hand-build an error response inside a route.
 */

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'validation_failed'
  | 'conflict'
  | 'upstream_failed'
  | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  validation_failed: 400,
  conflict: 409,
  upstream_failed: 502,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to return to the caller. Never include internal detail here. */
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError('unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError('forbidden', message);
  }
  static notFound(message = 'Not found') {
    return new AppError('not_found', message);
  }
  static methodNotAllowed(method: string) {
    return new AppError('method_not_allowed', `${method} is not supported on this route`);
  }
  static validation(message: string, details?: unknown) {
    return new AppError('validation_failed', message, details);
  }
  static conflict(message: string) {
    return new AppError('conflict', message);
  }
  static upstream(message: string) {
    return new AppError('upstream_failed', message);
  }
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * Convert any thrown value into a safe response body.
 * Unknown errors are never leaked to the caller.
 */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred',
      },
    },
  };
}
