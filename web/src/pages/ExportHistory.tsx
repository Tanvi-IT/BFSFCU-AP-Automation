import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { erpApi } from "@/services/settings";
import { invoicesApi } from "@/services";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, History, AlertCircle, CheckCircle, XCircle, Clock, Play } from "lucide-react";
import { format } from "date-fns";
import { PrologueExportCard } from "@/components/PrologueExportCard";

interface ExportRecord {
  id: string;
  tenant_id: string;
  erp_system: string;
  export_format: string;
  delivery_method: string;
  invoice_ids: string[];
  file_url: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  push_status: string | null;
  push_attempts: number | null;
  push_last_error: string | null;
  push_last_attempt_at: string | null;
}

interface TenantERPSettings {
  erp_system: string | null;
  export_format: string | null;
}

const ExportHistory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, isAdmin, isChecker, tenantId, loading: authLoading } = useAuth();

  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualExportDialog, setShowManualExportDialog] = useState(false);
  const [pendingInvoiceCount, setPendingInvoiceCount] = useState(0);
  const [erpSettings, setErpSettings] = useState<TenantERPSettings | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportTime, setLastExportTime] = useState<string | null>(null);

  // Check access - Superadmin, Admin, or Checker
  const hasAccess = isSuperAdmin || isAdmin || isChecker;
  // Only Admin and Superadmin can run manual exports
  const canRunManualExport = isSuperAdmin || isAdmin;

  useEffect(() => {
    if (!authLoading && !hasAccess) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You don't have permission to view export history.",
      });
      navigate("/dashboard");
    }
  }, [hasAccess, authLoading, navigate, toast]);

  useEffect(() => {
    if (hasAccess && !authLoading) {
      fetchExports();
      if (canRunManualExport && tenantId) {
        fetchPendingInvoices();
        fetchERPSettings();
      }
    }
  }, [hasAccess, authLoading, tenantId]);

  const fetchExports = async () => {
    try {
      // Was a leftover Supabase query builder: `let query: any = null` followed
      // by query.eq('tenant_id', ...) — it threw before ever calling the API.
      // Single-tenant, so there is no tenant filter to apply.
      const data = await erpApi.exportHistory();

      setExports((data || []) as ExportRecord[]);

      // Set last export time
      if (data && data.length > 0) {
        setLastExportTime(data[0].created_at);
      }
    } catch (error) {
      console.error('[ExportHistory] Error fetching exports:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load export history.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Invoices approved and waiting to be exported.
   *
   * The bulk port pointed this at erpApi.exportHistory() — export history, not
   * pending invoices — so the count was whatever the history length happened
   * to be.
   */
  const fetchPendingInvoices = async () => {
    try {
      const rows = await invoicesApi.list({ status: "approved", limit: 1000 });
      setPendingInvoiceCount(rows?.length ?? 0);
    } catch (error) {
      console.error('[ExportHistory] Error fetching pending invoices:', error);
    }
  };

  /** Also mis-pointed at exportHistory() by the bulk port. */
  const fetchERPSettings = async () => {
    try {
      const connectors = await erpApi.connectors();
      setErpSettings(connectors?.[0] ?? null);
    } catch (error) {
      console.error('[ExportHistory] Error fetching ERP settings:', error);
    }
  };

  const handleManualExport = async () => {
    if (!tenantId || pendingInvoiceCount === 0) return;
    
    setIsExporting(true);
    try {
      let data = null;
      let error = new Error('Scheduled export is not available yet in the Azure build.');


      if (error) throw error;

      toast({
        title: "Export Complete",
        description: `Successfully exported ${data?.invoiceCount || pendingInvoiceCount} invoices.`,
      });

      setShowManualExportDialog(false);
      fetchExports();
      fetchPendingInvoices();
    } catch (error: any) {
      console.error('[ExportHistory] Manual export error:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "Failed to run manual export.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = async (fileUrl: string | null) => {
    if (!fileUrl) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No file available for download.",
      });
      return;
    }

    try {
      let data = null;
      let error = new Error('Export file download is not available yet in the Azure build.');


      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileUrl.split('/').pop() || 'export';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: "Your export file is downloading.",
      });
    } catch (error: any) {
      console.error('[ExportHistory] Download error:', error);
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error.message || "Failed to download file.",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="mr-1 h-3 w-3" />
            Success
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">
            <AlertCircle className="mr-1 h-3 w-3" />
            Partial
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDeliveryMethodLabel = (method: string) => {
    switch (method) {
      case 'manual':
        return 'Manual Download';
      case 'email':
        return 'Email';
      case 'sftp':
        return 'SFTP';
      case 'api':
        return 'API';
      default:
        return method;
    }
  };

  const getPushStatusBadge = (pushStatus: string | null) => {
    if (!pushStatus) return null;
    switch (pushStatus) {
      case 'success':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle className="mr-1 h-3 w-3" />
            Delivered
          </Badge>
        );
      case 'retrying':
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">
            <Clock className="mr-1 h-3 w-3" />
            Retrying
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{pushStatus}</Badge>;
    }
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <History className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Export History</h1>
              <p className="text-muted-foreground mt-1">
                View scheduled and manual ERP export history
              </p>
            </div>
          </div>
          
          {canRunManualExport && (
            <Button onClick={() => setShowManualExportDialog(true)} disabled={pendingInvoiceCount === 0}>
              <Play className="h-4 w-4 mr-2" />
              Run Manual Export
              {pendingInvoiceCount > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingInvoiceCount}</Badge>
              )}
            </Button>
          )}
        </div>

        <PrologueExportCard />



        <Card>
          <CardHeader>
            <CardTitle>Recent Exports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {exports.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <History className="mx-auto h-12 w-12 opacity-30 mb-4" />
                <p>No export history found</p>
                <p className="text-sm mt-1">Scheduled exports will appear here once configured</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>ERP System</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Invoices</TableHead>
                    <TableHead>Export Status</TableHead>
                    <TableHead>Push Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(record.created_at), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>{record.erp_system}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {record.export_format}
                        </Badge>
                      </TableCell>
                      <TableCell>{getDeliveryMethodLabel(record.delivery_method)}</TableCell>
                      <TableCell>{record.invoice_ids?.length || 0}</TableCell>
                      <TableCell>
                        {getStatusBadge(record.status)}
                        {record.error_message && (
                          <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={record.error_message}>
                            {record.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.delivery_method === 'api' ? (
                          <>
                            {getPushStatusBadge(record.push_status)}
                            {record.push_last_error && (
                              <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={record.push_last_error}>
                                {record.push_last_error}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.delivery_method === 'api' ? (
                          <span className="font-mono text-sm">{record.push_attempts || 0}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.file_url && record.status === 'success' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(record.file_url)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-start gap-3 text-muted-foreground">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">About Scheduled Exports</p>
                <p className="mt-1">
                  Scheduled exports run automatically every hour for tenants with automated delivery configured.
                  Only approved invoices that haven't been previously exported are included.
                </p>
                <p className="mt-2">
                  To configure automated exports, go to{' '}
                  <Button variant="link" className="h-auto p-0" onClick={() => navigate('/settings/erp')}>
                    ERP Integration Settings
                  </Button>
                  .
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Export Dialog */}
      <Dialog open={showManualExportDialog} onOpenChange={setShowManualExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Manual Export</DialogTitle>
            <DialogDescription>
              Export all approved invoices that haven't been exported yet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Invoices to Export</p>
                <p className="text-2xl font-bold">{pendingInvoiceCount}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Last Export</p>
                <p className="text-sm font-medium">
                  {lastExportTime 
                    ? format(new Date(lastExportTime), 'MMM dd, yyyy HH:mm')
                    : 'Never'
                  }
                </p>
              </div>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">ERP Format</p>
              <p className="font-medium">
                {erpSettings?.erp_system || 'Not configured'} 
                {erpSettings?.export_format && ` (${erpSettings.export_format.toUpperCase()})`}
              </p>
            </div>
            {!erpSettings?.erp_system && (
              <p className="text-sm text-yellow-600">
                Please configure your ERP settings before running an export.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualExportDialog(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button 
              onClick={handleManualExport} 
              disabled={isExporting || pendingInvoiceCount === 0 || !erpSettings?.erp_system}
            >
              {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Export {pendingInvoiceCount} Invoices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ExportHistory;