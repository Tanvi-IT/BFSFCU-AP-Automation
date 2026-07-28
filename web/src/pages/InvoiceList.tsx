import { useEffect, useState } from "react";
import { displayInvoiceNumber } from "@/lib/utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, RiskBadge } from "@/components/StatusBadge";
import { VariationBadge } from "@/components/VariationBadge";
import { invoicesApi } from "@/services/invoices";
import {
  DateRangePresetFilter,
  presetToRange,
  DEFAULT_DATE_PRESET,
  type DatePreset,
} from "@/components/DateRangePresetFilter";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CanonicalInvoice, InvoiceStatus, RiskLevel } from "@/types/invoice";
import { Loader2, Upload, Search, Eye, CheckSquare, FileText, Mail, HardDriveUpload, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SourceBadge = ({ source }: { source?: string | null }) => {
  if (source === 'email') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Mail className="h-3 w-3" /> Email
      </Badge>
    );
  }
  if (source === 'api') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Zap className="h-3 w-3" /> API
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <HardDriveUpload className="h-3 w-3" /> Upload
    </Badge>
  );
};
import { format } from "date-fns";

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
  dueDateDefaulted?: boolean;
  dueDateDefaultSource?: string | null;
  taxFlagged?: boolean;
  taxFlagReason?: string | null;
  badFileFlag?: boolean;
  badFileReason?: string | null;
  approvedAt?: string | null;
  transactionDate?: string | null;
  sanitizedFilename?: string | null;
  achRoutingNumber?: string | null;
  achAccountNumber?: string | null;
  anomalyCount?: number;
}

