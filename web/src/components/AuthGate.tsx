import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, AlertTriangle } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface AuthGateProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export const AuthGate = ({ children, requireAuth = true }: AuthGateProps) => {
  const { user, loading, hasNoRoles, signOut, isSuperAdmin } = useAuth();
  const location = useLocation();

  // 1) Still loading session/role
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // 2) Auth required but no user
  if (requireAuth && !user) {
    return <Navigate to="/auth" replace />;
  }

  // 3) Auth NOT required but user exists (e.g., /auth page)
  if (!requireAuth && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // 4) User exists but has NO ROLES - show error (skip for superadmins and onboarding)
  const isOnboardingRoute = location.pathname.startsWith('/onboarding');
  if (requireAuth && user && hasNoRoles && !isSuperAdmin && !isOnboardingRoute) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Missing Permissions</h2>
          <p className="text-muted-foreground">
            Your account is missing permissions. Please contact your admin to assign you a role.
          </p>
          <p className="text-sm text-muted-foreground">
            Email: <a href="mailto:ap-support@bfsfcu.org" className="text-primary underline">ap-support@bfsfcu.org</a>
          </p>
          <Button 
            variant="outline" 
            onClick={() => signOut()}
            className="mt-4"
          >
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  // 5) All checks passed - render children
  return <>{children}</>;
};
