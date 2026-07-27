import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayInvoiceNumber(invoiceNumber: string | null | undefined): string {
  if (!invoiceNumber) return '';
  return invoiceNumber.replace(/-REISSUED-\d+$/, '');
}

/**
 * GL Account is a 14-digit account number that may contain dashes as
 * separators (e.g. "10-2000-4500-01"). Strip anything that is not a digit or a
 * dash, and cap the digit count at 14 so a reviewer cannot over-type. Dashes do
 * not count toward the limit. Used by every review queue so the field behaves
 * identically everywhere.
 */
export function sanitizeGlAccount(value: string): string {
  let digits = 0;
  let out = '';
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      if (digits >= 14) continue;
      digits++;
      out += ch;
    } else if (ch === '-') {
      out += ch;
    }
  }
  return out;
}
