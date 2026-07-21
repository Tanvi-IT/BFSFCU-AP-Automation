import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ArrowRight, Mail, Loader2 } from "lucide-react";
import clarusLogo from "@/assets/clarus-logo.png";
import { useAuth } from "@/hooks/useAuth";

export default function OnboardingSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user, loading } = useAuth();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    // Auto-redirect countdown
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={clarusLogo} alt="Clarus AP" className="h-8" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Your Clarus AP trial is starting!</CardTitle>
            <CardDescription className="text-base mt-2">
              We're finalizing your workspace. This usually takes just a few seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm">Setting up your organization</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm">Creating your admin account</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm">Preparing onboarding wizard</span>
              </div>
            </div>

            {/* Email notification */}
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Check your email</p>
                <p className="text-sm text-muted-foreground">
                  We've sent a confirmation to your email with login instructions.
                </p>
              </div>
            </div>

            {/* Next steps */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">What's next:</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Complete the onboarding wizard
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Configure your ERP export preferences
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Upload your first invoice
                </li>
              </ul>
            </div>

            {/* CTA */}
            <div className="pt-2">
              {loading ? (
                <Button className="w-full" disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </Button>
              ) : user ? (
                <Link to="/onboarding" className="block">
                  <Button className="w-full">
                    Continue to Onboarding
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Link to="/auth" className="block">
                  <Button className="w-full">
                    Sign In to Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )}
              <p className="text-xs text-center text-muted-foreground mt-3">
                {countdown > 0 ? `Auto-redirecting in ${countdown}s...` : "Ready to continue"}
              </p>
            </div>

            {sessionId && (
              <p className="text-xs text-center text-muted-foreground">
                Session: {sessionId.slice(0, 20)}...
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Questions? Contact us at{" "}
            <a href="mailto:support@clarusap.com" className="text-primary hover:underline">
              support@clarusap.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
