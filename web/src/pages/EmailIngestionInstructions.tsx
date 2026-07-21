import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EmailIngestionInstructions() {
  const { tenantId, isSuperAdmin } = useAuth();
  const [copied, setCopied] = useState(false);

  // Derive email address directly from tenant_id
  const emailAddress = tenantId ? `invoices+${tenantId}@inbox.clarusap.com` : null;

  const handleCopy = () => {
    if (!emailAddress) return;
    navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    toast.success('Email address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isSuperAdmin) {
    return (
      <Layout>
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Superadmin Notice
              </CardTitle>
              <CardDescription>
                Email ingestion is tenant-specific. Please access this page from a tenant account.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!tenantId) {
    return (
      <Layout>
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Tenant Not Found
              </CardTitle>
              <CardDescription>
                Unable to determine your tenant. Please contact your administrator.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Email Your Invoices</h1>
          <p className="text-muted-foreground">
            Forward any invoice PDFs to this address to ingest them automatically
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Your Invoice Email Address
            </CardTitle>
            <CardDescription>
              Send invoices to this email address for automatic processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <code className="text-lg font-mono flex-1">{emailAddress}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  1
                </div>
                <div>
                  <p className="font-medium">Vendors Email Invoices Directly</p>
                  <p className="text-sm text-muted-foreground">
                    Share this email address with your vendors so they can send invoices directly to AP Automation
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  2
                </div>
                <div>
                  <p className="font-medium">Multiple Attachments Supported</p>
                  <p className="text-sm text-muted-foreground">
                    Send multiple invoice PDFs in a single email - they'll all be processed automatically
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  3
                </div>
                <div>
                  <p className="font-medium">PDF Format Recommended</p>
                  <p className="text-sm text-muted-foreground">
                    For best results, use PDF format. Our extraction engine is optimized for PDF invoices
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                  4
                </div>
                <div>
                  <p className="font-medium">Automatic Processing</p>
                  <p className="text-sm text-muted-foreground">
                    Invoices are extracted, validated, and routed through your approval workflow automatically
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Integration Tip
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  You can also set up email forwarding rules in your accounting software or email client to automatically forward invoices to this address.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}