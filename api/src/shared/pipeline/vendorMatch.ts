/**
 * Vendor resolution.
 *
 * Strategy order — cheapest and most reliable first:
 *   1. exact tax id
 *   2. exact bank account
 *   3. trigram similarity IN SQL (pg_trgm)
 *   4. Azure OpenAI, only when SQL is inconclusive
 *   5. create a new vendor, pending verification
 *
 * The old implementation loaded every vendor into memory and ran Levenshtein
 * in JavaScript for each invoice. That is replaced by step 3, which uses the
 * gin_trgm index and stays fast as the vendor list grows.
 */

import { query, queryOne, transaction } from '../db';
import { resolveVendorName } from '../ai/openai';

export interface VendorMatchInput {
  name: string | null;
  taxId: string | null;
  bankAccount: string | null;
}

export interface ResolvedVendor {
  id: string;
  name: string;
  status: 'pending_verification' | 'active' | 'blocked';
  /** True when this invoice caused the vendor record to be created. */
  created: boolean;
  matchedBy: 'tax_id' | 'bank_account' | 'similarity' | 'ai' | 'created';
}

interface VendorRow {
  id: string;
  name: string;
  status: 'pending_verification' | 'active' | 'blocked';
}

/** Similarity floor for an automatic match. Below this we ask the model. */
const AUTO_MATCH_THRESHOLD = 0.55;
/** Candidates below this are not worth showing the model either. */
const CANDIDATE_THRESHOLD = 0.3;

export async function resolveVendor(input: VendorMatchInput): Promise<ResolvedVendor> {
  // 1. Tax id — the strongest identifier.
  if (input.taxId) {
    const row = await queryOne<VendorRow>(
      `SELECT id, name, status FROM vendors WHERE lower(tax_id) = lower($1) LIMIT 1`,
      [input.taxId]
    );
    if (row) return { ...row, created: false, matchedBy: 'tax_id' };
  }

  // 2. Bank account.
  if (input.bankAccount) {
    const row = await queryOne<VendorRow>(
      `SELECT id, name, status FROM vendors WHERE bank_account = $1 LIMIT 1`,
      [input.bankAccount]
    );
    if (row) return { ...row, created: false, matchedBy: 'bank_account' };
  }

  const name = input.name?.trim();
  if (!name) {
    return createVendor('Unknown Vendor', input);
  }

  // 3. Trigram similarity, computed in the database.
  const candidates = await query<VendorRow & { score: number }>(
    `SELECT id, name, status, similarity(name, $1) AS score
       FROM vendors
      WHERE similarity(name, $1) > $2
      ORDER BY score DESC
      LIMIT 5`,
    [name, CANDIDATE_THRESHOLD]
  );

  const best = candidates[0];
  if (best && best.score >= AUTO_MATCH_THRESHOLD) {
    return {
      id: best.id,
      name: best.name,
      status: best.status,
      created: false,
      matchedBy: 'similarity',
    };
  }

  // 4. Ambiguous — let the model choose from the shortlist, or decline.
  if (candidates.length > 0) {
    const chosen = await resolveVendorName(
      name,
      candidates.map((c) => c.name)
    );
    if (chosen) {
      const match = candidates.find((c) => c.name === chosen);
      if (match) {
        return {
          id: match.id,
          name: match.name,
          status: match.status,
          created: false,
          matchedBy: 'ai',
        };
      }
    }
  }

  // 5. No match — create, pending verification.
  return createVendor(name, input);
}

async function createVendor(
  name: string,
  input: VendorMatchInput
): Promise<ResolvedVendor> {
  return transaction(async (client) => {
    const result = await client.query<VendorRow>(
      `INSERT INTO vendors (name, tax_id, bank_account, status, source)
       VALUES ($1, $2, $3, 'pending_verification', 'auto')
       RETURNING id, name, status`,
      [name, input.taxId, input.bankAccount]
    );

    const row = result.rows[0];
    if (!row) throw new Error('Vendor insert returned no row');

    // Auto-created vendors are audited: a later duplicate vendor can be traced
    // back to the invoice that created it.
    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, metadata)
       VALUES ('vendor', $1, 'vendor_created_at_ingest', $2::jsonb)`,
      [row.id, JSON.stringify({ extractedName: name, taxId: input.taxId })]
    );

    return { id: row.id, name: row.name, status: row.status, created: true, matchedBy: 'created' as const };
  });
}
