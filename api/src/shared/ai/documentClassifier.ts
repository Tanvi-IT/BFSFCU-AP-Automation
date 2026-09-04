/**
 * Azure Document Intelligence — custom classification model (document split).
 *
 * A bundled PDF can hold several invoices of varying length. The prebuilt
 * extraction model cannot separate them (it merges fields across documents), so
 * a trained CUSTOM CLASSIFICATION model is called first with `split=auto`: it
 * detects each document's boundary and returns its page range. The worker then
 * cuts the PDF on those ranges and runs the normal extraction on each piece.
 *
 * The whole feature is inert unless `DOCINTEL_CLASSIFIER_ID` is set — see
 * `classifierEnabled()`.
 */

import { config } from '../config';
import { docIntelClassifierAuthHeaders } from './credential';
import { AppError } from '../errors';

export interface ClassifiedSegment {
  /** The class the model assigned, e.g. 'invoices' or 'other'. */
  docType: string;
  /** 0..1 model confidence for this segment. */
  confidence: number;
  /** 1-based inclusive page range this document occupies in the file. */
  startPage: number;
  endPage: number;
}

const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 120_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when a classifier is configured; otherwise the split feature is off. */
export function classifierEnabled(): boolean {
  return Boolean(config.ai.docIntelClassifierId);
}

/**
 * Whether a segment's class counts as an invoice. The class label comes from the
 * training folder name, so accept both 'invoice' and 'invoices' case-insensitively
 * rather than hard-coding one spelling.
 */
export function isInvoiceClass(docType: string): boolean {
  return /^invoices?$/i.test(docType.trim());
}

interface ClassifierDoc {
  docType?: string;
  confidence?: number;
  boundingRegions?: Array<{ pageNumber?: number }>;
}

/**
 * Classify a file and return one segment per detected document, with page
 * ranges. Throws AppError.upstream on any failure — the caller decides whether
 * to fall back to whole-file extraction.
 */
export async function classifyAndSplit(file: Buffer): Promise<ClassifiedSegment[]> {
  const endpoint = config.ai.docIntelClassifierEndpoint.replace(/\/$/, '');
  const classifierId = config.ai.docIntelClassifierId;
  const url =
    `${endpoint}/documentintelligence/documentClassifiers/${classifierId}:analyze` +
    `?api-version=${config.ai.docIntelApiVersion}&split=auto`;

  const headers = {
    ...(await docIntelClassifierAuthHeaders()),
    'Content-Type': 'application/json',
  };

  const submit = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base64Source: file.toString('base64') }),
  });

  if (!submit.ok) {
    const detail = await submit.text().catch(() => '');
    throw AppError.upstream(
      `Document classifier rejected the document (${submit.status}): ${detail.slice(0, 300)}`
    );
  }

  const operationUrl = submit.headers.get('operation-location');
  if (!operationUrl) {
    throw AppError.upstream('Document classifier did not return an Operation-Location header');
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await fetch(operationUrl, { headers: await docIntelClassifierAuthHeaders() });
    if (!poll.ok) continue; // transient — try again

    const body = (await poll.json()) as {
      status?: string;
      error?: { message?: string };
      analyzeResult?: { documents?: ClassifierDoc[] };
    };

    if (body.status === 'succeeded') {
      const docs = body.analyzeResult?.documents ?? [];
      return docs
        .map((d) => {
          const pages = (d.boundingRegions ?? [])
            .map((b) => b.pageNumber ?? 0)
            .filter((n) => n > 0);
          const startPage = pages.length ? Math.min(...pages) : 1;
          const endPage = pages.length ? Math.max(...pages) : startPage;
          return {
            docType: d.docType ?? 'unknown',
            confidence: d.confidence ?? 0,
            startPage,
            endPage,
          };
        })
        .sort((a, b) => a.startPage - b.startPage);
    }

    if (body.status === 'failed') {
      throw AppError.upstream(
        `Document classification failed: ${body.error?.message ?? 'unknown error'}`
      );
    }
    // running / notStarted — keep polling.
  }

  throw AppError.upstream('Document classifier timed out');
}
