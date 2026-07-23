/** Vendor data access. */

import { query, queryOne, transaction } from '../db';

export type VendorStatus = 'pending_verification' | 'active' | 'blocked';

export interface VendorRow {
  id: string;
  name: string;
  tax_id: string | null;
  external_id: string | null;
  email_domain: string | null;
  bank_account: string | null;
  status: VendorStatus;
  bank_verified: boolean;
  source: string;
  created_at: string;
  updated_at: string;
  invoice_count?: string;
}

export async function list(filters: {
  status?: VendorStatus;
  search?: string;
  limit: number;
  offset: number;
}): Promise<VendorRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    where.push(`v.status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`v.name ILIKE $${params.length}`);
  }

  params.push(filters.limit, filters.offset);

  return query<VendorRow>(
    `SELECT v.*, COUNT(i.id)::text AS invoice_count
       FROM vendors v
       LEFT JOIN invoices i ON i.vendor_id = v.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY v.id
      ORDER BY v.name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

export async function getById(id: string): Promise<VendorRow | undefined> {
  return queryOne<VendorRow>(`SELECT * FROM vendors WHERE id = $1`, [id]);
}

export interface VendorImportRow {
  name: string;
  taxId?: string | null;
  emailDomain?: string | null;
  bankAccount?: string | null;
  externalId?: string | null;
  status?: VendorStatus;
}

/**
 * Bulk import vendors (admin upload).
 *
 * Matches an existing vendor on tax_id when present, otherwise on a
 * case-insensitive name, and updates it; inserts otherwise. Runs in one
 * transaction so a bad row does not leave a half-applied import. Marked
 * source='upload' to distinguish from auto-created vendors.
 */
export async function importMany(
  rows: readonly VendorImportRow[],
  actorId: string
): Promise<{ inserted: number; updated: number }> {
  return transaction(async (client) => {
    let inserted = 0;
    let updated = 0;

    for (const r of rows) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM vendors
          WHERE (($1::text IS NOT NULL AND tax_id = $1)
             OR  lower(name) = lower($2))
          LIMIT 1`,
        [r.taxId ?? null, r.name]
      );

      if (existing.rows[0]) {
        await client.query(
          `UPDATE vendors
              SET name         = $2,
                  tax_id       = COALESCE($3, tax_id),
                  email_domain = COALESCE($4, email_domain),
                  bank_account = COALESCE($5, bank_account),
                  external_id  = COALESCE($6, external_id),
                  status       = COALESCE($7::vendor_status, status)
            WHERE id = $1`,
          [
            existing.rows[0].id,
            r.name,
            r.taxId ?? null,
            r.emailDomain ?? null,
            r.bankAccount ?? null,
            r.externalId ?? null,
            r.status ?? null,
          ]
        );
        updated++;
      } else {
        await client.query(
          `INSERT INTO vendors (name, tax_id, email_domain, bank_account, external_id, status, source)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::vendor_status, 'pending_verification'), 'upload')`,
          [
            r.name,
            r.taxId ?? null,
            r.emailDomain ?? null,
            r.bankAccount ?? null,
            r.externalId ?? null,
            r.status ?? null,
          ]
        );
        inserted++;
      }
    }

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('vendor', NULL, 'bulk_imported', $1, $2::jsonb)`,
      [actorId, JSON.stringify({ inserted, updated, total: rows.length })]
    );

    return { inserted, updated };
  });
}

export async function setStatus(
  id: string,
  status: VendorStatus,
  actorId: string
): Promise<VendorRow | undefined> {
  const row = await queryOne<VendorRow>(
    `UPDATE vendors SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status]
  );

  if (row) {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('vendor', $1, 'status_changed', $2, $3::jsonb)`,
      [id, actorId, JSON.stringify({ status })]
    );
  }

  return row;
}

export async function update(
  id: string,
  fields: { name?: string; taxId?: string | null; bankAccount?: string | null },
  actorId: string
): Promise<VendorRow | undefined> {
  const row = await queryOne<VendorRow>(
    `UPDATE vendors
        SET name         = COALESCE($2, name),
            tax_id       = COALESCE($3, tax_id),
            bank_account = COALESCE($4, bank_account)
      WHERE id = $1
      RETURNING *`,
    [id, fields.name ?? null, fields.taxId ?? null, fields.bankAccount ?? null]
  );

  if (row) {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('vendor', $1, 'updated', $2, $3::jsonb)`,
      [id, actorId, JSON.stringify(fields)]
    );
  }

  return row;
}

/**
 * Merge one vendor into another.
 *
 * Reassigns every invoice to the target vendor, then removes the source — in a
 * single transaction, so a merge can never leave invoices orphaned or pointing
 * at a deleted vendor.
 */
export async function merge(
  sourceId: string,
  targetId: string,
  actorId: string
): Promise<{ invoicesMoved: number }> {
  if (sourceId === targetId) {
    throw new Error('Cannot merge a vendor into itself');
  }

  return transaction(async (client) => {
    const moved = await client.query(
      `UPDATE invoices SET vendor_id = $2 WHERE vendor_id = $1`,
      [sourceId, targetId]
    );

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('vendor', $1, 'merged_into', $2, $3::jsonb)`,
      [
        sourceId,
        actorId,
        JSON.stringify({ targetVendorId: targetId, invoicesMoved: moved.rowCount ?? 0 }),
      ]
    );

    await client.query(`DELETE FROM vendors WHERE id = $1`, [sourceId]);

    return { invoicesMoved: moved.rowCount ?? 0 };
  });
}
