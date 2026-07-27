import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge, RiskBadge } from "@/components/StatusBadge";
import { VariationDetailCard } from "@/components/VariationDetailCard";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { invoicesApi } from "@/services/invoices";
import { displayInvoiceNumber } from "@/lib/utils";
import { CanonicalInvoice, CanonicalInvoiceLineItem, CanonicalInvoiceAnomaly } from "@/types/invoice";
import { Loader2, CheckCircle, XCircle, AlertCircle, Send, ArrowLeft, MessageSquare, Clock, Info, FileOutput, RefreshCcw, Bot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InvoiceTimeline } from "@/components/InvoiceTimeline";
import { InvoiceNotes } from "@/components/InvoiceNotes";
import { VendorRiskSnapshot } from "@/components/VendorRiskSnapshot";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const formatDateOnly = (value?: string | null) => {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), 'MMM dd, yyyy');
  }
  return format(new Date(value), 'MMM dd, yyyy');
};

interface InvoiceWithVariation extends CanonicalInvoice {
  variationScore?: number | null;
  variationFlags?: string[] | null;
  isCritical?: boolean;
  autoRouted?: boolean;
  exportedAt?: string | null;
  exportBatchId?: string | null;
  erpStatus?: string | null;
  erpReferenceId?: string | null;
  erpLastSyncedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  senderEmail?: string | null;
  dueDateDefaulted?: boolean;
  dueDateDefaultSource?: string | null;
  transactionDate?: string | null;
  sourceTransactionDate?: string | null;
  taxFlagged?: boolean;
  taxFlagReason?: string | null;
  sanitizedFilename?: string | null;
  achRoutingNumber?: string | null;
  achAccountNumber?: string | null;
  badFileFlag?: boolean;
  badFileReason?: string | null;
  checkerComment?: string | null;
  anomalyCount?: number;
}

const InvoiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isMaker, canApprove } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceWithVariation | null>(null);
  const [vendorBaseline, setVendorBaseline] = useState<{ avg_invoice_amount?: number } | null>(null);
  const [lineItems, setLineItems] = useState<CanonicalInvoiceLineItem[]>([]);
  const [anomalies, setAnomalies] = useState<CanonicalInvoiceAnomaly[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchInvoiceDetails();

    // Realtime push replaced by polling.
    const timer = window.setInterval(() => fetchInvoiceDetails(), 15_000);
    return () => window.clearInterval(timer);
  
  }, [id]);

  const fetchInvoiceDetails = async () => {
    try {
      // Fetch invoice
      const detail = await invoicesApi.get(id!);
      const invoiceData: any = {
        ...detail,
        // Keyed on the name: the API falls back to the vendor recorded when the
        // invoice was validated, so removing the vendor from the list later
        // must not blank out the payee here.
        vendors: detail.vendor_name
          ? { id: detail.vendor_id ?? "", name: detail.vendor_name }
          : null,
      };
      const lineItemsData = (detail as any).line_items ?? [];
      const anomaliesData = (detail as any).invoice_anomalies ?? [];


      const invoiceWithVariation: InvoiceWithVariation = {
        id: invoiceData.id,
        tenantId: invoiceData.tenant_id,
        vendorId: invoiceData.vendor_id,
        poId: invoiceData.po_id,
        invoiceNumber: invoiceData.invoice_number,
        invoiceDate: invoiceData.invoice_date,
        dueDate: invoiceData.due_date,
        currency: invoiceData.currency,
        subtotalAmount: invoiceData.subtotal_amount,
        taxAmount: invoiceData.tax_amount,
        totalAmount: invoiceData.total_amount,
        status: invoiceData.status,
        source: invoiceData.source,
        anomalyScore: invoiceData.anomaly_score,
        riskLevel: invoiceData.risk_level,
        rawFilePath: invoiceData.raw_file_path,
        createdAt: invoiceData.created_at,
        updatedAt: invoiceData.updated_at,
        vendor: invoiceData.vendors ? {
          id: invoiceData.vendors.id,
          name: invoiceData.vendors.name,
        } : undefined,
        variationScore: invoiceData.variation_score,
        variationFlags: invoiceData.variation_flags,
        anomalyCount: (anomaliesData || []).length,
        isCritical: invoiceData.is_critical,
        autoRouted: invoiceData.auto_routed,
        exportedAt: invoiceData.exported_at,
        exportBatchId: invoiceData.export_batch_id,
        erpStatus: invoiceData.erp_status,
        erpReferenceId: invoiceData.erp_reference_id,
        erpLastSyncedAt: invoiceData.erp_last_synced_at,
        approvedBy: invoiceData.approved_by,
        approvedAt: invoiceData.approved_at,
        senderEmail: invoiceData.sender_email,
        dueDateDefaulted: invoiceData.due_date_defaulted ?? false,
        dueDateDefaultSource: invoiceData.due_date_default_source ?? null,
        transactionDate: invoiceData.transaction_date ?? null,
        sourceTransactionDate: invoiceData.source_transaction_date ?? null,
        taxFlagged: invoiceData.tax_flagged ?? false,
        taxFlagReason: invoiceData.tax_flag_reason ?? null,
        sanitizedFilename: (invoiceData as any).sanitized_filename ?? null,
        achRoutingNumber: (invoiceData as any).ach_routing_number ?? null,
        achAccountNumber: (invoiceData as any).ach_account_number ?? null,
        badFileFlag: (invoiceData as any).bad_file_flag ?? false,
        badFileReason: (invoiceData as any).bad_file_reason ?? null,
        checkerComment: (invoiceData as any).checker_comment ?? null,
      };

      setInvoice(invoiceWithVariation);
      

      // Fetch vendor baseline for comparison
      if (invoiceData.vendor_id) {
        // vendor_baselines is part of the analytics subsystem, not yet ported.
        const baselineData = null;
        
        setVendorBaseline(baselineData);
      }

      const mappedLineItems: CanonicalInvoiceLineItem[] = (lineItemsData || []).map(item => ({
        id: item.id,
        lineNumber: item.line_number,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
        glCode: item.gl_code,
        costCenter: item.cost_center,
        taxCode: item.tax_code,
        isFlagged: item.is_flagged,
      }));

      const mappedAnomalies: CanonicalInvoiceAnomaly[] = (anomaliesData || []).map(anomaly => ({
        id: anomaly.id,
        code: anomaly.code,
        severity: anomaly.severity,
        fieldName: anomaly.field_name,
        message: anomaly.message,
        createdAt: anomaly.created_at,
        resolvedBy: anomaly.resolved_by,
        resolvedAt: anomaly.resolved_at,
        resolutionNote: anomaly.resolution_note,
      }));

      const vendorName = invoiceData.vendors?.name || 'Unknown';
      if (vendorName === 'Bethesda Cloud Services' || vendorName === 'Capitol Hill Courier') {
        console.log('[VariationBadge Debug][InvoiceDetail]', {
          vendor: vendorName,
          invoice_number: invoiceData.invoice_number,
          variation_flags: invoiceData.variation_flags,
          anomaly_count: mappedAnomalies.length,
          anomalies: mappedAnomalies,
        });
      }

      setLineItems(mappedLineItems);
      setAnomalies(mappedAnomalies);
    } catch (error) {
      console.error('Error fetching invoice:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load invoice details",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Maker submits for review
  const handleSubmitForReview = async () => {
    if (!invoice || !user) return;
    setIsProcessing(true);

    try {
      await invoicesApi.submitForApproval(invoice.id);

      // Log audit
      // Audit is written server-side in the same transaction.

      toast({
        title: "Submitted for review",
        description: "Invoice has been sent to Checker for approval",
      });

      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit invoice",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Checker approves
  const handleApprove = async () => {
    if (!invoice || !user) return;
    setIsProcessing(true);

    try {
      await invoicesApi.approve(invoice.id);

      // Log audit
      // Audit is written server-side in the same transaction.

      toast({
        title: "Invoice approved",
        description: "Invoice has been approved and queued for export",
      });

      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve invoice",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Checker rejects with comment
  const handleReject = async () => {
    if (!invoice || !user) return;
    setIsProcessing(true);

    try {
      await invoicesApi.decline(invoice.id, rejectComment || 'Declined by reviewer');

      // Log audit
      // Audit is written server-side in the same transaction.

      toast({
        title: "Invoice rejected",
        description: "Invoice has been rejected",
      });

      setRejectDialogOpen(false);
      setRejectComment("");
      fetchInvoiceDetails();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reject invoice",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine what actions are available based on role and status
  const isAIApproved = invoice?.status === 'approved' && invoice?.approvedBy === 'system';
  const canSubmit = isMaker && ['draft', 'ingested', 'validated', 'exception'].includes(invoice?.status || '');
  const canApproveOrReject = canApprove && ['submitted', 'validated', 'exception'].includes(invoice?.status || '') && !isAIApproved;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <div className="text-center">
          <h2 className="text-2xl font-bold">Invoice not found</h2>
          <Button onClick={() => navigate('/invoices')} className="mt-4">
            Back to Invoices
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="invoice-detail-page max-w-full space-y-6 overflow-x-hidden box-border [&>*]:max-w-full [&>*]:overflow-x-hidden [&>*]:box-border">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-bold tracking-tight text-foreground">
                Invoice {displayInvoiceNumber(invoice.invoiceNumber)}
              </h1>
              <p className="mt-1 break-words text-muted-foreground">
                {invoice.vendor?.name || 'Unknown Vendor'}
              </p>
            </div>
          </div>
          <div className="flex max-w-full flex-wrap gap-2 lg:justify-end">
            {/* Maker Actions */}
            {canSubmit && (
              <Button
                onClick={handleSubmitForReview}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit for Review
              </Button>
            )}
            
            {/* Checker Actions */}
            {canApproveOrReject && (
              <>
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="flex items-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={isProcessing}
                  className="flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status Banner */}
        {invoice.status === 'submitted' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="font-medium text-blue-700 dark:text-blue-300">
                Awaiting Checker Review
              </span>
            </div>
            <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
              This invoice has been submitted and is waiting for approval.
            </p>
          </div>
        )}

        {/* AI-Approved Banner */}
        {isAIApproved && (
          <TooltipProvider>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    Approved Automatically by AI
                  </span>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-emerald-500" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>This invoice was approved automatically due to high confidence score and clean risk profile from a verified vendor.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Badge className="bg-emerald-500 text-white">
                  <Bot className="mr-1 h-3 w-3" />
                  AI-Approved
                </Badge>
              </div>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                No manual review required. This invoice has been routed directly to export.
              </p>
            </div>
          </TooltipProvider>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-none lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="min-w-0 max-w-full overflow-x-hidden box-border">
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.taxFlagged && (
                <div style={{
                  backgroundColor: '#FFF3CD',
                  border: '1px solid #FFC107',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  marginBottom: '16px'
                }}>
                  <p style={{ fontWeight: 'bold', color: '#B45309', margin: '0 0 4px 0', fontSize: '14px' }}>
                    ⚠ TAX FLAGGED — Manual Review Required
                  </p>
                  <p style={{ color: '#92400E', margin: 0, fontSize: '13px' }}>
                    {invoice.taxFlagReason}
                  </p>
                </div>
              )}
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <StatusBadge status={invoice.status} className="mt-1" />
                </div>
                {!["approved", "rejected"].includes(invoice.status?.toLowerCase() ?? "") && (
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Risk Level</p>
                    <RiskBadge level={invoice.riskLevel} className="mt-1" />
                  </div>
                )}
                {invoice.status?.toLowerCase() === 'rejected' && invoice.checkerComment && (
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">Decline Reason</p>
                    <p className="text-foreground mt-1">{invoice.checkerComment}</p>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Invoice Date</p>
                  <p className="text-foreground">{formatDateOnly(invoice.invoiceDate)}</p>
                </div>
                {invoice.dueDate && (
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-foreground">{formatDateOnly(invoice.dueDate)}</p>
                      {invoice.dueDateDefaulted && (
                        <Badge className="bg-yellow-100 text-yellow-900 border-yellow-300 hover:bg-yellow-100">
                          Defaulted — calculated from {invoice.dueDateDefaultSource === 'email_received_at' ? 'email receipt date' : invoice.dueDateDefaultSource === 'processing_date' ? 'processing date' : 'invoice date'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Transaction Date</p>
                  <p className="text-foreground">{formatDateOnly(invoice.transactionDate)}</p>
                </div>
                {invoice.sourceTransactionDate && (
                  <div className="field-row min-w-0" style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                      Source Document Date
                    </span>
                    <span style={{ fontSize: '13px', color: '#9CA3AF', fontStyle: 'italic' }}>
                      {invoice.sourceTransactionDate}
                    </span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginTop: '2px' }}>
                      Note only — not used for processing
                    </span>
                  </div>
                )}
                {invoice.sanitizedFilename && (
                  <div className="field-row min-w-0" style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                      System Filename
                    </span>
                    <span className="block max-w-full" style={{ fontSize: '13px', fontFamily: 'monospace', color: '#374151', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {invoice.sanitizedFilename}
                    </span>
                  </div>
                )}
                {invoice.achRoutingNumber && (
                  <div className="field-row min-w-0" style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                      ACH Routing #
                    </span>
                    <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                      {invoice.achRoutingNumber}
                    </span>
                  </div>
                )}
                {invoice.achAccountNumber && (
                  <div className="field-row min-w-0" style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                      ACH Account #
                    </span>
                    <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                      {invoice.achAccountNumber}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Currency</p>
                  <p className="text-foreground">{invoice.currency}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Source</p>
                  <Badge variant="outline">{invoice.source}</Badge>
                </div>
                {invoice.senderEmail && (
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">Received From</p>
                    <p className="break-all text-sm text-foreground">{invoice.senderEmail}</p>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Exported</p>
                  {invoice.exportedAt ? (
                    <div className="space-y-1 mt-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-500">
                          <FileOutput className="mr-1 h-3 w-3" />
                          Yes
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(invoice.exportedAt), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="mt-1">No</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 max-w-full overflow-x-hidden box-border">
            <CardHeader>
              <CardTitle>Amount Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="min-w-0 break-all text-right font-medium text-foreground">
                  {invoice.currency} {(invoice.subtotalAmount ?? invoice.totalAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {invoice.taxAmount != null && (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-4">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="min-w-0 break-all text-right font-medium text-foreground">
                    {invoice.currency} {invoice.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <Separator />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-4">
                <span className="text-lg font-semibold text-foreground">Total</span>
                <span className="min-w-0 break-all text-right text-lg font-bold text-primary">
                  {invoice.currency} {(invoice.totalAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ERP Sync Status Card */}
        {(invoice.exportedAt || invoice.erpStatus !== 'none') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCcw className="h-5 w-5" />
                ERP Sync Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ERP Status</p>
                  <Badge 
                    className={`mt-1 ${
                      invoice.erpStatus === 'paid' ? 'bg-purple-500' :
                      invoice.erpStatus === 'posted' ? 'bg-emerald-500' :
                      invoice.erpStatus === 'accepted' ? 'bg-green-500' :
                      invoice.erpStatus === 'delivered' ? 'bg-blue-500' :
                      invoice.erpStatus === 'rejected' ? 'bg-destructive' :
                      ''
                    }`}
                    variant={invoice.erpStatus === 'none' ? 'outline' : 'default'}
                  >
                    {invoice.erpStatus || 'None'}
                  </Badge>
                </div>
                {invoice.erpReferenceId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ERP Reference ID</p>
                    <p className="text-foreground font-mono text-sm mt-1">{invoice.erpReferenceId}</p>
                  </div>
                )}
                {invoice.erpLastSyncedAt && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Last Synced</p>
                    <p className="text-foreground text-sm mt-1">
                      {format(new Date(invoice.erpLastSyncedAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Actions</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mt-1"
                    onClick={() => navigate('/reconciliation/events')}
                  >
                    View Reconciliation Events →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Variation Analysis & Vendor Risk - full width stacked.
            Hidden once an invoice is settled (approved or declined): these
            pre-decision risk signals are no longer actionable. */}
        {!["approved", "rejected"].includes(invoice.status?.toLowerCase() ?? "") && (
          <div className="space-y-6">
            <VariationDetailCard
              variationScore={invoice.variationScore}
              variationFlags={invoice.variationFlags}
              anomalyCount={invoice.anomalyCount ?? anomalies.length}
              anomalies={anomalies}
              isCritical={invoice.isCritical}
              autoRouted={invoice.autoRouted}
              baselineComparison={vendorBaseline?.avg_invoice_amount ? {
                currentAmount: invoice.totalAmount,
                avgAmount: vendorBaseline.avg_invoice_amount,
                percentDiff: vendorBaseline.avg_invoice_amount > 0
                  ? ((invoice.totalAmount - vendorBaseline.avg_invoice_amount) / vendorBaseline.avg_invoice_amount) * 100
                  : undefined,
              } : undefined}
            />
            <VendorRiskSnapshot
              vendorId={invoice.vendorId}
              vendorName={invoice.vendor?.name}
            />
          </div>
        )}

        {anomalies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-warning" />
                Anomalies Detected ({anomalies.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {anomalies.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {invoice?.status !== 'approved' && (
                          <Badge
                            className={
                              anomaly.severity === 'high'
                                ? 'bg-risk-high text-white'
                                : anomaly.severity === 'medium'
                                ? 'bg-risk-medium text-white'
                                : 'bg-risk-low text-white'
                            }
                          >
                            {anomaly.severity}
                          </Badge>
                          )}
                          <span className="font-mono text-sm text-muted-foreground">
                            {anomaly.code}
                          </span>
                        </div>
                        <p className="mt-2 text-foreground">{anomaly.message}</p>
                        {anomaly.fieldName && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Field: {anomaly.fieldName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {lineItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Line Items ({lineItems.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.lineNumber}</TableCell>
                      <TableCell>{item.description || '-'}</TableCell>
                      <TableCell className="text-right">{item.quantity || '-'}</TableCell>
                      <TableCell className="text-right">
                        {item.unitPrice ? `${invoice.currency} ${item.unitPrice}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {item.lineTotal ? `${invoice.currency} ${item.lineTotal}` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Invoice Lifecycle Timeline */}
        <Card>
          <CardContent className="pt-6">
            <InvoiceTimeline invoiceId={invoice.id} />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-6">
            <InvoiceNotes invoiceId={invoice.id} />
          </CardContent>
        </Card>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Reject Invoice
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Please provide a reason for rejecting this invoice. This comment will be visible to the Maker.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reject-comment">Rejection Reason</Label>
                <Textarea
                  id="reject-comment"
                  placeholder="Enter reason for rejection..."
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reject Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default InvoiceDetail;
