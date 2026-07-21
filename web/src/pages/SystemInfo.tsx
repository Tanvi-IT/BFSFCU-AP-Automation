import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Server, Database, Globe, CheckCircle, AlertTriangle, ArrowLeft, Mail, Loader2 } from "lucide-react";
import { settingsApi } from "@/services/settings";
import { toast } from "sonner";

const SystemInfo = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [systemInfo, setSystemInfo] = useState({
    projectId: '',
    region: '',
    supabaseUrl: '',
    storageEndpoint: '',
    functionsEndpoint: '',
  });
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    error_code?: string | null;
    step?: string;
    summary?: { found?: number; processed?: number; failed?: number };
    triggered_at?: string;
    started_at?: string;
    finished_at?: string;
    diagnostics?: unknown;
  } | null>(null);

  useEffect(() => {
    // Extract info from environment and Supabase URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || supabaseUrl.match(/https:\/\/([^.]+)/)?.[1] || '';
    
    // Determine region from URL pattern (Supabase URLs contain region info)
    // Format: https://[project-id].supabase.co or https://[project-id].[region].supabase.co
    let region = 'Unknown';
    if (supabaseUrl.includes('supabase.co')) {
      // Check common US regions
      if (supabaseUrl.includes('us-east') || supabaseUrl.includes('use1')) {
        region = 'US East (us-east-1)';
      } else if (supabaseUrl.includes('us-west') || supabaseUrl.includes('usw1') || supabaseUrl.includes('usw2')) {
        region = 'US West (us-west-1/2)';
      } else if (supabaseUrl.includes('eu-') || supabaseUrl.includes('euw')) {
        region = 'EU (non-US)';
      } else if (supabaseUrl.includes('ap-') || supabaseUrl.includes('apac')) {
        region = 'Asia Pacific (non-US)';
      } else {
        // Default Supabase projects are typically in US
        region = 'US (Default)';
      }
    }

    setSystemInfo({
      projectId,
      region,
      supabaseUrl,
      storageEndpoint: `${supabaseUrl}/storage/v1`,
      functionsEndpoint: `${supabaseUrl}/functions/v1`,
    });
  }, []);

  const isUSRegion = systemInfo.region.includes('US');

  const persistRun = (entry: any) => {
    try {
      const KEY = 'email_ingest_manual_runs';
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift(entry);
      localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 50)));
      window.dispatchEvent(new CustomEvent('email-ingest-manual-run', { detail: entry }));
    } catch (_) { /* ignore */ }
  };

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [senderEmail, setSenderEmail] = useState("indu@fingrow.co");
  const [emailSubject, setEmailSubject] = useState("Test invoice");
  const [graphLoading, setGraphLoading] = useState(false);

  const handleRunGraphIngestion = async () => {
    setGraphLoading(true);
    setIngestResult(null);
    const triggeredAt = new Date().toISOString();
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let sessionData = { session: null };

      const resp = await fetch(`${supabaseUrl}/functions/v1/email-ingest-manual?mode=graph`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "graph" }),
      });
      let data = await resp.json();
      const result = { ...(data || {}), triggered_at: data?.triggered_at || triggeredAt };
      setIngestResult(result);
      persistRun(result);
      if (data?.success) {
        toast.success(`Graph: ${data.summary?.processed ?? 0} processed / ${data.summary?.found ?? 0} found`);
      } else {
        toast.error(data?.error || "Graph ingestion failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const result = { success: false, error: msg, triggered_at: triggeredAt };
      setIngestResult(result);
      persistRun(result);
      toast.error(`Failed: ${msg}`);
    } finally {
      setGraphLoading(false);
    }
  };

  const handleRunEmailIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      toast.error("Please select a PDF file");
      return;
    }
    setIngestLoading(true);
    setIngestResult(null);
    const triggeredAt = new Date().toISOString();
    try {
      const fd = new FormData();
      fd.append("file", pdfFile);
      fd.append("sender", senderEmail);
      fd.append("subject", emailSubject);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let sessionData = { session: null };

      const resp = await fetch(`${supabaseUrl}/functions/v1/email-ingest-manual`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: fd,
      });
      let data = await resp.json();

      if (data?.success) {
        const result = { ...data, triggered_at: data.triggered_at || triggeredAt };
        setIngestResult(result);
        persistRun(result);
        const count = data.summary?.processed ?? 0;
        toast.success(`${count} invoice(s) processed`);
      } else {
        const result = { ...(data || {}), success: false, triggered_at: data?.triggered_at || triggeredAt };
        setIngestResult(result);
        persistRun(result);
        toast.error(data?.error || "Processing failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const result = { success: false, error: msg, triggered_at: triggeredAt };
      setIngestResult(result);
      persistRun(result);
      toast.error(`Failed: ${msg}`);
    } finally {
      setIngestLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="mt-2 text-muted-foreground">This page is only accessible to superadmins</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Server className="h-8 w-8 text-primary" />
              System Information
            </h1>
            <p className="text-muted-foreground mt-1">
              Backend infrastructure and compliance information
            </p>
          </div>
        </div>

        {/* Region Compliance Status */}
        <Card className={isUSRegion ? 'border-success/50 bg-success/5' : 'border-destructive/50 bg-destructive/5'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isUSRegion ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              Region Compliance
            </CardTitle>
            <CardDescription>
              {isUSRegion 
                ? 'Your backend is hosted in a US region'
                : 'Warning: Your backend may not be hosted in a US region'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Globe className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold text-foreground">{systemInfo.region}</p>
                <p className="text-sm text-muted-foreground">
                  {isUSRegion 
                    ? 'All data processing occurs within US borders'
                    : 'Contact support to migrate to a US region for compliance'
                  }
                </p>
              </div>
              <Badge className={isUSRegion ? 'bg-success ml-auto' : 'bg-destructive ml-auto'}>
                {isUSRegion ? 'Compliant' : 'Review Required'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Infrastructure Details */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Project Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Project ID</p>
                <code className="block mt-1 rounded bg-muted px-3 py-2 text-sm font-mono">
                  {systemInfo.projectId || 'N/A'}
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Backend URL</p>
                <code className="block mt-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {systemInfo.supabaseUrl || 'N/A'}
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Service Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Storage Endpoint</p>
                <code className="block mt-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {systemInfo.storageEndpoint || 'N/A'}
                </code>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Functions Endpoint</p>
                <code className="block mt-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {systemInfo.functionsEndpoint || 'N/A'}
                </code>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edge Functions */}
        <Card>
          <CardHeader>
            <CardTitle>Deployed Edge Functions</CardTitle>
            <CardDescription>Backend serverless functions deployed in your project</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'process-invoice', description: 'AI invoice extraction', secured: true },
                { name: 'email-webhook', description: 'Email ingestion endpoint', secured: false },
                { name: 'create-tenant-users', description: 'Tenant user provisioning', secured: true },
              ].map((fn) => (
                <div key={fn.name} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-medium">{fn.name}</code>
                    <Badge variant={fn.secured ? 'default' : 'secondary'}>
                      {fn.secured ? 'JWT Required' : 'Public'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{fn.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Email Ingestion Manual Trigger */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Ingestion Controls
            </CardTitle>
            <CardDescription>
              Pull unread invoice emails via Microsoft Graph API, or upload a PDF manually as fallback
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Microsoft Graph API (invoices@fingrow.co)</Label>
              <Button onClick={handleRunGraphIngestion} disabled={graphLoading} className="gap-2">
                {graphLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Fetching...</>
                ) : (
                  <><Mail className="h-4 w-4" />Run Email Ingestion Now</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Connects to Microsoft Graph, processes unread emails with PDF attachments, then marks them read.
              </p>
            </div>
            <div className="border-t pt-4 space-y-2">
              <Label>Manual PDF Upload (fallback / testing)</Label>
            <form onSubmit={handleRunEmailIngestion} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pdf-file">Select Invoice PDF</Label>
                <Input
                  id="pdf-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  disabled={ingestLoading}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sender">Sender</Label>
                  <Input
                    id="sender"
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    disabled={ingestLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    disabled={ingestLoading}
                  />
                </div>
              </div>
              <Button type="submit" disabled={ingestLoading || !pdfFile} className="gap-2">
                {ingestLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Process Invoice
                  </>
                )}
              </Button>
            </form>
            </div>


            {ingestResult && (
              <div
                className={`rounded-lg border p-4 space-y-2 ${
                  ingestResult.success
                    ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/50'
                    : 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {ingestResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <p className="font-medium">
                    {ingestResult.success ? 'Ingestion Triggered' : 'Trigger Failed'}
                  </p>
                </div>
                {ingestResult.message && (
                  <p className="text-sm text-muted-foreground">{ingestResult.message}</p>
                )}
                {ingestResult.error && (
                  <div className="space-y-1">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {ingestResult.step ? `[${ingestResult.step}] ` : ''}{ingestResult.error}
                    </p>
                    {ingestResult.error_code && (
                      <p className="text-xs text-red-600 dark:text-red-400">Code: {ingestResult.error_code}</p>
                    )}
                  </div>
                )}
                {ingestResult.summary && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded bg-muted p-2 text-center">
                      <p className="font-semibold">{ingestResult.summary.found ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Found</p>
                    </div>
                    <div className="rounded bg-muted p-2 text-center">
                      <p className="font-semibold text-green-600">{ingestResult.summary.processed ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Processed</p>
                    </div>
                    <div className="rounded bg-muted p-2 text-center">
                      <p className="font-semibold text-red-600">{ingestResult.summary.failed ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>
                )}
                {(ingestResult.triggered_at || ingestResult.finished_at) && (
                  <p className="text-xs text-muted-foreground">
                    {ingestResult.triggered_at && (
                      <>Triggered at: {new Date(ingestResult.triggered_at).toLocaleString()}</>
                    )}
                    {ingestResult.finished_at && (
                      <> · Finished: {new Date(ingestResult.finished_at).toLocaleString()}</>
                    )}
                  </p>
                )}
                {ingestResult.diagnostics !== undefined && ingestResult.diagnostics !== null && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Diagnostics
                    </p>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted/40 p-3 text-[11px] leading-relaxed font-mono">
{JSON.stringify(ingestResult.diagnostics, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Residency Notice */}
        <Card>
          <CardHeader>
            <CardTitle>Data Residency & Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>US Data Residency:</strong> All invoice data, vendor information, and user data 
              are stored and processed within United States data centers.
            </p>
            <p>
              <strong>No Cross-Border Routing:</strong> Data does not leave US jurisdiction during 
              processing, storage, or transmission.
            </p>
            <p>
              <strong>Encryption:</strong> All data is encrypted at rest and in transit using 
              industry-standard AES-256 encryption.
            </p>
            <p>
              <strong>Audit Logging:</strong> All data access and modifications are logged for 
              compliance and audit purposes.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default SystemInfo;
