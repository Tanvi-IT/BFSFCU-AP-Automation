import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Eye, Search } from "lucide-react";
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
  status: string;
  gl_code: string | null;
  tax_flagged: boolean;
  tax_flag_reason: string | null;
  vendor: {
    id: string;
    name: string;
    status: string;
  } | null;
}

export default function HighConfidenceQueue() {
  const navigate = useNavigate();
  const { isChecker, isAdmin, isSuperAdmin, tenantId, user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceWithVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Inline GL editing
  const [editingGLId, setEditingGLId] = useState<string | null>(null);
  const [editingGLValue, setEditingGLValue] = useState("");

  const canApprove = isChecker || isAdmin || isSuperAdmin;

  // Filter invoices based on search term
  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter((inv) => {
      const confidence = ((1 - (inv.anomaly_score || 0)) * 100).toFixed(0);
      return (
        inv.vendor?.name?.toLowerCase().includes(term) ||
        inv.invoice_number.toLowerCase().includes(term) ||
        inv.total_amount.toString().includes(term) ||
        inv.currency.toLowerCase().includes(term) ||
        inv.gl_code?.toLowerCase().includes(term) ||
        confidence.includes(term) ||
        inv.created_at.includes(term)
      );
    });
  }, [invoices, searchTerm]);

  useEffect(() => {
    fetchHighConfidenceInvoices();
  }, [tenantId]);

  // Realtime push replaced by polling — invoices are processed by a background
  // worker, so the queue still fills in on its own.
  useEffect(() => {
    const timer = window.setInterval(() => fetchHighConfidenceInvoices(), 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHighConfidenceInvoices = async () => {
    if (!tenantId) return;
    try {
      // High Confidence is exactly the `submitted` status. The backend routing
      // (api/src/shared/pipeline/routing.ts) already decided an invoice belongs
      // here — clean, high confidence, active matched vendor, no critical flags.
      // We do NOT re-derive that client-side: this page used to fetch `validated`
      // and re-split it by anomaly score, which meant a `submitted` invoice
      // showed in neither queue.
      const rows = await invoicesApi.list({ status: QUEUE.highConfidence, limit: 500 });
      const data = rows.map((r) => ({
        ...r,
        vendors: r.vendor_name
          ? {
              id: r.vendor_id ?? "",
              name: r.vendor_name,
              status: r.vendor_id ? ((r as any).vendor_status ?? "active") : "unverified",
            }
          : null,
      }));

      setInvoices(data.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        currency: inv.currency,
        created_at: inv.created_at,
        anomaly_score: inv.anomaly_score,
        status: inv.status,
        gl_code: inv.gl_code,
        tax_flagged: inv.tax_flagged ?? false,
        tax_flag_reason: inv.tax_flag_reason ?? null,
        vendor: inv.vendors,
      })));
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map((inv) => inv.id)));
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;

    setIsApproving(true);
    try {
      // One transaction on the server: every invoice is approved with its audit
      // entry, or none are. Timestamps are set server-side.
      await invoicesApi.batchApprove(Array.from(selectedIds));

      toast({
        title: "Invoices Approved",
        description: `${selectedIds.size} invoice(s) have been approved.`,
      });

      setSelectedIds(new Set());
      fetchHighConfidenceInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: error.message || "Failed to approve invoices.",
      });
    } finally {
      setIsApproving(false);
    }
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
      
      // The server records the GL change in the same transaction as the update.

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <CheckCircle2 className="h-8 w-8 text-success" />
              High Confidence Invoices for Batch Approval
            </h1>
          </div>
        </div>

        {/* Search and Batch Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by vendor, invoice #, amount, GL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {canApprove && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={toggleSelectAll}
                disabled={filteredInvoices.length === 0}
              >
                {selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0
                  ? "Deselect All"
                  : "Select All"}
              </Button>
              <Button
                onClick={handleBatchApprove}
                disabled={isApproving || selectedIds.size === 0}
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Batch Approve ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ready for Approval ({filteredInvoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">{searchTerm ? "No matching invoices found" : "No high-confidence invoices pending"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {canApprove && (
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
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/poc/high-confidence/${invoice.id}`)}>
                      {canApprove && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(invoice.id)}
                            onCheckedChange={() => toggleSelect(invoice.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        {invoice.vendor?.name || "Unknown"}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/poc/high-confidence/${invoice.id}`)}
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
