/**
 * Sign-in page — email and password.
 *
 * Local authentication. There is no self-signup or password reset here; an
 * administrator creates accounts and sets passwords. The design leaves room for
 * an SSO button later without changing this page's structure.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, authApi, type SsoPublicConfig } from "@/lib/api";
import { signInWithMicrosoft } from "@/lib/entra";
import bfsfcuLogo from "@/assets/tenant-logos/bfsfcu-logo.svg";
import { Loader2, LogIn } from "lucide-react";

const Auth = () => {
  const { signIn, signInWithEntra, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig | null>(null);
  const [ssoSubmitting, setSsoSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    authApi
      .ssoConfig()
      .then(setSsoConfig)
      .catch(() => setSsoConfig({ enabled: false }));
  }, []);

  const handleEntra = async () => {
    if (!ssoConfig?.enabled || !ssoConfig.tenantId || !ssoConfig.clientId) return;
    setError(null);
    setSsoSubmitting(true);
    try {
      const idToken = await signInWithMicrosoft(ssoConfig.tenantId, ssoConfig.clientId);
      await signInWithEntra(idToken);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("No account is set up for this Microsoft user. Contact an administrator.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Microsoft sign-in could not be verified.");
      } else {
        setError("Microsoft sign-in did not complete.");
      }
    } finally {
      setSsoSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Your account has been deactivated.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={bfsfcuLogo} alt="Bank Fund Credit Union" className="mx-auto h-12 w-auto" />
          <CardTitle className="mt-4 text-2xl">Accounts Payable</CardTitle>
          <CardDescription>Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </>
              )}
            </Button>
          </form>

          {ssoConfig?.enabled && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
                disabled={ssoSubmitting}
                onClick={handleEntra}
              >
                {ssoSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Sign in with Microsoft"
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
