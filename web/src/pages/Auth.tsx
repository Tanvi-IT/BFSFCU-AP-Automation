/**
 * Sign-in page.
 *
 * Entra ID owns authentication, so this is a single hand-off to Microsoft.
 * There is deliberately no email/password form, no sign-up and no password
 * reset — the application never handles credentials.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import peapodLogo from "@/assets/tenant-logos/peapod-logo.png";
import { Loader2, LogIn, ShieldAlert } from "lucide-react";

const Auth = () => {
  const { signIn, isAuthenticated, loading, notProvisioned, user } = useAuth();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSignIn = async () => {
    setIsRedirecting(true);
    try {
      await signIn();
    } finally {
      setIsRedirecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Signed in with Entra, but no account exists in this application.
  if (notProvisioned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <CardTitle className="mt-3">Access not enabled</CardTitle>
            <CardDescription>
              You signed in successfully, but your account has not been granted
              access to this application yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Ask an administrator to add you, then sign in again.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={peapodLogo} alt="" className="mx-auto h-12 w-auto" />
          <CardTitle className="mt-4 text-2xl">Accounts Payable</CardTitle>
          <CardDescription>Sign in with your work account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            onClick={handleSignIn}
            disabled={isRedirecting}
          >
            {isRedirecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Sign in with Microsoft
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
