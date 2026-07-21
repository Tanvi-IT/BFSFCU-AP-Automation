/**
 * Authentication, backed by Entra ID via MSAL.
 *
 * Replaces the Supabase implementation. The public shape is kept deliberately
 * close to the old hook so existing pages keep compiling while they are
 * migrated one at a time.
 *
 * Gone for good — Entra owns these: signUp, email verification, password reset.
 *
 * Role note: the database stores five canonical roles
 * (superadmin, admin, ap_analyst, approver, read_only). The legacy booleans
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

  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin" || isSuperAdmin;
  const isChecker = role === "approver" || role === "checker" || isAdmin;
  const isMaker = role === "ap_analyst" || role === "maker" || isAdmin;

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
     * @deprecated Single-tenant system — there is no tenant. Present only so
     * unmigrated pages keep compiling. Remove call sites during migration.
     */
    tenantId: undefined as string | undefined,
    /** @deprecated Retained for compile compatibility during migration. */
    tenantResolved: true,
    /** @deprecated MSAL owns the session; use `isAuthenticated`. */
    session: account ?? null,
  };
};
