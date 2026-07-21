import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import clarusLogo from "@/assets/clarus-logo.png";
import { Mail, CheckCircle2, Loader2, RefreshCw, ArrowLeft } from "lucide-react";

// Domain-based branding: hide Clarus branding on demo domains
const isDemoDomain = () => window.location.hostname.includes("bfsfcu-demo");

export default function AuthVerify() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  
  const email = searchParams.get("email") || "";

  // Check if user gets verified (they may click verify link in another tab)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user?.email_confirmed_at) {
        setIsVerified(true);
        toast({
          title: "Email verified!",
          description: "Redirecting to complete your setup...",
        });
        setTimeout(() => navigate("/onboarding"), 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResend = async () => {
    if (!email || resendCooldown > 0) return;
    
    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      
      if (error) throw error;
      
      toast({
        title: "Email sent",
        description: "Check your inbox for the verification link.",
      });
      setResendCooldown(60);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to resend email";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsResending(false);
    }
  };

  const isDemo = isDemoDomain();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - hidden on demo domains */}
      {!isDemo && (
        <header className="border-b border-border bg-card">
          <div className="container mx-auto flex h-16 items-center px-4">
            <Link to="/" className="flex items-center gap-2">
              <img src={clarusLogo} alt="AP Automation" className="h-8" />
            </Link>
          </div>
        </header>
      )}

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className={`mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center ${
              isVerified ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"
            }`}>
              {isVerified ? (
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              ) : (
                <Mail className="h-8 w-8 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {isVerified ? "Email Verified!" : "Check your email"}
            </CardTitle>
            <CardDescription className="text-base">
              {isVerified 
                ? "Your email has been verified. Redirecting you to complete setup..."
                : `We've sent a verification link to ${email || "your email address"}`
              }
            </CardDescription>
          </CardHeader>
          
          {!isVerified && (
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium">Didn't receive the email?</p>
                <ul className="text-muted-foreground space-y-1">
                  <li>• Check your spam or junk folder</li>
                  <li>• Make sure you entered the correct email</li>
                  <li>• Wait a few minutes and try again</li>
                </ul>
              </div>
              
              <Button 
                onClick={handleResend} 
                variant="outline" 
                className="w-full"
                disabled={isResending || resendCooldown > 0}
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend in {resendCooldown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend verification email
                  </>
                )}
              </Button>
              
              <div className="text-center">
                <Link 
                  to="/auth" 
                  className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back to sign in
                </Link>
              </div>
            </CardContent>
          )}
        </Card>
      </main>

      {/* Footer - hidden on demo domains */}
      {!isDemo && (
        <footer className="border-t border-border py-4">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            Need help? Contact us at{" "}
            <a href="mailto:support@clarusap.com" className="text-primary hover:underline">
              support@clarusap.com
            </a>
          </div>
        </footer>
      )}
    </div>
  );
}
