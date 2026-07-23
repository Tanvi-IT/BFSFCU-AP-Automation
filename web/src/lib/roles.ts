/**
 * Role display labels.
 *
 * Two roles: admin and user. Labels are capitalized for display; the stored
 * values are lowercase. Kept as a helper so the UI has one place to change if
 * labels ever diverge from stored values.
 */

import type { AppRole } from "@/types/invoice";

const LABELS: Record<string, string> = {
  admin: "Admin",
  user: "User",
};

export function roleLabel(role: AppRole | string | null | undefined): string {
  if (!role) return "";
  return LABELS[role] ?? role;
}
