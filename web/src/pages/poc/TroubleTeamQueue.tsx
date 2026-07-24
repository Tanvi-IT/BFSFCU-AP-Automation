import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertOctagon, Eye, CheckCircle2, RotateCcw, Building2 } from "lucide-react";
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

interface ExceptionInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  created_at: string;
  checker_comment: string | null;
  vendor: {
    id: string;
    name: string;
  } | null;
}

export default function TroubleTeamQueue() {
  const navigate = useNavigate();
  const { tenantId, isAdmin, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<ExceptionInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<ExceptionInvoice | null>(null);
  const [actionModal, setActionModal] = useState<"resolve" | "return" | null>(null);
  const [comment, setComment] = useState("");
  const [isActioning, setIsActioning] = useState(false);

  const canManage = isAdmin || isSuperAdmin;

  useEffect(() => {
    fetchExceptionInvoices();
  }, [tenantId]);

  const fetchExceptionInvoices = async () => {
    try {
      const rows = await invoicesApi.list({ status: QUEUE.exceptions, limit: 500 });
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


      setInvoices((data || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        currency: inv.currency,
        created_at: inv.created_at,
        checker_comment: inv.checker_comment,
        vendor: inv.vendors,
      })));
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
      await invoicesApi.approve(
        selectedInvoice.id,
        comment || selectedInvoice.checker_comment || undefined
      );

      toast({
        title: "Invoice Resolved",
        description: `Invoice ${selectedInvoice.invoice_number} has been approved.`,
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

  if (!canManage) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <AlertOctagon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can access the Trouble Team Queue.</p>
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
            Trouble Team Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Invoices requiring admin intervention ({invoices.length})
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Exception Invoices ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto h-12 w-12 text-success/50" />
                <p className="mt-4">No exception invoices pending</p>
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
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {invoice.vendor?.name || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell>{invoice.invoice_number}</TableCell>
                      <TableCell>
                        {invoice.currency} {invoice.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit", year: "numeric" }).format(new Date(invoice.created_at))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {invoice.checker_comment || "Manual escalation"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/poc/low-confidence/${invoice.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setActionModal("resolve");
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setActionModal("return");
                            }}
                          >
                            <RotateCcw className="h-4 w-4 text-warning" />
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

      {/* Resolve Modal */}
      <Dialog open={actionModal === "resolve"} onOpenChange={() => setActionModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Invoice</DialogTitle>
            <DialogDescription>
              Approve invoice {selectedInvoice?.invoice_number} and remove from exception queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Resolution Notes (Optional)</Label>
              <Textarea
                placeholder="Add notes about how this was resolved..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={isActioning}>
              {isActioning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve & Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return to Maker Modal */}
      <Dialog open={actionModal === "return"} onOpenChange={() => setActionModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Maker</DialogTitle>
            <DialogDescription>
              Send invoice {selectedInvoice?.invoice_number} back for corrections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Instructions for Maker</Label>
              <Textarea
                placeholder="Describe what needs to be corrected..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionModal(null)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleReturnToMaker} disabled={isActioning}>
              {isActioning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Return to Maker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
