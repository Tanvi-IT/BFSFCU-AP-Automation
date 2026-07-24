/**
 * Vendor resolution — matching only. This never creates a vendor.
 *
 * Vendors enter the system exactly one way: an admin uploads a spreadsheet via
 * POST /api/vendors/import. Ingest may only match an invoice to a vendor that
 * already exists in that master list. An invoice whose vendor is not on the
 * list goes to Exceptions for a human, because silently inventing a payee from
 * text an OCR model read off a PDF is how a fraudulent invoice becomes a
 * payable vendor.
 *
 * Strategy order — cheapest and most reliable first:
 *   1. exact tax id
 *   2. exact bank account
 *   3. trigram similarity IN SQL (pg_trgm)
 *   4. Azure OpenAI, only when SQL is inconclusive
 *   5. no match — return unmatched
 */

import { query, queryOne } from '../db';
import { resolveVendorName } from '../ai/openai';

export interface VendorMatchInput {
  name: string | null;
  taxId: string | null;
  bankAccount: string | null;
}

export interface ResolvedVendor {
  /** null when nothing in the vendor master matched. */
  id: string | null;
  name: string | null;
  status: 'pending_verification' | 'active' | 'blocked' | null;
  matchedBy: 'tax_id' | 'bank_account' | 'similarity' | 'ai' | 'unmatched';
}

const UNMATCHED: ResolvedVendor = {
  id: null,
  name: null,
  status: null,
  matchedBy: 'unmatched',
};

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
    if (row) return { ...row, matchedBy: 'tax_id' };
  }

  // 2. Bank account.
  if (input.bankAccount) {
    const row = await queryOne<VendorRow>(
      `SELECT id, name, status FROM vendors WHERE bank_account = $1 LIMIT 1`,
      [input.bankAccount]
    );
    if (row) return { ...row, matchedBy: 'bank_account' };
  }

  const name = input.name?.trim();
  if (!name) return UNMATCHED;

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
          matchedBy: 'ai',
        };
      }
    }
  }

  // 5. Not on the vendor master. An admin must import them first.
  return UNMATCHED;
}
