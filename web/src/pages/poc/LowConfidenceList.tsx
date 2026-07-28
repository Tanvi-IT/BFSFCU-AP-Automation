import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import { getReasonLabels } from "@/lib/invoiceReasons";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Search } from "lucide-react";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/pocConfig";
import { displayInvoiceNumber, sanitizeGlAccount } from "@/lib/utils";

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
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceWithVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // True only after a fetch has SUCCEEDED at least once. The empty state is
  // gated on this so a transient/failed fetch (e.g. under load) keeps the
  // spinner and lets the 10s poll recover, instead of flashing "no invoices".
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Inline GL editing
  const [editingGLId, setEditingGLId] = useState<string | null>(null);
  const [editingGLValue, setEditingGLValue] = useState("");

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
        // Only a live vendor row can be 'active'; a snapshot name without a
        // vendor_id means the vendor is not on the approved list.
        vendors: r.vendor_name
          ? {
              id: r.vendor_id ?? "",
              name: r.vendor_name,
              status: r.vendor_id ? ((r as any).vendor_status ?? "active") : "unverified",
            }
          : null,
      }));


      // Low Confidence is exactly the `validated` status. The backend routing
      // already put everything that needs review here, so this page shows the
      // set as-is — no client-side re-derivation. The old version re-split by
      // anomaly score and excluded duplicates, which could hide a `validated`
      // invoice from both queues at once.
      setInvoices(data.map((inv: any) => ({
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
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getLowConfidenceReasons = (invoice: InvoiceWithVendor) => {
    return getReasonLabels(invoice);
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
          </CardHeader>
          <CardContent className="p-0">
            {!hasLoaded ? (
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
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Reason(s)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow 
                      key={invoice.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/low-confidence/${invoice.id}`)}
                    >
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
                              onChange={(e) => setEditingGLValue(sanitizeGlAccount(e.target.value))}
                              inputMode="numeric"
                              className="h-7 w-28 text-xs font-mono"
                              placeholder="GL account..."
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
