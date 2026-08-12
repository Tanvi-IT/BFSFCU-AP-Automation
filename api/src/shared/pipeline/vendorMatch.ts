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
 * Thresholds for word-level fuzzy matching. All three were tuned against the
 * real vendor list (~280 vendors), not guessed — see the reasoning below.
 *
 * Why word similarity, and stripped: whole-string `similarity()` is diluted by a
 * long legal name — "verizony" vs "Verizon Communications, Inc" scores ~0.24
 * purely because "Communications, Inc" adds trigrams the payee never had, so it
 * never matched. `strict_word_similarity` scores the payee against the best
 * matching *word*, but that over-rewards shared generic words ("acme
 * communications" matched Verizon at 0.75 on "communications" alone). Stripping
 * generic corporate words from BOTH sides before scoring fixes that: the payee
 * is compared on its distinctive tokens only.
 *
 * Why a margin, not just a floor: a bare generic token still ties many vendors
 * at 1.0 ("global" hits three "* Global *" vendors), and no floor separates that
 * from a real single-token match ("amazon"). But the real matches lead the
 * runner-up by >=0.5, while the ambiguous ties lead by ~0. So auto-match also
 * requires a clear margin over the second candidate; ties fall through to the AI
 * shortlist, which sees the real names and decides.
 */
const AUTO_MATCH_THRESHOLD = 0.6;
/** Candidates below this are not worth showing the model either. */
const CANDIDATE_THRESHOLD = 0.4;
/** Minimum lead of the top candidate over the second to auto-match (else: AI). */
const MATCH_MARGIN = 0.25;

/**
 * Generic corporate words that never distinguish one vendor from another. They
 * are stripped from both the payee text and the vendor name before scoring, so
 * a match must rest on the distinctive tokens. One source of truth, used to
 * build both the SQL strip and the JS guard below.
 */
const STOPWORDS = [
  'inc', 'incorporated', 'llc', 'corp', 'corporation', 'co', 'company', 'ltd',
  'limited', 'lp', 'llp', 'plc', 'communications', 'communication', 'services',
  'service', 'solutions', 'solution', 'technologies', 'technology', 'systems',
  'system', 'group', 'holdings', 'international', 'intl', 'enterprises',
  'the', 'and', 'of',
];

/** SQL: lowercase, punctuation→space, drop whole stopwords, collapse, trim. */
function stripSql(expr: string): string {
  return (
    `btrim(regexp_replace(regexp_replace(regexp_replace(lower(${expr}),` +
    `'[^a-z0-9]+',' ','g'),` +
    `'\\m(${STOPWORDS.join('|')})\\M',' ','g'),` +
    `'\\s+',' ','g'))`
  );
}

/** JS mirror of stripSql — used only to skip a payee that is all stopwords. */
function stripJs(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(new RegExp(`\\b(${STOPWORDS.join('|')})\\b`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  // A payee that is nothing but generic words ("Services Inc") carries no
  // distinctive signal — skip fuzzy matching rather than tie a dozen vendors.
  if (!stripJs(name)) return UNMATCHED;

  // 4. Word-level trigram similarity on the stopword-stripped names, computed in
  //    the database. Strip once per row and once for the payee, then score.
  const candidates = await query<VendorRow & { score: number }>(
    `SELECT id, name, status, score FROM (
       SELECT v.id, v.name, v.status,
              GREATEST(strict_word_similarity(v.nn, q.qn),
                       strict_word_similarity(q.qn, v.nn)) AS score
         FROM (SELECT id, name, status, ${stripSql('name')} AS nn FROM vendors) v
         CROSS JOIN (SELECT ${stripSql('$1')} AS qn) q
     ) scored
      WHERE score > $2
      ORDER BY score DESC
      LIMIT 5`,
    [name, CANDIDATE_THRESHOLD]
  );

  // Auto-match only a strong AND unambiguous top candidate: it must clear the
  // floor and lead the runner-up by a clear margin. A generic token that ties
  // several vendors has a ~0 margin and drops to the AI step instead.
  const best = candidates[0];
  const runnerUp = candidates[1];
  const unambiguous = !runnerUp || best!.score - runnerUp.score >= MATCH_MARGIN;
  if (best && best.score >= AUTO_MATCH_THRESHOLD && unambiguous) {
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
