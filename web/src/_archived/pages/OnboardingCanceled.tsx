import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, ArrowLeft, Mail } from "lucide-react";
import clarusLogo from "@/assets/clarus-logo.png";

export default function OnboardingCanceled() {
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
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Checkout Canceled</CardTitle>
            <CardDescription className="text-base mt-2">
              No worries! Your checkout was canceled and you haven't been charged.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Options */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Ready to try again or have questions? We're here to help.
              </p>
            </div>

            {/* CTAs */}
            <div className="space-y-3">
              <Link to="/pricing" className="block">
                <Button className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Pricing
                </Button>
              </Link>
              <Link to="/contact" className="block">
                <Button variant="outline" className="w-full">
                  <Mail className="mr-2 h-4 w-4" />
                  Contact Sales
                </Button>
              </Link>
            </div>

            {/* Help text */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">Need help deciding?</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• 14-day free trial, no credit card required</li>
                <li>• 30% switch credit from Bill.com, Tipalti, or Concur</li>
                <li>• Unlimited users and vendors on all plans</li>
              </ul>
            </div>

            {/* Contact info */}
            <p className="text-sm text-center text-muted-foreground">
              Questions? Email us at{" "}
              <a href="mailto:info@clarusap.com" className="text-primary hover:underline">
                info@clarusap.com
              </a>
            </p>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Hyperwise LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
