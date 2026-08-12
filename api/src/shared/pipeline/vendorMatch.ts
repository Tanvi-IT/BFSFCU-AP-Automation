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
 *   3. learned alias (a human's past manual pick for this exact payee spelling)
 *   4. word-level trigram similarity IN SQL (pg_trgm)
 *   5. Azure OpenAI, only when SQL is inconclusive
 *   6. no match — return unmatched
 */

import { query, queryOne } from '../db';
import { resolveVendorName } from '../ai/openai';
import { findVendorByAlias } from './vendorAlias';

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
  matchedBy: 'tax_id' | 'bank_account' | 'alias' | 'similarity' | 'ai' | 'unmatched';
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

/**
 * Word-similarity floor for an automatic match. Below this we ask the model.
 *
 * These are `strict_word_similarity` scores, not whole-string `similarity`.
 * Whole-string similarity is diluted by a long legal name: "verizony" vs
 * "Verizon Communications, Inc" scores ~0.24 — below any useful floor — because
 * "Communications, Inc" adds trigrams the payee text never had. Word similarity
 * scores the payee against the best-matching *word* of the vendor name, so that
 * same pair scores ~0.78. Tune against the real vendor list before trusting the
 * exact numbers.
 */
const AUTO_MATCH_THRESHOLD = 0.6;
/** Candidates below this are not worth showing the model either. */
const CANDIDATE_THRESHOLD = 0.4;

/**
 * Word-level trigram score, taken as the better of both directions so it works
 * whether the extracted payee is shorter than the vendor name ("verizon" in
 * "Verizon Communications Inc") or longer than it. Kept in one place so the
 * candidate filter and the score column can never drift apart.
 */
const WORD_SIM = `GREATEST(strict_word_similarity(name, $1), strict_word_similarity($1, name))`;

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

  // 3. Learned alias — a human's past manual pick for this exact payee spelling.
  //    Checked before fuzzy scoring: once a person has resolved a name, an
  //    identical name should never have to survive trigram thresholds again.
  const alias = await findVendorByAlias(name);
  if (alias) return { ...alias, matchedBy: 'alias' };

  // 4. Word-level trigram similarity, computed in the database.
  const candidates = await query<VendorRow & { score: number }>(
    `SELECT id, name, status, ${WORD_SIM} AS score
       FROM vendors
      WHERE ${WORD_SIM} > $2
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

  // 5. Ambiguous — let the model choose from the shortlist, or decline.
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

  // 6. Not on the vendor master. An admin must import them first.
  return UNMATCHED;
}
