/**
 * Authentication, backed by Entra ID via MSAL.
 *
 * Replaces the Supabase implementation. The public shape is kept deliberately
 * close to the old hook so existing pages keep compiling while they are
 * migrated one at a time.
 *
 * Gone for good — Entra owns these: signUp, email verification, password reset.
 *
 * Role note: the database stores five canonical roles, prefixed "pp-" because
 * the names double as Entra group names (pp-superadmin, pp-admin,
 * pp-ap_analyst, pp-approver, pp-read_only). Never render these raw — use
 * roleLabel() from @/lib/roles. The legacy booleans
 * isMaker / isChecker / isAPOrigination are aliases onto those, because in the
 * old implementation all three resolved to the same check.
 */

import { useCallback, useEffect, useState } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "@/authConfig";
import { api, ApiError } from "@/lib/api";
import type { AppRole } from "@/types/invoice";

export interface CurrentUser {
  id: string;
  entraOid: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
  isActive: boolean;
}

export const useAuth = () => {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notProvisioned, setNotProvisioned] = useState(false);

  const account = accounts[0];

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated || !account) {
      setUser(null);
      setLoading(inProgress !== "none");
      return;
    }

    (async () => {
      try {
        // The server resolves the application user from the token's oid claim.
        const me = await api.get<CurrentUser>("/me");
        if (!cancelled) {
          setUser(me);
          setNotProvisioned(false);
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null);
          // 403 here means: authenticated with Entra, but no application account.
          setNotProvisioned(err instanceof ApiError && err.isForbidden);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, account, inProgress]);

  const signIn = useCallback(async () => {
    await instance.loginRedirect(loginRequest);
  }, [instance]);

  const signOut = useCallback(async () => {
    await instance.logoutRedirect(account ? { account } : undefined);
  }, [instance, account]);

  const role = user?.role;

  const isSuperAdmin = role === "pp-superadmin";
  const isAdmin = role === "pp-admin" || isSuperAdmin;
  const isChecker = role === "pp-approver" || role === "checker" || isAdmin;
  const isMaker = role === "pp-ap_analyst" || role === "maker" || isAdmin;

  return {
    user,
    loading: loading || inProgress !== "none",
    isAuthenticated,

    signIn,
    signOut,

    isSuperAdmin,
    isAdmin,
    isChecker,
    isMaker,
    /** @deprecated Alias of isMaker — kept so unmigrated pages compile. */
    isAPOrigination: isMaker,
    canApprove: isChecker,
    canAccessSettings: isAdmin,

    userRole: role ?? null,
    /** True when Entra sign-in succeeded but the user has no application account. */
    hasNoRoles: notProvisioned,
    notProvisioned,

    /**
     * @deprecated Single-tenant system — there is no tenant.
     *
     * This returns a constant rather than undefined because ~21 unmigrated
     * pages still guard their data loads with `if (!tenantId) return;`. With
     * undefined those guards bail before fetching and before clearing their
     * loading flag, so the page spins forever — POCDashboard and every review
     * queue did exactly that.
     *
     * The value is the nil UUID, not a label, so that the few pages still
     * putting `tenant_id: tenantId` in a payload send something a uuid column
     * would accept. Nothing server-side reads it; the API has no tenant
     * concept. Remove the guards, then remove this.
     */
    tenantId: "00000000-0000-0000-0000-000000000000" as string | undefined,
    /** @deprecated Retained for compile compatibility during migration. */
    tenantResolved: true,
    /** @deprecated MSAL owns the session; use `isAuthenticated`. */
    session: account ?? null,
  };
};
