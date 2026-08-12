/**
 * Learned vendor-name aliases.
 *
 * A human's manual vendor pick on a previously-unmatched invoice is recorded in
 * `vendor_name_aliases` (see migration 0018). This module owns the two ends of
 * that table that the pipeline touches: the normaliser that produces the lookup
 * key, and the lookup itself. Capture (the upsert) lives in the invoice-edit
 * transaction in `repository/workflow.ts`, which imports `normalizeVendorName`
 * from here so both sides key the table identically.
 */

import { queryOne } from '../db';

/**
 * Normalise a payee name into the alias lookup key: lowercase, punctuation and
 * separators collapsed to single spaces, trimmed. "Verizon Communications, Inc"
 * and "verizon   communications inc" both become "verizon communications inc".
 * Returns '' when nothing usable remains — callers must treat '' as "no key".
 */
export function normalizeVendorName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface AliasVendor {
  id: string;
  name: string;
  status: 'pending_verification' | 'active' | 'blocked';
}

/**
 * Resolve a payee name through the learned aliases. Exact match on the
 * normalised key — an alias is a human-verified mapping, so we do not fuzzy it
 * (the fuzzy pass runs afterwards anyway). Returns null when there is no learned
 * mapping for this spelling.
 */
export async function findVendorByAlias(name: string | null | undefined): Promise<AliasVendor | null> {
  const key = normalizeVendorName(name);
  if (!key) return null;

  try {
    const row = await queryOne<AliasVendor>(
      `SELECT v.id, v.name, v.status
         FROM vendor_name_aliases a
         JOIN vendors v ON v.id = a.vendor_id
        WHERE a.alias_norm = $1
        LIMIT 1`,
      [key]
    );
    return row ?? null;
  } catch (err) {
    // Tolerate the table not being migrated yet (migration 0018): the alias
    // step is an enhancement, so ingest falls through to fuzzy matching rather
    // than failing. Any other error is a real fault and propagates.
    if ((err as { code?: string })?.code === '42P01') return null;
    throw err;
  }
}
