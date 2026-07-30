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
import { config } from './config';
import { AppError } from './errors';

let pool: sql.ConnectionPool | undefined;
let connecting: Promise<sql.ConnectionPool> | undefined;

/** Whether the integration is switched on. Callers gate their work on this. */
export function isEnabled(): boolean {
  return config.prologue.enabled;
}

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  if (connecting) return connecting;

  const { host, database, user } = config.prologue;
  if (!host || !database || !user) {
    throw AppError.upstream(
      'Prologue is enabled but PROLOGUE_HOST/DATABASE/USER are not all configured.'
    );
  }

  connecting = new sql.ConnectionPool({
    server: host,
    port: config.prologue.port,
    database,
    user,
    password: config.prologue.password,
    options: {
      encrypt: config.prologue.encrypt,
      trustServerCertificate: config.prologue.trustServerCertificate,
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 10_000,
    requestTimeout: 20_000,
  }).connect();

  try {
    pool = await connecting;
    // A pool-level error must never take the process down.
    pool.on('error', (err) => console.error('[prologue] pool error', err.message));
    return pool;
  } catch (err) {
    throw AppError.upstream(
      `Prologue: cannot connect to SQL Server (${(err as Error).message}).`
    );
  } finally {
    connecting = undefined;
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
  const p = await getPool();

  // 1. Find or create today's pre-approved batch for our source tag.
  const batchReq = p.request();
  batchReq.input('company_id', sql.VarChar(16), config.prologue.companyId);
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
  req.input('company_id', sql.VarChar(16), config.prologue.companyId);
  req.input('trade_discount_account', sql.VarChar(32), config.prologue.defaultAccount);
  req.input('misc_account', sql.VarChar(32), config.prologue.defaultAccount);
  req.input('freight_account', sql.VarChar(32), config.prologue.defaultAccount);
  req.input('source_user', sql.VarChar(255), config.prologue.sourceUser);
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
