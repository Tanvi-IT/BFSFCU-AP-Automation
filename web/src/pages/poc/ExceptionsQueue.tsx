import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import { getReasonLabels } from "@/lib/invoiceReasons";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertOctagon, Eye, CheckCircle2, RotateCcw, Building2, Search } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InvoiceNotes } from "@/components/InvoiceNotes";

interface ExceptionInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  created_at: string;
  checker_comment: string | null;
  duplicate_type: string | null;
  variation_flags: string[] | null;
  tax_flagged: boolean;
  tax_flag_reason: string | null;
  bad_file_flag: boolean;
  bad_file_reason: string | null;
  vendor: {
    id: string;
    name: string;
    status: string;
    bank_verified: boolean;
  } | null;
}

export default function ExceptionsQueue() {
  const navigate = useNavigate();
  const { tenantId, isAdmin, isSuperAdmin, isChecker, user, loading } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<ExceptionInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<ExceptionInvoice | null>(null);
  const [actionModal, setActionModal] = useState<"resolve" | "return" | null>(null);
  const [comment, setComment] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Checkers can view and take action on exceptions for demo purposes
  const canManage = isChecker || isAdmin || isSuperAdmin;

  useEffect(() => {
    fetchExceptionInvoices();
  }, []);

  // Realtime push was dropped in the Azure rebuild; the list refetches after
  // each action instead.

  const fetchExceptionInvoices = async () => {
    try {
      const rows = await invoicesApi.list({ status: QUEUE.exceptions, limit: 200 });

      setInvoices(
        rows.map((inv) => {
          const flags = inv.variation_flags ?? [];
          return {
            id: inv.id,
            invoice_number: inv.invoice_number ?? "",
            total_amount: Number(inv.total_amount),
            currency: inv.currency,
            created_at: inv.created_at,
            // Renamed: checker_comment → decline_reason
            checker_comment:
              (inv as { decline_reason?: string | null }).decline_reason ?? null,
            duplicate_type: inv.duplicate_type,
            variation_flags: flags,
            // These were separate columns before; they are variation flags now,
            // with the detail carried in processing_error.
            tax_flagged: flags.includes("TAX_LINE_DETECTED"),
            tax_flag_reason: flags.includes("TAX_LINE_DETECTED")
              ? "Tax line detected — organisation is tax-exempt."
              : null,
            bad_file_flag: flags.includes("extraction_failed"),
            bad_file_reason: inv.processing_error,
            vendor: inv.vendor_name
              ? { id: inv.vendor_id ?? "", name: inv.vendor_name, status: "active", bank_verified: false }
              : null,
          };
        }) as any
      );
    } catch (error) {
      console.error("Error fetching exception invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedInvoice) return;
    setIsActioning(true);

    try {
      // Resolving an exception returns it to Low Confidence for a human to
      // confirm — never straight to approved. The server writes the audit entry
      // in the same transaction as the status change.
      await invoicesApi.returnToReview(
        selectedInvoice.id,
        comment || selectedInvoice.checker_comment || "",
        "resolved"
      );

      toast({
        title: "Invoice Resolved",
        description: `Invoice ${selectedInvoice.invoice_number} returned to Low-Confidence Queue.`,
      });

      setActionModal(null);
      setSelectedInvoice(null);
      setComment("");
      fetchExceptionInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: error.message,
      });
    } finally {
      setIsActioning(false);
    }
  };

  const handleReturnToMaker = async () => {
    if (!selectedInvoice) return;
    setIsActioning(true);

    try {
      await invoicesApi.returnToReview(
        selectedInvoice.id,
        comment || "Returned for corrections",
        "returned_to_submitter"
      );

      toast({
        title: "Returned to Maker",
        description: `Invoice ${selectedInvoice.invoice_number} has been returned for corrections.`,
      });

      setActionModal(null);
      setSelectedInvoice(null);
      setComment("");
      fetchExceptionInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: error.message,
      });
    } finally {
      setIsActioning(false);
    }
  };

  const getExceptionReasons = (invoice: ExceptionInvoice): string[] => {
    const reasons = getReasonLabels(invoice);
    if (reasons.length === 0) reasons.push("Manual escalation");
    return reasons;
  };

  // Filtered in the browser, matching the High- and Low-Confidence queues: this
  // is a working queue with everything already loaded, not a paged history.
  // Reason text is searchable too — "duplicate" is how you find the duplicates.
  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter((inv) =>
      [
        inv.vendor?.name,
        inv.invoice_number,
        inv.currency,
        inv.total_amount?.toString(),
        inv.checker_comment,
        inv.bad_file_reason,
        ...getExceptionReasons(inv),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [invoices, searchTerm]);

  if (loading) return null;

  if (!canManage) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <AlertOctagon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can access the Exceptions Queue.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <AlertOctagon className="h-8 w-8 text-destructive" />
            Exceptions
          </h1>
          <p className="text-muted-foreground mt-1">
            Invoices requiring admin intervention ({invoices.length})
          </p>
        </div>

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
          <CardHeader>
            <CardTitle>Exception Invoices ({filteredInvoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto h-12 w-12 text-success/50" />
                <p className="mt-4">
                  {searchTerm ? "No matching exceptions found" : "No exception invoices pending"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Escalated</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/poc/exceptions/${invoice.id}`)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {invoice.vendor?.name || "Unknown"}

                        </div>
                      </TableCell>
                      <TableCell>{invoice.invoice_number}</TableCell>
                      <TableCell>
                        {invoice.currency} {invoice.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit", year: "numeric" }).format(new Date(invoice.created_at))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {invoice.bad_file_flag && (
                            <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 500, marginRight: '4px' }}>
                              BAD FILE
                            </span>
                          )}
                          {getExceptionReasons(invoice).map((r, i) => (
                            <Badge key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-50">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/poc/exceptions/${invoice.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

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
