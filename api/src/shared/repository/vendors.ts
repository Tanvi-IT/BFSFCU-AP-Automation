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
  /** ACH details, as they appear on a bank's ACH vendor listing. */
  achRoutingNumber?: string | null;
  achAccountNumber?: string | null;
  // No status: an imported vendor is always set 'active'. Presence on the
  // admin's list is the approval.
}

/**
 * Bulk import vendors (admin upload). **The upload replaces the vendor list.**
 *
 * The uploaded file is authoritative: every row in it is created or updated and
 * set `active`, and any vendor missing from it is removed. The whole thing runs
 * in one transaction, so a failure part-way leaves the previous list intact
 * rather than a half-replaced one.
 *
 * Removal is unconditional, including vendors that existing invoices point at.
 * That is safe because an invoice's vendor is settled when it is validated: the
 * name is copied to `invoices.vendor_name_snapshot` at that moment, and the
 * foreign key is ON DELETE SET NULL. A later list upload therefore drops the
 * live link without changing what the invoice says it was for.
 */
export async function importMany(
  rows: readonly VendorImportRow[],
  actorId: string
): Promise<{
  inserted: number;
  updated: number;
  removed: number;
}> {
  return transaction(async (client) => {
    let inserted = 0;
    let updated = 0;
    /** Every vendor id present in the uploaded file. */
    const keptIds: string[] = [];

    for (const r of rows) {
      // Match order matters on re-import. external_id (the ERP vendor number)
      // is checked first because it is stable: a vendor renamed in the source
      // system would otherwise fail the name match and be inserted a second
      // time, leaving two records competing to match the same invoices.
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM vendors
          WHERE (($1::text IS NOT NULL AND external_id = $1)
             OR  ($2::text IS NOT NULL AND tax_id = $2)
             OR  lower(name) = lower($3))
          ORDER BY (external_id IS NOT DISTINCT FROM $1) DESC,
                   (tax_id      IS NOT DISTINCT FROM $2) DESC
          LIMIT 1`,
        [r.externalId ?? null, r.taxId ?? null, r.name]
      );

      // Being on the admin's uploaded list is what makes a vendor approved, so
      // status is forced to 'active' rather than read from the file.
      if (existing.rows[0]) {
        await client.query(
          `UPDATE vendors
              SET name               = $2,
                  tax_id             = COALESCE($3, tax_id),
                  email_domain       = COALESCE($4, email_domain),
                  bank_account       = COALESCE($5, bank_account),
                  external_id        = COALESCE($6, external_id),
                  ach_routing_number = COALESCE($7, ach_routing_number),
                  ach_account_number = COALESCE($8, ach_account_number),
                  status             = 'active'
            WHERE id = $1`,
          [
            existing.rows[0].id,
            r.name,
            r.taxId ?? null,
            r.emailDomain ?? null,
            r.bankAccount ?? null,
            r.externalId ?? null,
            r.achRoutingNumber ?? null,
            r.achAccountNumber ?? null,
          ]
        );
        keptIds.push(existing.rows[0].id);
        updated++;
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO vendors
             (name, tax_id, email_domain, bank_account, external_id,
              ach_routing_number, ach_account_number, status, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'upload')
           RETURNING id`,
          [
            r.name,
            r.taxId ?? null,
            r.emailDomain ?? null,
            r.bankAccount ?? null,
            r.externalId ?? null,
            r.achRoutingNumber ?? null,
            r.achAccountNumber ?? null,
          ]
        );
        const row = ins.rows[0];
        if (!row) throw new Error('Vendor insert returned no row');
        keptIds.push(row.id);
        inserted++;
      }
    }

    // Replace semantics. `keptIds` is never empty — the route rejects a file
    // with no valid rows before reaching here, which is what stops an unreadable
    // upload from wiping the list.
    const deleted = await client.query(
      `DELETE FROM vendors
        WHERE id <> ALL($1::uuid[])
        RETURNING id`,
      [keptIds]
    );

    const removed = deleted.rowCount ?? 0;

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
       VALUES ('vendor', NULL, 'bulk_imported', $1, $2::jsonb)`,
      [actorId, JSON.stringify({ inserted, updated, removed, total: rows.length })]
    );

    return { inserted, updated, removed };
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
