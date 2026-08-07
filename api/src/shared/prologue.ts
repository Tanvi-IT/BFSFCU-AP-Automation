/**
 * Fiserv Prologue Financials (SQL Server) integration.
 *
 * On invoice approval the app STAGES an unposted AP transaction in Prologue by
 * calling two stored procedures (deployed and owned by BankFund's DBAs, granted
 * to this app's login as EXECUTE only — no direct table access):
 *
 *   dbo.tanvi_get_batchid_4today  -> find/create today's pre-approved batch
 *   dbo.tanvi_insert_ap_invoice   -> insert the AP header + GL distribution lines
 *
 * Prologue posts the batch through its own posting engine; this app never writes
 * posted status or GL entries directly. The stored proc's duplicate guard
 * (vendor_id + vendor_document_number) is the idempotency net that makes a retry
 * safe if the local approval commit fails after a successful Prologue insert.
 *
 * The module is INERT unless `config.prologue.enabled` (PROLOGUE_ENABLED) is
 * true. The connection pool is created lazily on first use, so a deployment
 * without SQL Server connectivity is unaffected until the flag is flipped.
 *
 * v1 scope: single-line GL. The full invoice amount is coded to one GL account
 * (`invoice.gl_code`). Multi-line GL distribution is a later enhancement — the
 * proc already accepts an array, so only the caller's mapping changes.
 */

import sql from 'mssql';
import { AppError } from './errors';
import { getPrologueConfig, type PrologueConfig } from './repository/settings';

let pool: sql.ConnectionPool | undefined;
let connecting: Promise<sql.ConnectionPool> | undefined;
/** Signature of the config the cached pool was built with; a change rebuilds it. */
let poolSig: string | undefined;

/** Whether the integration is switched on. Reads the DB-backed config. */
export async function isEnabled(): Promise<boolean> {
  return (await getPrologueConfig()).enabled;
}

function connectionSignature(c: PrologueConfig): string {
  return [c.host, c.port, c.database, c.user, c.password, c.encrypt, c.trustServerCertificate].join(
    '|'
  );
}

