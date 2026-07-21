import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, Search, AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { erpApi } from "@/services/settings";
import { toast } from "sonner";
import { format } from "date-fns";

interface EmailLog {
  id: string;
  tenant_id: string | null;
  to_email: string;
  from_email: string;
  subject: string;
  status: string;
  attachment_count: number;
  error_message: string | null;
  metadata: any;
  created_at: string;
}

interface ManualRun {
  success: boolean;
  step?: string;
  error?: string;
  error_code?: string | null;
  summary?: { found?: number; processed?: number; failed?: number };
  triggered_at?: string;
  finished_at?: string;
}

export default function EmailRoutingDebugger() {
  const { isSuperAdmin } = useAuth();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [manualRuns, setManualRuns] = useState<ManualRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  const loadManualRuns = () => {
    try {
      const raw = localStorage.getItem('email_ingest_manual_runs');
      setManualRuns(raw ? JSON.parse(raw) : []);
    } catch { setManualRuns([]); }
  };

  const fetchLogs = async () => {
    if (!isSuperAdmin) return;

    try {
      setLoading(true);
      let data = await erpApi.emailLogs();
      let error = null;


      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching email logs:', err);
      toast.error('Failed to load email ingestion logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    loadManualRuns();
    const onRun = () => loadManualRuns();
    window.addEventListener('email-ingest-manual-run', onRun);
    window.addEventListener('storage', onRun);
    return () => {
      window.removeEventListener('email-ingest-manual-run', onRun);
      window.removeEventListener('storage', onRun);
    };
  }, [isSuperAdmin]);

  const filteredLogs = logs.filter(log =>
    log.to_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.from_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.subject?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      success: { variant: "default", icon: CheckCircle2 },
      failed: { variant: "destructive", icon: XCircle },
      partial: { variant: "secondary", icon: AlertCircle },
      pending: { variant: "outline", icon: RefreshCw },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  if (!isSuperAdmin) {
    return (
      <Layout>
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Access Denied
              </CardTitle>
              <CardDescription>
                This page is only accessible to superadmins.
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Email Routing Debugger</h1>
            <p className="text-muted-foreground">
              Monitor and debug email invoice ingestion across all tenants
            </p>
          </div>
          <Button onClick={fetchLogs} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Manual Ingestion Runs
            </CardTitle>
            <CardDescription>
              Results from "Run Email Ingestion Now" triggers (this browser)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manualRuns.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No manual runs recorded yet. Trigger one from System Info.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Found</TableHead>
                      <TableHead>Processed</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Step / Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualRuns.map((r, i) => {
                      const ts = r.triggered_at ? new Date(r.triggered_at) : null;
                      const valid = ts && !isNaN(ts.getTime());
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">
                            {valid ? format(ts!, 'MMM d, HH:mm:ss') : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.success ? 'default' : 'destructive'} className="gap-1">
                              {r.success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {r.success ? 'success' : 'failed'}
                            </Badge>
                          </TableCell>
                          <TableCell>{r.summary?.found ?? 0}</TableCell>
                          <TableCell>{r.summary?.processed ?? 0}</TableCell>
                          <TableCell>{r.summary?.failed ?? 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                            {r.error ? `[${r.step || 'error'}] ${r.error}${r.error_code ? ` (${r.error_code})` : ''}` : (r.step || '—')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Ingestion Logs
            </CardTitle>
            <CardDescription>
              Last 100 email ingestion attempts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email address or subject..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading email logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No email ingestion logs found
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Attachments</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.to_email}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.from_email}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {log.subject || '-'}
                        </TableCell>
                        <TableCell>{log.attachment_count}</TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedLog && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>Email Log Details</CardTitle>
              <CardDescription>
                Full information for ingestion attempt on {format(new Date(selectedLog.created_at), 'PPpp')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                  {getStatusBadge(selectedLog.status)}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Attachments</p>
                  <p>{selectedLog.attachment_count}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">To Email</p>
                  <p className="font-mono text-sm">{selectedLog.to_email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">From Email</p>
                  <p className="font-mono text-sm">{selectedLog.from_email}</p>
                </div>
              </div>

              {selectedLog.subject && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Subject</p>
                  <p>{selectedLog.subject}</p>
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">Error Message</p>
                  <p className="text-sm text-destructive">{selectedLog.error_message}</p>
                </div>
              )}

              {selectedLog.metadata && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Metadata</p>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <Button variant="outline" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}