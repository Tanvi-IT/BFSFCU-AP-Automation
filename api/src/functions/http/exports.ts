/**
 * Prologue reconciliation export.
 *
 *   GET /api/exports/prologue?invoiceIds=a,b,c
 *   GET /api/exports/prologue?dateFrom=&dateTo=
 *
 * Ported from the `export-prologue-excel` Deno function. Column order, date
 * formats and the America/New_York timezone are preserved exactly so the
 * downstream Prologue reconciliation keeps working unchanged.
 */

import { app } from '@azure/functions';
import * as XLSX from 'xlsx';
import { createHandler } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import { query } from '../../shared/db';

const TENANT_TZ = 'America/New_York';

const HEADERS = [
  'Vendor ID',
  'Vendor Name',
  'Invoice Number',
  'Amount',
  'Invoice Date',
  'ACH Account Number',
  'ACH Routing Number',
  'Sanitized Filename',
  'Transaction Date',
  'Approved Date',
];

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TENANT_TZ,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
    .formatToParts(dt)
    .forEach((x) => {
      p[x.type] = x.value;
    });
  return `${p['month']}/${p['day']}/${p['year']}`;
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TENANT_TZ,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(dt)
    .forEach((x) => {
      p[x.type] = x.value;
    });
  return `${p['month']}/${p['day']}/${p['year']} ${p['hour']}:${p['minute']}`;
}

interface ExportRow {
  invoice_number: string | null;
  total_amount: string | null;
  invoice_date: string | null;
  ach_account_number: string | null;
  ach_routing_number: string | null;
  sanitized_filename: string | null;
  original_filename: string | null;
  transaction_date: string | null;
  approved_at: string | null;
  vendor_external_id: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
}

app.http('export-prologue', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'exports/prologue',
  handler: createHandler({ roles: Roles.approver }, async ({ req, log }) => {
    const url = new URL(req.url);
    const idsParam = url.searchParams.get('invoiceIds');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    const where: string[] = [`i.status = 'approved'`];
    const params: unknown[] = [];

    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw AppError.validation('No invoices selected');
      params.push(ids);
      where.push(`i.id = ANY($${params.length}::uuid[])`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`i.approved_at >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`i.approved_at <= $${params.length}`);
    }

    const rows = await query<ExportRow>(
      `SELECT i.invoice_number, i.total_amount, i.invoice_date,
              i.ach_account_number, i.ach_routing_number,
              i.sanitized_filename, i.original_filename,
              i.transaction_date, i.approved_at,
              v.external_id AS vendor_external_id, v.id AS vendor_id, v.name AS vendor_name
         FROM invoices i
         LEFT JOIN vendors v ON v.id = i.vendor_id
        WHERE ${where.join(' AND ')}
        ORDER BY i.approved_at ASC`,
      params
    );

    const aoa: unknown[][] = [HEADERS];
    for (const r of rows) {
      aoa.push([
        r.vendor_external_id ?? r.vendor_id ?? '',
        (r.vendor_name ?? '').replace(/[\r\n]+/g, ' ').trim(),
        r.invoice_number ?? '',
        r.total_amount ? Number(r.total_amount) : '',
        fmtDate(r.invoice_date),
        r.ach_account_number ?? '',
        r.ach_routing_number ?? '',
        r.sanitized_filename ?? r.original_filename ?? '',
        fmtDate(r.transaction_date),
        fmtDateTime(r.approved_at),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
      { wch: 20 }, { wch: 18 }, { wch: 40 }, { wch: 16 }, { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prologue Export');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;

    log.info('Prologue export generated', { invoices: rows.length });

    const filename = `BFSFCU_Prologue_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

    return {
      status: 200,
      body: buffer,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Invoice-Count': String(rows.length),
      },
    };
  }),
});

export {};
