import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { activityApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { getReasonLabels } from "@/lib/invoiceReasons";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Eye, Download, Search } from "lucide-react";
import { format } from "date-fns";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/pocConfig";
import { ConfidenceBadge, anomalyToConfidence } from "@/components/ConfidenceBadge";
import { displayInvoiceNumber } from "@/lib/utils";

interface InvoiceWithVendor {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  created_at: string;
  anomaly_score: number | null;
  variation_flags: string[] | null;
  status: string;
  gl_code: string | null;
  tax_flagged: boolean;
  tax_flag_reason: string | null;
  bad_file_flag: boolean;
  bad_file_reason: string | null;
  vendor: {
    id: string;
    name: string;
    status: string;
  } | null;
}

export default function LowConfidenceList() {
  const navigate = useNavigate();
  const { tenantId, isAdmin, isSuperAdmin, user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceWithVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  
  // Inline GL editing
  const [editingGLId, setEditingGLId] = useState<string | null>(null);
  const [editingGLValue, setEditingGLValue] = useState("");

  const canExport = isAdmin || isSuperAdmin;

  // Filter invoices based on search term
  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter((inv) => {
      const confidence = ((1 - (inv.anomaly_score || 0)) * 100).toFixed(0);
      return (
        inv.vendor?.name?.toLowerCase().includes(term) ||
        inv.invoice_number?.toLowerCase().includes(term) ||
        (inv.total_amount?.toString() || '').includes(term) ||
        inv.currency?.toLowerCase().includes(term) ||
        inv.gl_code?.toLowerCase().includes(term) ||
        confidence.includes(term) ||
        inv.created_at?.includes(term)
      );
    });
  }, [invoices, searchTerm]);

  useEffect(() => {
    fetchLowConfidenceInvoices();
  }, [tenantId]);

  useEffect(() => {
    // Realtime push replaced by polling — the background worker fills the queue,
    // so new invoices still appear without a manual refresh.
    const timer = window.setInterval(() => fetchLowConfidenceInvoices(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchLowConfidenceInvoices = async () => {
    if (!tenantId) return;
    try {
      const rows = await invoicesApi.list({ status: QUEUE.lowConfidence, limit: 500 });
      const data = rows.map((r) => ({
        ...r,
        vendors: r.vendor_id
          ? { id: r.vendor_id, name: r.vendor_name, status: (r as any).vendor_status ?? "active" }
          : null,
      }));


      // Filter for low confidence invoices with strict queue exclusivity
      // Tax-flagged invoices ALWAYS appear here regardless of confidence
      const lowConfidence = (data || []).filter((inv: any) => {
        const confidenceScore = 1 - (inv.anomaly_score || 0);
        const vendorVerified = inv.vendors?.status === "active";
        const hasDuplicate = inv.duplicate_type !== null && inv.duplicate_type !== 'possible_duplicate';

        if (hasDuplicate) return false;
        if (inv.tax_flagged) return true;

        const hasAchMismatch = inv.variation_flags?.some((f: string) =>
          ["ach_account_changed", "ach_routing_changed", "ach_new_account_captured"].includes(f)
        ) ?? false;

        if (hasAchMismatch) return true;

        const qualifiesForHighConfidence = confidenceScore >= HIGH_CONFIDENCE_THRESHOLD && vendorVerified && !hasDuplicate && !hasAchMismatch;
        if (qualifiesForHighConfidence) return false;

        return confidenceScore < HIGH_CONFIDENCE_THRESHOLD || !vendorVerified || hasAchMismatch;
      });

      setInvoices(lowConfidence.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        currency: inv.currency,
        created_at: inv.created_at,
        anomaly_score: inv.anomaly_score,
        variation_flags: inv.variation_flags,
        status: inv.status,
        gl_code: inv.gl_code,
        tax_flagged: inv.tax_flagged ?? false,
        tax_flag_reason: inv.tax_flag_reason ?? null,
        bad_file_flag: inv.bad_file_flag ?? false,
        bad_file_reason: inv.bad_file_reason ?? null,
        vendor: inv.vendors,
      })));
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getLowConfidenceReasons = (invoice: InvoiceWithVendor) => {
    return getReasonLabels(invoice);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((i) => i.id)));
    }
  };

  const exportSelectedToCSV = async () => {
    const selected = invoices.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;

    const headers = ["Invoice #", "Vendor", "Amount", "Currency", "Received", "Confidence", "Status"];
    const rows = selected.map((inv) => [
      inv.invoice_number,
      inv.vendor?.name || "Unknown",
      inv.total_amount.toString(),
      inv.currency,
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(inv.created_at)),
      `${anomalyToConfidence(inv.anomaly_score)}%`,
      inv.status,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `low-confidence-invoices-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // erp_export_history is part of the ERP subsystem, which is not ported yet.
    // The export is still recorded, as an audit entry per invoice.
    await Promise.allSettled(
      selected.map((i) =>
        activityApi.addNote(i.id, `Exported to CSV (${selected.length} invoice batch)`)
      )
    ).catch(() => undefined);

    toast({
      title: "Export Complete",
      description: `${selected.length} invoice(s) exported to CSV.`,
    });

    setSelectedIds(new Set());
  };

  const handleGLSave = async (invoiceId: string, newGLValue: string) => {
    try {
      await invoicesApi.update(invoiceId, { glCode: newGLValue.trim() });

      // Update local state
      setInvoices(prev => prev.map(inv => 
        inv.id === invoiceId ? { ...inv, gl_code: newGLValue.trim() || null } : inv
      ));
      
      setEditingGLId(null);
      setEditingGLValue("");
      
      // The server records the GL change in the same transaction.

      toast({
        title: "GL Updated",
        description: "GL (Approver) has been saved.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message,
      });
    }
  };

  const startGLEdit = (invoice: InvoiceWithVendor) => {
    setEditingGLId(invoice.id);
    setEditingGLValue(invoice.gl_code || "");
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <AlertTriangle className="h-8 w-8 text-warning" />
            Low-Confidence Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Invoices requiring manual review ({invoices.length})
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by vendor, invoice #, amount, reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Requires Review ({filteredInvoices.length})</CardTitle>
            {canExport && selectedIds.size > 0 && (
              <Button onClick={exportSelectedToCSV} size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Selected ({selectedIds.size})
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">{searchTerm ? "No matching invoices found" : "No low-confidence invoices pending"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {canExport && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>GL (Approver)</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Reason(s)</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow 
                      key={invoice.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/poc/low-confidence/${invoice.id}`)}
                    >
                      {canExport && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(invoice.id)}
                            onCheckedChange={() => toggleSelect(invoice.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{invoice.vendor?.name || "Unknown"}</span>

                        </div>
                      </TableCell>
                      <TableCell>
                        {invoice.currency} {invoice.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{displayInvoiceNumber(invoice.invoice_number)}</TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit", year: "numeric" }).format(new Date(invoice.created_at))}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {editingGLId === invoice.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingGLValue}
                              onChange={(e) => setEditingGLValue(e.target.value)}
                              className="h-7 w-28 text-xs"
                              placeholder="Enter GL..."
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleGLSave(invoice.id, editingGLValue);
                                } else if (e.key === "Escape") {
                                  setEditingGLId(null);
                                  setEditingGLValue("");
                                }
                              }}
                              onBlur={() => handleGLSave(invoice.id, editingGLValue)}
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => startGLEdit(invoice)}
                            className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80 cursor-pointer min-w-[60px] text-left"
                          >
                            {invoice.gl_code || "—"}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge 
                          score={anomalyToConfidence(invoice.anomaly_score)} 
                          showLabel={false} 
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {invoice.bad_file_flag && (
                            <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 500, marginRight: '4px' }}>
                              BAD FILE
                            </span>
                          )}
                          {getLowConfidenceReasons(invoice).map((reason, idx) => (
                            <Badge key={idx} className="text-xs bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-50">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/poc/low-confidence/${invoice.id}`);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
