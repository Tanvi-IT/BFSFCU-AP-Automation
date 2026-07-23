/**
 * Vendor routes.
 *
 *   GET   /api/vendors            list (filter by status / search)
 *   POST  /api/vendors/import     admin — bulk upload a vendor list (CSV/XLSX)
 *   GET   /api/vendors/{id}
 *   PATCH /api/vendors/{id}       edit details
 *   POST  /api/vendors/{id}/status   approve / block a vendor
 */

import { app } from '@azure/functions';
import * as XLSX from 'xlsx';
import { createHandler, createMethodHandler, ok } from '../../shared/handler';
import { Roles } from '../../shared/authorize';
import { AppError } from '../../shared/errors';
import * as vendors from '../../shared/repository/vendors';

const VALID_STATUS = new Set(['pending_verification', 'active', 'blocked']);

const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

/** Map a spreadsheet header to a vendor field. Tolerant of spacing/case. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, '');
}

const HEADER_MAP: Record<string, keyof vendors.VendorImportRow> = {
  name: 'name',
  vendorname: 'name',
  taxid: 'taxId',
  ein: 'taxId',
  emaildomain: 'emailDomain',
  domain: 'emailDomain',
  bankaccount: 'bankAccount',
  account: 'bankAccount',
  externalid: 'externalId',
  status: 'status',
};

app.http('vendors-list', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors',
  handler: createHandler({ roles: Roles.any }, async ({ req }) => {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    const rows = await vendors.list({
      limit: Number.isFinite(limit) ? limit : 100,
      offset: Number.isFinite(offset) ? offset : 0,
      ...(status && VALID_STATUS.has(status)
        ? { status: status as vendors.VendorStatus }
        : {}),
      ...(search ? { search } : {}),
    });

    return ok({ vendors: rows });
  }),
});

// --------------------------------------------------------------------------
// POST /api/vendors/import  — admin only. Upload a CSV/XLSX vendor list.
//
// Registered before vendors/{id} so "import" is not captured as an id.
// --------------------------------------------------------------------------
app.http('vendors-import', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/import',
  handler: createHandler({ roles: Roles.admin }, async ({ req, user, log }) => {
    const form = await req.formData().catch(() => {
      throw AppError.validation('Expected a multipart/form-data file upload');
    });

    const file = form.get('file');
    if (!file || typeof file === 'string') {
      throw AppError.validation('No file was included in the upload');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) throw AppError.validation('The uploaded file is empty');
    if (bytes.length > MAX_IMPORT_BYTES) {
      throw AppError.validation('File exceeds the 5 MB limit');
    }

    // xlsx reads both .csv and .xlsx.
    let sheetRows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(bytes, { type: 'buffer' });
      const first = wb.SheetNames[0];
      const sheet = first ? wb.Sheets[first] : undefined;
      if (!sheet) throw new Error('no sheet');
      sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        defval: null,
      });
    } catch {
      throw AppError.validation('Could not read the file. Upload a CSV or XLSX.');
    }

    const parsed: vendors.VendorImportRow[] = [];
    const errors: string[] = [];

    sheetRows.forEach((raw, i) => {
      const row: Partial<Record<keyof vendors.VendorImportRow, string>> = {};
      for (const [key, value] of Object.entries(raw)) {
        const field = HEADER_MAP[normalizeHeader(key)];
        if (field && value != null && String(value).trim() !== '') {
          row[field] = String(value).trim();
        }
      }

      if (!row.name) {
        errors.push(`Row ${i + 2}: missing vendor name`);
        return;
      }
      if (row.status && !VALID_STATUS.has(row.status)) {
        errors.push(`Row ${i + 2}: invalid status "${row.status}"`);
        return;
      }

      parsed.push({
        name: row.name,
        taxId: row.taxId ?? null,
        emailDomain: row.emailDomain ?? null,
        bankAccount: row.bankAccount ?? null,
        externalId: row.externalId ?? null,
        ...(row.status ? { status: row.status as vendors.VendorStatus } : {}),
      });
    });

    if (parsed.length === 0) {
      throw AppError.validation(
        errors.length
          ? `No valid rows. First issues: ${errors.slice(0, 3).join('; ')}`
          : 'No rows found. Expected a header row with at least a "name" column.'
      );
    }

    const result = await vendors.importMany(parsed, user.id);
    log.info('Vendor list imported', { ...result, skipped: errors.length });

    return ok({
      inserted: result.inserted,
      updated: result.updated,
      skipped: errors.length,
      errors: errors.slice(0, 20),
    });
  }),
});

app.http('vendor-by-id', {
  methods: ['GET', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{id}',
  handler: createMethodHandler({
    GET: {
      roles: Roles.any,
      handler: async ({ req }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing vendor id');

        const vendor = await vendors.getById(id);
        if (!vendor) throw AppError.notFound('Vendor not found');

        return ok(vendor);
      },
    },
    PATCH: {
      roles: Roles.reviewer,
      handler: async ({ req, user }) => {
        const id = req.params['id'];
        if (!id) throw AppError.validation('Missing vendor id');

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const updated = await vendors.update(
          id,
          {
            ...(typeof body['name'] === 'string' ? { name: body['name'] } : {}),
            ...(typeof body['taxId'] === 'string' ? { taxId: body['taxId'] } : {}),
            ...(typeof body['bankAccount'] === 'string'
              ? { bankAccount: body['bankAccount'] }
              : {}),
          },
          user.id
        );

        if (!updated) throw AppError.notFound('Vendor not found');
        return ok(updated);
      },
    },
  }),
});

app.http('vendors-status', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{id}/status',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing vendor id');

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof body['status'] === 'string' ? body['status'] : '';

    if (!VALID_STATUS.has(status)) {
      throw AppError.validation(
        `status must be one of: ${[...VALID_STATUS].join(', ')}`
      );
    }

    const updated = await vendors.setStatus(id, status as vendors.VendorStatus, user.id);
    if (!updated) throw AppError.notFound('Vendor not found');

    log.info('Vendor status changed', { vendorId: id, status });
    return ok(updated);
  }),
});

app.http('vendors-merge', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'vendors/{id}/merge',
  handler: createHandler({ roles: Roles.approver }, async ({ req, user, log }) => {
    const id = req.params['id'];
    if (!id) throw AppError.validation('Missing vendor id');

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const targetId = typeof body['targetVendorId'] === 'string' ? body['targetVendorId'] : '';
    if (!targetId) throw AppError.validation('targetVendorId is required');
    if (targetId === id) throw AppError.validation('Cannot merge a vendor into itself');

    const result = await vendors.merge(id, targetId, user.id);
    log.info('Vendors merged', { sourceId: id, targetId, ...result });

    return ok({ merged: true, ...result });
  }),
});

export {};