function poolConfig(c: PrologueConfig): sql.config {
  const cfg: sql.config = {
    server: c.host as string,
    port: c.port,
    user: c.user as string,
    password: c.password,
    options: {
      encrypt: c.encrypt,
      trustServerCertificate: c.trustServerCertificate,
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 10_000,
    requestTimeout: 20_000,
  };
  // Omit `database` when unset so a connection test can verify the server + login
  // against the login's default database. The real write path always sets it.
  if (c.database) cfg.database = c.database;
  return cfg;
}

/**
 * The shared connection pool for the current stored config. Rebuilt whenever the
 * admin changes the connection (the config signature changes), so a settings
 * update takes effect without a restart.
 */
async function poolFor(c: PrologueConfig): Promise<sql.ConnectionPool> {
  if (!c.host || !c.database || !c.user) {
    throw AppError.upstream(
      'Prologue is enabled but the host, database, and user are not all configured.'
    );
  }
  const sig = connectionSignature(c);
  if (pool?.connected && poolSig === sig) return pool;
  if (connecting && poolSig === sig) return connecting;

  // Config changed (or first use): drop any stale pool before building a new one.
  if (pool && poolSig !== sig) {
    const old = pool;
    pool = undefined;
    old.close().catch(() => undefined);
  }
  poolSig = sig;
  connecting = new sql.ConnectionPool(poolConfig(c)).connect();

  try {
    pool = await connecting;
    // A pool-level error must never take the process down.
    pool.on('error', (err) => console.error('[prologue] pool error', err.message));
    return pool;
  } catch (err) {
    poolSig = undefined;
    throw AppError.upstream(
      `Prologue: cannot connect to SQL Server (${(err as Error).message}).`
    );
  } finally {
    connecting = undefined;
  }
}

async function getPool(): Promise<sql.ConnectionPool> {
  return poolFor(await getPrologueConfig());
}

/**
 * Test a connection using the stored config, optionally overridden with values
 * from an unsaved admin form. Returns a result instead of throwing so the UI can
 * show success/failure, and uses a throwaway pool so it never disturbs the shared
 * one.
 */
export async function testConnection(
  override?: Partial<PrologueConfig>
): Promise<{ ok: boolean; message: string }> {
  const stored = await getPrologueConfig();
  const c: PrologueConfig = { ...stored, ...override };
  // Database is optional for a test — without it we connect to the login's
  // default database and run SELECT 1, which still proves reachability + auth.
  if (!c.host || !c.user) {
    return { ok: false, message: 'Host and user are required to test.' };
  }
  if (!c.password) {
    return {
      ok: false,
      message: 'No password is set. Enter the SQL Server password and test again.',
    };
  }
  let testPool: sql.ConnectionPool | undefined;
  try {
    testPool = await new sql.ConnectionPool({
      ...poolConfig(c),
      pool: { max: 1, min: 0, idleTimeoutMillis: 5_000 },
      connectionTimeout: 8_000,
      requestTimeout: 8_000,
    }).connect();
    await testPool.request().query('SELECT 1 AS ok');
    return { ok: true, message: 'Connected to SQL Server successfully.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  } finally {
    if (testPool) testPool.close().catch(() => undefined);
  }
}

export interface PrologueInvoice {
  /** Prologue ap_vendor.vendor_id — sourced from vendors.external_id. */
  vendorId: string;
  /** Vendor's invoice number -> vendor_document_number. */
  vendorDocumentNumber: string;
  /** Invoice date, YYYY-MM-DD -> vendor_document_date. */
  vendorDocumentDate: string;
  /** Due date, YYYY-MM-DD. */
  dueDate: string;
  /** Header description (truncated to 40 chars by the proc's column width). */
  description: string;
  /** Header total; also the single GL line amount in v1. */
  totalAmount: number;
  /** Single-line GL account id (invoice.gl_code). */
  glAccountId: string;
  /** e.g. 'A/P Check', 'Wire', 'ACH Direct Debit'; NULL lets AP staff assign. */
  transactionTypeId?: string | null;
  /** Approver display name, recorded on the batch (co_batch.approval_user_id). */
  approverName: string;
}

export interface PrologueResult {
  transactionId: number;
  batchId: number;
}

/**
 * Stage one approved invoice in Prologue.
 *
 * Throws `AppError` on any connectivity, validation, or business rejection so
 * the caller can abort the local approval — the invoice stays in its queue and
 * the reviewer sees why. Never returns a partial result.
 */
export async function pushInvoice(inv: PrologueInvoice): Promise<PrologueResult> {
  const cfg = await getPrologueConfig();
  const p = await poolFor(cfg);

  // 1. Find or create today's pre-approved batch for our source tag.
  const batchReq = p.request();
  batchReq.input('company_id', sql.VarChar(16), cfg.companyId);
  batchReq.input('approver_name', sql.VarChar(255), inv.approverName);
  batchReq.output('return', sql.Int);
  const batchRes = await batchReq.execute('dbo.tanvi_get_batchid_4today');
  const batchId = (batchRes.output['return'] as number | null) ?? null;
  if (batchId == null) {
    throw AppError.upstream('Prologue: failed to obtain a batch id.');
  }

  // 2. Insert the AP invoice. v1 = single GL line for the full amount.
  const glDetailJson = JSON.stringify([
    { account_id: inv.glAccountId, amount: inv.totalAmount },
  ]);

  const req = p.request();
  req.input('batch_id', sql.Int, batchId);
  req.input('vendor_id', sql.VarChar(16), inv.vendorId);
  req.input('vendor_document_number', sql.VarChar(32), inv.vendorDocumentNumber);
  req.input('vendor_document_date', sql.Date, inv.vendorDocumentDate);
  req.input('due_date', sql.Date, inv.dueDate);
  req.input('description', sql.VarChar(40), inv.description.slice(0, 40));
  req.input('detail_total_amount', sql.Decimal(14, 2), inv.totalAmount);
  req.input('gl_detail_json', sql.NVarChar(sql.MAX), glDetailJson);
  req.input('transaction_type_id', sql.VarChar(16), inv.transactionTypeId ?? null);
  req.input('company_id', sql.VarChar(16), cfg.companyId);
  req.input('trade_discount_account', sql.VarChar(32), cfg.defaultAccount);
  req.input('misc_account', sql.VarChar(32), cfg.defaultAccount);
  req.input('freight_account', sql.VarChar(32), cfg.defaultAccount);
  req.input('source_user', sql.VarChar(255), cfg.sourceUser);
  req.output('return_trans_id', sql.Int);
  req.output('return_error', sql.VarChar(500));
  const res = await req.execute('dbo.tanvi_insert_ap_invoice');

  const procError = (res.output['return_error'] as string | null) ?? null;
  const transactionId = (res.output['return_trans_id'] as number | null) ?? null;

  // The proc reports business failures (duplicate, unknown vendor, bad GL
  // account, unbalanced detail) via @return_error rather than by throwing.
  if (procError) {
    throw AppError.conflict(`Prologue rejected the invoice: ${procError}`);
  }
  if (transactionId == null) {
    throw AppError.upstream('Prologue: insert returned no transaction id and no error.');
  }

  return { transactionId, batchId };
}
