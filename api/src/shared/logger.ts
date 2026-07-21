/**
 * Structured logging. Writes through the Functions InvocationContext so
 * entries land in Application Insights with the invocation id attached.
 *
 * Never log tokens, passwords, connection strings, or full document contents.
 */

import type { InvocationContext } from '@azure/functions';
import { config } from './config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, err?: unknown, data?: Record<string, unknown>): void;
  /** Attach the resolved application user to every subsequent entry. */
  setUser(userId: string): void;
  /** Derive a child logger with additional fixed fields. */
  child(fields: Record<string, unknown>): Logger;
}

function threshold(): number {
  const configured = config.logLevel.toLowerCase() as Level;
  return ORDER[configured] ?? ORDER.info;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message, stack: err.stack };
  }
  return { error: String(err) };
}

export function createLogger(
  context: InvocationContext,
  fields: Record<string, unknown> = {}
): Logger {
  let base: Record<string, unknown> = {
    invocationId: context.invocationId,
    function: context.functionName,
    ...fields,
  };

  const min = threshold();

  const write = (level: Level, message: string, data?: Record<string, unknown>) => {
    if (ORDER[level] < min) return;
    const entry = { level, message, ...base, ...(data ?? {}) };
    const line = JSON.stringify(entry);
    if (level === 'error') context.error(line);
    else if (level === 'warn') context.warn(line);
    else context.log(line);
  };

  return {
    debug: (m, d) => write('debug', m, d),
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, err, d) =>
      write('error', m, { ...(err !== undefined ? serializeError(err) : {}), ...(d ?? {}) }),
    setUser: (userId) => {
      base = { ...base, userId };
    },
    child: (extra) => createLogger(context, { ...base, ...extra }),
  };
}