const InvoiceList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canApprove, tenantId, user } = useAuth();
  
  const [searchParams, setSearchParams] = useSearchParams();
  // This page exists only as the Approved view (sidebar → Approved). Landing on
  // it with no status must not expose an all-status list, so default to approved.
  const initialStatus = searchParams.get("status") || "approved";
  
  const [invoices, setInvoices] = useState<InvoiceWithVariation[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceWithVariation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [taxFlagFilter, setTaxFlagFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
  const dateRange = presetToRange(datePreset);

  // The sidebar's "Approved" entry is this page at ?status=approved. It is a
  // historical record rather than a working list, so it gets a search box and a
  // date range instead of the queue-triage filters.
  const isApprovedView = statusFilter === "approved";
  
  // Batch approval state
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  
  // Invoice preview state
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceWithVariation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 25;

  // Debounced so typing a vendor name issues one query, not one per keystroke.
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setAppliedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // Any filter that is applied IN the query invalidates the accumulated pages,
  // so it resets to page 0 and fetches explicitly. Passing the page number in
  // rather than reading it from state avoids the race where this effect and the
  // page effect below both fire on the same commit — one of them with a stale
  // page — and the late response appends rows from the previous filter.
  useEffect(() => {
    setPage(0);
    fetchInvoices(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, appliedSearch, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (page > 0) fetchInvoices(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    // No status in the URL → force the Approved view (and reflect it in the URL)
    // so /invoices is never the bare all-status page.
    if (!searchParams.get("status")) {
      setSearchParams({ status: "approved" }, { replace: true });
      setStatusFilter("approved");
      return;
    }
    setStatusFilter(searchParams.get("status") as string);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    applyFilters();
  }, [invoices, searchQuery, statusFilter, riskFilter, dueDateFilter, taxFlagFilter]);

  const fetchInvoices = async (pageNum: number = page) => {
    try {
      // Item 24 fix: apply the active status filter IN the query, not client-side after
      // pagination. Previously .range() sliced the full mixed-status set first, so with many
      // validated/exception rows only a few approved ones landed in the first page — the rest
      // hid behind "Load More" even though the total was under PAGE_SIZE. Filtering in the
      // query means .range(0,24) returns the first 25 rows OF THE SELECTED STATUS.
      // RLS still scopes by tenant, so email-ingested invoices are included.
      //
      // On the Approved view the search text and date range go into the query
      // too, against `approved_at` — the "Approved Date" column. Filtering the
      // returned page in the browser would only search the rows already loaded,
      // which defeats the point of a historical view.
      const rowsRaw = await invoicesApi.list({
        ...(statusFilter !== 'all' ? { status: statusFilter as any } : {}),
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
        ...(isApprovedView
          ? {
              dateField: 'approved_at' as const,
              // Newest-approved-first, matching the server order and every queue.
              order: 'desc' as const,
              ...(appliedSearch ? { search: appliedSearch } : {}),
              ...(dateRange.from ? { dateFrom: dateRange.from } : {}),
              ...(dateRange.to ? { dateTo: dateRange.to } : {}),
            }
          : {}),
      });
      // Approved view sorts by approval time; other views by creation time.
      const sortColumn = statusFilter === 'approved' ? 'approved_at' : 'created_at';
      const data = [...rowsRaw]
        .sort((a, b) => {
          const av = new Date(String(a[sortColumn] ?? a.created_at)).getTime();
          const bv = new Date(String(b[sortColumn] ?? b.created_at)).getTime();
          // Every view is newest-first (approved view by approval time, others by
          // creation time).
          return bv - av;
        })
        .map((r) => ({
          ...r,
          // Keyed on the name, not on vendor_id: the API already falls back to
          // the name captured at validation, so an invoice whose vendor has
          // since been removed from the list still shows who it was for.
          vendors: r.vendor_name ? { id: r.vendor_id ?? "", name: r.vendor_name } : null,
        }));


      const mapped: InvoiceWithVariation[] = (data || []).map((inv: any) => {
        const anomalyCount = Array.isArray((inv as any).invoice_anomalies)
          ? (inv as any).invoice_anomalies.length
          : 0;
        const vendorName = inv.vendors?.name || 'Unknown';
        if (vendorName === 'Bethesda Cloud Services' || vendorName === 'Capitol Hill Courier') {
          console.log('[VariationBadge Debug][InvoiceList]', {
            vendor: vendorName,
            invoice_number: inv.invoice_number,
            variation_flags: inv.variation_flags,
            anomaly_count: anomalyCount,
            anomalies: (inv as any).invoice_anomalies ?? [],
          });
        }

        return {
          id: inv.id,
          tenantId: String(inv.tenant_id ?? ''),
          vendorId: inv.vendor_id,
          poId: inv.po_id,
          invoiceNumber: inv.invoice_number,
          invoiceDate: inv.invoice_date,
          dueDate: inv.due_date,
          currency: inv.currency,
          subtotalAmount: inv.subtotal_amount,
          taxAmount: inv.tax_amount,
          totalAmount: inv.total_amount,
          status: inv.status as InvoiceStatus,
          source: inv.source,
          anomalyScore: inv.anomaly_score,
          riskLevel: inv.risk_level as RiskLevel,
          rawFilePath: inv.raw_file_path,
          createdAt: inv.created_at,
          updatedAt: inv.updated_at,
          vendor: inv.vendors ? {
            id: inv.vendors.id,
            name: inv.vendors.name,
          } : undefined,
          variationScore: inv.variation_score,
          variationFlags: inv.variation_flags,
          isCritical: inv.is_critical,
          autoRouted: inv.auto_routed,
          dueDateDefaulted: inv.due_date_defaulted ?? false,
          dueDateDefaultSource: inv.due_date_default_source ?? null,
          taxFlagged: inv.tax_flagged ?? false,
          taxFlagReason: inv.tax_flag_reason ?? null,
          badFileFlag: inv.bad_file_flag ?? false,
          badFileReason: inv.bad_file_reason ?? null,
          approvedAt: inv.approved_at ?? null,
          transactionDate: inv.transaction_date ?? null,
          sanitizedFilename: inv.sanitized_filename ?? null,
          achRoutingNumber: inv.ach_routing_number ?? null,
          achAccountNumber: inv.ach_account_number ?? null,
          anomalyCount,
        };
      });

      setInvoices(prev => pageNum === 0 ? mapped : [...prev, ...mapped]);
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (error) {
      console.error('[InvoiceList] Error fetching invoices:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...invoices];

    // On the Approved view the server already applied the search across the
    // whole history. Re-filtering here would narrow it back down to whatever
    // subset happens to be loaded.
    if (searchQuery && !isApprovedView) {
      filtered = filtered.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.vendor?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    if (riskFilter !== "all") {
      filtered = filtered.filter(inv => inv.riskLevel === riskFilter);
    }

    if (dueDateFilter === "defaulted") {
      filtered = filtered.filter(inv => inv.dueDateDefaulted === true);
    }

    if (taxFlagFilter === "flagged") {
      filtered = filtered.filter(inv => inv.taxFlagged === true);
    }

    setFilteredInvoices(filtered);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === filteredInvoices.filter(inv => inv.status === 'submitted' || inv.status === 'validated').length) {
      setSelectedInvoices(new Set());
    } else {
      const approvable = filteredInvoices
        .filter(inv => inv.status === 'submitted' || inv.status === 'validated')
        .map(inv => inv.id);
      setSelectedInvoices(new Set(approvable));
    }
  };

  const toggleSelectInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const handleBatchApprove = async () => {
    if (selectedInvoices.size === 0) return;
    
    setIsApproving(true);
    try {
      const ids = Array.from(selectedInvoices);

      // Block batch approval if any selected invoice is tax flagged
      const selectedFlagged = invoices.filter(
        (inv) => ids.includes(inv.id) && inv.taxFlagged === true
      );
      if (selectedFlagged.length > 0) {
        throw new Error(
          'Batch approval blocked: one or more invoices require manual review. Remove flagged invoices before approving.'
        );
      }

      // Maker-Checker enforcement: block if current user submitted any selected invoice
      // Maker-checker and approval both run server-side in one transaction; the
      // server rejects self-approval rather than trusting the browser.
      await invoicesApi.batchApprove(ids);


      toast({
        title: "Invoices Approved",
        description: `Successfully approved ${selectedInvoices.size} invoices.`,
      });

      setSelectedInvoices(new Set());
      setShowApprovalDialog(false);
      fetchInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve invoices.",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleViewInvoice = async (invoice: InvoiceWithVariation) => {
    setPreviewInvoice(invoice);
    setPreviewUrl(null);
    setPreviewLoading(true);
    setPreviewOpen(true);
    
    if (invoice.rawFilePath) {
      try {
        const signed = await invoicesApi.fileUrl(invoice.id);
        if (signed) {
          setPreviewUrl(signed + '#toolbar=1&navpanes=0');
        }
      } catch (error) {
        console.error('Error getting signed URL:', error);
        setPreviewUrl(null);
      }
    }
    setPreviewLoading(false);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewInvoice(null);
    setPreviewUrl(null);
  };

  const approvableInvoices = filteredInvoices.filter(
    inv => inv.status === 'submitted' || inv.status === 'validated'
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {isApprovedView ? "Approved" : "Invoices"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isApprovedView ? "Approved invoices" : "Manage and review all invoices"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canApprove && selectedInvoices.size > 0 && (
              <Button onClick={() => setShowApprovalDialog(true)} variant="default">
                <CheckSquare className="h-4 w-4 mr-2" />
                Approve Selected ({selectedInvoices.size})
              </Button>
            )}
          </div>
        </div>


        {isApprovedView ? (
          // Historical view: a bare filter row above the table, matching the
          // Declined queue. No "Filters" card — two controls do not need a
          // titled panel of their own.
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by vendor or invoice #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <DateRangePresetFilter value={datePreset} onChange={setDatePreset} label="Approved" />
          </div>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); const sp = new URLSearchParams(searchParams); if (v === "all") sp.delete("status"); else sp.set("status", v); setSearchParams(sp, { replace: true }); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ingested">Ingested</SelectItem>
                  <SelectItem value="validated">Validated</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="exported">Exported</SelectItem>
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by due date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Due Dates</SelectItem>
                  <SelectItem value="defaulted">Due Date: Defaulted</SelectItem>
                </SelectContent>
              </Select>
              <Select value={taxFlagFilter} onValueChange={setTaxFlagFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tax flagged" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="flagged">Tax Flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No invoices found
              </div>
            ) : statusFilter === 'approved' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Approved Date</TableHead>
                    <TableHead>Transaction Date</TableHead>
                    <TableHead>ACH Routing #</TableHead>
                    <TableHead>ACH Account #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                    >
                      <TableCell>{invoice.vendor?.name || 'Unknown'}</TableCell>
                      <TableCell className="font-medium">{displayInvoiceNumber(invoice.invoiceNumber)}</TableCell>
                      <TableCell>{invoice.currency} {invoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell>{formatDateOnly(invoice.invoiceDate)}</TableCell>
                      <TableCell>{invoice.approvedAt ? format(new Date(invoice.approvedAt), 'MMM dd, yyyy') : '—'}</TableCell>
                      <TableCell>{formatDateOnly(invoice.transactionDate)}</TableCell>
                      <TableCell className="font-mono text-xs">{invoice.achRoutingNumber || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{invoice.achAccountNumber || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {canApprove && (
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedInvoices.size > 0 && selectedInvoices.size === approvableInvoices.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Variation</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const isApprovable = invoice.status === 'submitted' || invoice.status === 'validated';
                    return (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        {canApprove && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isApprovable && (
                              <Checkbox
                                checked={selectedInvoices.has(invoice.id)}
                                onCheckedChange={() => toggleSelectInvoice(invoice.id)}
                                aria-label={`Select invoice ${invoice.invoiceNumber}`}
                              />
                            )}
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{displayInvoiceNumber(invoice.invoiceNumber)}</span>
                            {invoice.badFileFlag && (
                              <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 500, marginRight: '4px' }}>
                                BAD FILE
                              </span>
                            )}
                            {invoice.taxFlagged && (
                              <span className="inline-flex items-center rounded-md bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">
                                TAX FLAGGED
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{invoice.vendor?.name || 'Unknown'}</TableCell>
                        <TableCell><SourceBadge source={invoice.source} /></TableCell>
                        <TableCell>{formatDateOnly(invoice.invoiceDate)}</TableCell>
                        <TableCell>{invoice.currency} {invoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <StatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell>
                          <VariationBadge 
                            variationScore={invoice.variationScore} 
                            isCritical={invoice.isCritical}
                            autoRouted={invoice.autoRouted}
                            variationFlags={invoice.variationFlags}
                            anomalyCount={invoice.anomalyCount ?? 0}
                          />
                        </TableCell>
                        <TableCell>
                          {invoice.status !== "approved" && <RiskBadge level={invoice.riskLevel} />}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewInvoice(invoice)}
                              title="View Invoice"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/invoices/${invoice.id}`)}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          {hasMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                onClick={() => setPage(prev => prev + 1)}
              >
                Load More
              </Button>
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Batch Approval Confirmation Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Batch Approval</DialogTitle>
            <DialogDescription>
              You are about to approve multiple invoices at once.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-3xl font-bold text-primary">{selectedInvoices.size}</p>
              <p className="text-sm text-muted-foreground">invoices will be approved</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)} disabled={isApproving}>
              Cancel
            </Button>
            <Button onClick={handleBatchApprove} disabled={isApproving}>
              {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Sheet */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent className="w-[600px] sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Preview
            </SheetTitle>
          </SheetHeader>
          
          {previewInvoice && (
            <div className="mt-6 space-y-6">
              {/* Invoice Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Number</p>
                  <p className="font-medium">{displayInvoiceNumber(previewInvoice.invoiceNumber)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge status={previewInvoice.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium">{previewInvoice.vendor?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">{previewInvoice.currency} {previewInvoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{formatDateOnly(previewInvoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">
                    {previewInvoice.dueDate 
                      ? formatDateOnly(previewInvoice.dueDate)
                      : '—'
                    }
                  </p>
                </div>
              </div>

              {/* PDF Preview */}
              {previewLoading ? (
                <div className="border rounded-lg h-[500px] flex items-center justify-center bg-muted">
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading document...</p>
                  </div>
                </div>
              ) : previewUrl ? (
                <div className="border rounded-lg overflow-hidden h-[500px]">
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                      className="w-full h-full"
                      title="Invoice Preview"
                    />
                  </object>
                </div>
              ) : (
                <div className="border rounded-lg h-[500px] flex items-center justify-center bg-muted">
                  <div className="text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No document available</p>
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={() => navigate(`/invoices/${previewInvoice.id}`)}>
                View Full Details
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Layout>
  );
};

export default InvoiceList;