/**
 * PDF page operations, backed by pdf-lib.
 *
 * Two callers:
 *   - manual upload trims a large document to a page range before it is stored
 *     or extracted (so Document Intelligence is never billed for pages a user
 *     already said they don't want);
 *   - review lets a human delete pages from an invoice's stored PDF.
 *
 * Everything is 1-indexed at the boundary (that is what a person sees in a
 * viewer) and converted to pdf-lib's 0-indexed pages internally.
 */

import { PDFDocument } from 'pdf-lib';

function load(bytes: Buffer): Promise<PDFDocument> {
  // ignoreEncryption: some invoices are "protected" with an empty owner
  // password purely to disable copy/print; that must not block a page trim.
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

/** Page count, or 0 if the bytes are not a parseable PDF. */
export async function getPageCount(bytes: Buffer): Promise<number> {
  try {
    return (await load(bytes)).getPageCount();
  } catch {
    return 0;
  }
}

/** Build a fresh PDF from just the given 0-indexed pages, preserving order. */
async function subset(bytes: Buffer, keep: number[]): Promise<Buffer> {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keep);
  copied.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save());
}

/**
 * Keep only pages [from, to] (1-indexed, inclusive). The bounds are clamped to
 * the document, and an out-of-order range throws. Returns the input untouched
 * when the range already covers the whole document.
 */
export async function keepPageRange(bytes: Buffer, from: number, to: number): Promise<Buffer> {
  const count = (await load(bytes)).getPageCount();
  const lo = Math.max(1, Math.floor(from));
  const hi = Math.min(count, Math.floor(to));
  if (lo > hi) {
    throw new Error(`Invalid page range ${from}-${to} for a ${count}-page document`);
  }
  if (lo === 1 && hi === count) return bytes;

  const keep: number[] = [];
  for (let i = lo; i <= hi; i++) keep.push(i - 1);
  return subset(bytes, keep);
}

/**
 * Redaction. Replace the given 1-indexed pages with flattened images (the page
 * rendered by the browser with black bars burned in). Because the replacement
 * is a raster image, the original text/vector content of that page is GONE —
 * this is true redaction, not a rectangle drawn over recoverable text. Pages not
 * in the list are copied through untouched (and keep their selectable text).
 *
 * Each image should be a JPEG/PNG of the whole page at the page's aspect ratio;
 * it is drawn to fill the page box, so appearance is preserved.
 */
export async function replacePagesWithImages(
  bytes: Buffer,
  replacements: { page: number; image: Buffer; kind: 'png' | 'jpg' }[]
): Promise<Buffer> {
  const src = await load(bytes);
  const count = src.getPageCount();
  const byPage = new Map(replacements.map((r) => [r.page, r]));

  const out = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const repl = byPage.get(i + 1);
    if (repl) {
      const size = src.getPage(i).getSize();
      const embedded =
        repl.kind === 'png' ? await out.embedPng(repl.image) : await out.embedJpg(repl.image);
      const page = out.addPage([size.width, size.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
    } else {
      const [copied] = await out.copyPages(src, [i]);
      out.addPage(copied);
    }
  }
  return Buffer.from(await out.save());
}

/**
 * Remove the given 1-indexed pages. Unknown/out-of-range page numbers are
 * ignored; deleting every page is refused (an invoice must keep a document).
 */
export async function deletePages(bytes: Buffer, pages: number[]): Promise<Buffer> {
  const count = (await load(bytes)).getPageCount();
  const remove = new Set(
    pages.map((p) => Math.floor(p) - 1).filter((i) => i >= 0 && i < count)
  );
  if (remove.size === 0) return bytes;
  if (remove.size >= count) {
    throw new Error('Cannot delete every page of an invoice');
  }

  const keep: number[] = [];
  for (let i = 0; i < count; i++) if (!remove.has(i)) keep.push(i);
  return subset(bytes, keep);
}
