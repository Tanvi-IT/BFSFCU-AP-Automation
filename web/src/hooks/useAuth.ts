/**
 * Authentication — local email/password with a session cookie.
 *
 * Replaced Entra/MSAL. The public shape is kept close to the old hook so pages
 * keep compiling. Two roles: admin and user.
 *
 * The seam for SSO later lives on the server (`shared/auth.ts`); this hook only
 * cares that `/me` returns a user with a role, however that identity was proven.
 */

import { useCallback, useEffect, useState } from "react";
import { authApi, ApiError, type SessionUser } from "@/lib/api";

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "user";
  isActive: boolean;
}

export const useAuth = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me as SessionUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  /** Sign in with email + password. Throws ApiError on bad credentials. */
  const signIn = useCallback(async (email: string, password: string) => {
    const me = await authApi.login(email, password);
    setUser(me as SessionUser);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the call fails, drop the local session.
    }
    setUser(null);
  }, []);

  const role = user?.role;
  const isAdmin = role === "admin";

  return {
    user,
    loading,
    isAuthenticated: !!user,

    signIn,
    signOut,

    isAdmin,
    /** In the two-role model any signed-in user can review and approve. */
    isMaker: !!user,
    isChecker: !!user,
    isAPOrigination: !!user,
    canApprove: !!user,
    canAccessSettings: isAdmin,

    userRole: role ?? null,

    /**
     * @deprecated Retained for compile compatibility with pages that guard on
     * these. Superadmin no longer exists; admin is the top role. tenantId is a
     * single-tenant no-op — see the server-side note. Remove call sites over
     * time.
     */
    isSuperAdmin: isAdmin,
    hasNoRoles: false,
    notProvisioned: false,
    tenantId: "00000000-0000-0000-0000-000000000000" as string | undefined,
    tenantResolved: true,
    session: user,
  };
};
