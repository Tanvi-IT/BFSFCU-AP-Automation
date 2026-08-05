/**
 * Authentication — local email/password with a session cookie.
 *
 * State is shared through a context provider so that a login updates every
 * consumer at once. (An earlier version used per-hook useState, which meant the
 * login page's state did not reach AuthGate/Layout, so the first render after
 * login was blank until a reload re-fetched /me everywhere.)
 *
 * Two roles: admin and user. The seam for SSO later lives on the server
 * (shared/auth.ts); this hook only cares that /me returns a user with a role.
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  createElement,
  type ReactNode,
} from "react";
import { authApi, type SessionUser } from "@/lib/api";

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "user";
  isActive: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signInWithEntra: (idToken: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me as SessionUser);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const me = await authApi.login(email, password);
    setUser(me as SessionUser);
    return me;
  }, []);

  const signInWithEntra = useCallback(async (idToken: string) => {
    const me = await authApi.ssoLogin(idToken);
    setUser(me as SessionUser);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Drop the local session even if the call fails.
    }
    setUser(null);
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, signIn, signInWithEntra, signOut } },
    children
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  const { user, loading, signIn, signInWithEntra, signOut } = ctx;

  const role = user?.role;
  const isAdmin = role === "admin";

  return {
    user,
    loading,
    isAuthenticated: !!user,

    signIn,
    signInWithEntra,
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
     * single-tenant no-op. Remove call sites over time.
     */
    isSuperAdmin: isAdmin,
    hasNoRoles: false,
    notProvisioned: false,
    tenantId: "00000000-0000-0000-0000-000000000000" as string | undefined,
    tenantResolved: true,
    session: user,
  };
};
