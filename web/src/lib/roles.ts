/**
 * Role names and their display labels.
 *
 * Roles are stored and sent over the wire prefixed with "pp-" because the names
 * double as Microsoft Entra group names, where bare names like "admin" are too
 * generic to claim in a shared directory.
 *
 * The prefix is an implementation detail. Never show it to a user — render
 * roleLabel(role) instead.
 */

import type { AppRole } from "@/types/invoice";

const LABELS: Record<string, string> = {
  "pp-superadmin": "Superadmin",
  "pp-admin": "admin",
  "pp-ap_analyst": "AP Origination",
  "pp-approver": "approver",
  "pp-read_only": "read_only",
};

/** Human-facing label for a role. Falls back to the raw value stripped of its prefix. */
export function roleLabel(role: AppRole | string | null | undefined): string {
  if (!role) return "";
  return LABELS[role] ?? role.replace(/^pp-/, "");
}
