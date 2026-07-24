/**
 * Notes and audit trail.
 *
 * Both feed the invoice timeline in the UI. `audit_logs` is append-only —
 * a trigger blocks UPDATE and DELETE at the database level.
 */

import { query, queryOne } from '../db';

export interface NoteRow {
  id: string;
  invoice_id: string;
  user_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// --------------------------------------------------------------------------
// Notes
// --------------------------------------------------------------------------
export async function listNotes(invoiceId: string): Promise<NoteRow[]> {
  return query<NoteRow>(
    `SELECT n.*, u.full_name AS author_name
       FROM invoice_notes n
       LEFT JOIN users u ON u.id = n.user_id
      WHERE n.invoice_id = $1
      ORDER BY n.created_at ASC`,
    [invoiceId]
  );
}

export async function addNote(
  invoiceId: string,
  userId: string,
  body: string
): Promise<NoteRow> {
  const row = await queryOne<NoteRow>(
    `INSERT INTO invoice_notes (invoice_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [invoiceId, userId, body]
  );

  if (!row) throw new Error('Note insert returned no row');

  await recordAudit({
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'note_added',
    userId,
    metadata: { noteId: row.id },
  });

  return row;
}

// --------------------------------------------------------------------------
// Audit
// --------------------------------------------------------------------------
export async function listAudit(
  entityType: string,
  entityId: string
): Promise<AuditRow[]> {
  return query<AuditRow>(
    // The audit identifies the actor by email — the account that acted, not a
    // display name or role. A system event (no user_id) yields null, which the
    // UI renders as "System".
    `SELECT a.*, u.email AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entity_type = $1 AND a.entity_id = $2
      ORDER BY a.created_at ASC`,
    [entityType, entityId]
  );
}

export async function listRecentAudit(limit: number): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT a.*, u.email AS actor_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT $1`,
    [limit]
  );
}

export async function recordAudit(entry: {
  entityType: string;
  entityId: string | null;
  action: string;
  userId: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.userId,
      JSON.stringify(entry.metadata ?? {}),
    ]
  );
}
