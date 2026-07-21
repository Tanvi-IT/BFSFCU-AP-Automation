/**
 * Postgres connection pool.
 *
 * Production authenticates with Managed Identity (no stored password).
 * Local development falls back to a password from local.settings.json.
 *
 * Routes must not import this directly — use the repository layer.
 */

import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { DefaultAzureCredential } from '@azure/identity';
import { config } from './config';

/** Scope for Entra authentication against Azure Database for PostgreSQL. */
const PG_AAD_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

let pool: Pool | undefined;
let credential: DefaultAzureCredential | undefined;

/** Cached AAD token; refreshed shortly before expiry. */
let cachedToken: { value: string; expiresOn: number } | undefined;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  // Refresh 5 minutes before expiry.
  if (cachedToken && cachedToken.expiresOn - 5 * 60_000 > now) {
    return cachedToken.value;
  }

  credential ??= new DefaultAzureCredential();
  const token = await credential.getToken(PG_AAD_SCOPE);
  if (!token) {
    throw new Error('Failed to acquire a Managed Identity token for PostgreSQL');
  }

  cachedToken = {
    value: token.token,
    expiresOn: token.expiresOnTimestamp,
  };
  return cachedToken.value;
}

export function getPool(): Pool {
  if (pool) return pool;

  pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    // node-postgres accepts an async function, so the token is refreshed
    // automatically for each new connection.
    password: config.db.useManagedIdentity
      ? async () => getAccessToken()
      : config.db.password,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : false,
    max: config.db.maxConnections,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    // A pool-level error must never take the process down.
    console.error('[db] idle client error', err.message);
  });

  return pool;
}

/** Run a query. Prefer repository functions over calling this directly. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

/** Run a query expecting at most one row. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[]
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * Run a set of statements in a transaction.
 * Use for any multi-write operation (e.g. vendor + invoice + audit).
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
