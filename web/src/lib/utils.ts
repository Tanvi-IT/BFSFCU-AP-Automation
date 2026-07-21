import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayInvoiceNumber(invoiceNumber: string | null | undefined): string {
  if (!invoiceNumber) return '';
  return invoiceNumber.replace(/-REISSUED-\d+$/, '');
}
