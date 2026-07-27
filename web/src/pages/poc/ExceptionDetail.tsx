import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { invoicesApi } from "@/services/invoices";
import { vendorsApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { getReasonLabels } from "@/lib/invoiceReasons";
import { sanitizeGlAccount } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Building2, DollarSign, FileText, Calendar, Landmark, Pencil, X, Save } from "lucide-react";
import { InvoiceAuditTrail } from "@/components/poc/InvoiceAuditTrail";
import { InvoiceNotes } from "@/components/InvoiceNotes";
import { DuplicateWarningCard } from "@/components/poc/DuplicateWarningCard";
import { DuplicateType } from "@/components/poc/DuplicateBadge";
import { SupplementalAttachment } from "@/components/SupplementalAttachment";

interface ExceptionInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  invoice_date: string | null;
  due_date: string | null;
  transaction_date: string | null;
  status: string;
  raw_file_path: string | null;
  duplicate_type: DuplicateType | null;
  duplicate_of: string | null;
  system_filename: string | null;
  sanitized_filename: string | null;
  ach_routing_number: string | null;
  ach_account_number: string | null;
  gl_code: string | null;
  gl_approver: string | null;
  sender_email: string | null;
  tax_flagged: boolean;
  tax_flag_reason: string | null;
  bad_file_flag: boolean;
  bad_file_reason: string | null;
  variation_flags: string[] | null;
  supplemental_pdf_count: number;
  checker_comment: string | null;
  vendor: { id: string; name: string; status: string; bank_verified: boolean } | null;
}

interface DuplicateOriginal {
  id: string;
  invoice_number: string;
}

export default function ExceptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId, isAdmin, isSuperAdmin, user } = useAuth();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<ExceptionInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState({ invoice_number: "", total_amount: "", invoice_date: "", due_date: "" });
  // GL coding: Account (14-digit number, dashes allowed) + Approver (name).
  const [glAccount, setGlAccount] = useState("");
  const [glApprover, setGlApprover] = useState("");
  const [applyToAllVendorInvoices, setApplyToAllVendorInvoices] = useState(true);
  const [duplicateOriginal, setDuplicateOriginal] = useState<DuplicateOriginal | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchInvoice(id);
  }, [id]);

  useEffect(() => {
    if (!invoice) return;
    setGlAccount(invoice.gl_code || "");
    setGlApprover(invoice.gl_approver || "");
  }, [invoice?.id]);

  useEffect(() => {
    if (!invoice?.duplicate_of) { setDuplicateOriginal(null); return; }
    invoicesApi
      .get(invoice.duplicate_of)
      .then((orig) => setDuplicateOriginal(orig as any))
      .catch(() => setDuplicateOriginal(null));
  }, [invoice?.duplicate_of]);

  useEffect(() => {
    if (!invoice?.raw_file_path) return;
    invoicesApi
      .fileUrl(invoice.id)
      .then((url) => setTimeout(() => setPdfUrl(url), 100))
      .catch(() => setPdfUrl(null));
  }, [invoice?.raw_file_path]);

  const fetchInvoice = async (invoiceId: string) => {
    try {
      const row = await invoicesApi.get(invoiceId);
      const data = {
        ...row,
        vendors: row.vendor_name
          ? {
              id: row.vendor_id ?? "",
              name: row.vendor_name,
              // No vendor_id means the name is only a snapshot — the vendor is
              // not on the approved list, so it is not active.
              status: row.vendor_id ? ((row as any).vendor_status ?? "active") : "unverified",
              bank_verified: (row as any).vendor_bank_verified ?? false,
            }
          : null,
      };
      setInvoice({ ...data, vendor: (data as any).vendors } as unknown as ExceptionInvoice);
    } catch (err) {
      console.error("Error fetching exception invoice:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getExceptionReasons = (): string[] => {
    if (!invoice) return ["Unknown"];
    const reasons = getReasonLabels(invoice);
    if (reasons.length === 0) reasons.push("Manual escalation");
    return reasons;
  };

  const handleApproveAsDuplicate = async () => {
    if (!invoice) return;
    setIsActioning(true);
    try {
      await invoicesApi.approve(
        invoice.id,
        `Approved as duplicate (${invoice.duplicate_type ?? "duplicate"})`
      );
      // Audit is written server-side in the same transaction.
      toast({ title: "Approved as Duplicate", description: `Invoice ${invoice.invoice_number} approved.` });
      navigate("/poc/exceptions");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setIsActioning(false);
    }
  };

  const handleDeclineAsDuplicate = async () => {
    if (!invoice) return;
    setIsActioning(true);
    try {
      await invoicesApi.decline(
        invoice.id,
        declineReason || (isDuplicate ? "Declined as duplicate" : "Declined")
      );
      // Audit is written server-side in the same transaction.
      toast({ title: isDuplicate ? "Declined as Duplicate" : "Invoice Declined", description: `Invoice ${invoice.invoice_number} declined.` });
      setDeclineDialogOpen(false);
      navigate("/poc/exceptions");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setIsActioning(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!invoice) return;
    setIsActioning(true);
    try {
      await invoicesApi.update(invoice.id, {
        ...(editFields.invoice_number ? { invoiceNumber: editFields.invoice_number } : {}),
        ...(editFields.total_amount
          ? { totalAmount: parseFloat(editFields.total_amount.replace(/[^0-9.-]/g, '')) }
          : {}),
        ...(editFields.invoice_date ? { invoiceDate: editFields.invoice_date } : {}),
        ...(editFields.due_date ? { dueDate: editFields.due_date } : {}),
        glCode: glAccount.trim(),
        glApprover: glApprover.trim(),
      });

      // Apply the same GL coding to every other invoice from this vendor.
      if (applyToAllVendorInvoices && invoice.vendor?.id) {
        await vendorsApi
          .applyCoding(invoice.vendor.id, {
            glCode: glAccount.trim() || null,
            glApprover: glApprover.trim() || null,
          })
          .catch((err) => console.error("Error updating vendor invoices:", err));
      }

      toast({ title: "Invoice Updated", description: "Changes saved successfully." });
      setIsEditing(false);
      fetchInvoice(invoice.id);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save Failed", description: err.message });
    } finally {
      setIsActioning(false);
    }
  };

  const handleResolve = async () => {
    if (!invoice) return;
    setIsActioning(true);
    try {
      // This screen returns to Low Confidence ('validated'); the Exceptions LIST
      // returns to High Confidence. Both original behaviours are preserved.
      await invoicesApi.returnToReview(invoice.id, "", "resolved", "validated");
      // Audit is written server-side in the same transaction.
      toast({ title: "Sent for Review", description: `Invoice ${invoice.invoice_number} has been returned to the Low Confidence queue for review.` });
      navigate("/poc/exceptions");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setIsActioning(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch { return dateStr; }
  };

  const isDuplicate = !!invoice?.duplicate_type || (invoice?.variation_flags?.includes("superseded_by_new_submission") ?? false);
  const isSuperseded = invoice?.variation_flags?.includes('superseded_by_new_submission') ?? false;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">Invoice not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <button onClick={() => navigate("/poc/exceptions")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Exceptions
        </button>

        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Exception Review</h1>
            <div className="text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>Reason:</span>
                {getExceptionReasons().map((r, i) => (
                  <Badge key={i} className="rounded-full bg-amber-50 text-amber-700 border border-amber-300">
                    {r}
                  </Badge>
                ))}
              </div>
              {invoice.checker_comment && invoice.checker_comment !== "Routed to Exceptions for investigation" && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium">Investigation Note:</span> {invoice.checker_comment}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left — PDF */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Invoice Document</h3>
            {pdfUrl ? (
              <div className="border rounded-lg overflow-hidden bg-white" style={{ height: "500px" }}>
                <iframe key={pdfUrl} src={pdfUrl} className="w-full h-full" title="Invoice PDF" />
              </div>
            ) : (
              <div className="border rounded-lg flex items-center justify-center h-64 text-muted-foreground text-sm">
                No document available
              </div>
            )}
            {pdfUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, "_blank")}>
                Open in New Tab
              </Button>
            )}
            {invoice.id && (
              <SupplementalAttachment invoiceId={invoice.id} status={invoice.status}
                onAttached={() => fetchInvoice(invoice.id)}
                onInvoicePdfUpdated={() =>
                  invoicesApi.fileUrl(invoice.id).then(setPdfUrl).catch(() => setPdfUrl(null))
                } />
            )}
          </div>

          {/* Right — Details */}
          <div className="space-y-0">
            <Tabs defaultValue="review" className="w-full">
              <TabsList className="w-full rounded-none border-b bg-transparent h-auto p-0 mb-0">
                <TabsTrigger value="review" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm">Review</TabsTrigger>
                <TabsTrigger value="audit" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm">Audit Trail</TabsTrigger>
                <TabsTrigger value="notes" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm">Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="review" className="p-0 mt-0 space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Invoice Details</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {duplicateOriginal?.invoice_number || invoice.invoice_number}
                    </Badge>
                    {(isAdmin || isSuperAdmin) && (
                      !isEditing ? (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                          setEditFields({
                            invoice_number: invoice.invoice_number || "",
                            total_amount: String(invoice.total_amount || ""),
                            invoice_date: invoice.invoice_date || "",
                            due_date: invoice.due_date || "",
                          });
                          setIsEditing(true);
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setIsEditing(false)}>
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      )
                    )}
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Vendor</p>
                      <p className="font-medium">{invoice.vendor?.name || "Unknown"}</p>
                      {invoice.vendor?.id && (
                        <p className="text-xs text-muted-foreground mt-0.5">ID: {invoice.vendor.id}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      {isEditing ? (
                        <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          value={editFields.total_amount}
                          onChange={e => setEditFields(f => ({ ...f, total_amount: e.target.value }))} />
                      ) : (
                        <p className="font-medium">{invoice.currency} {invoice.total_amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Invoice #</p>
                      {isEditing ? (
                        <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          value={editFields.invoice_number}
                          onChange={e => setEditFields(f => ({ ...f, invoice_number: e.target.value }))} />
                      ) : (
                        <p className="font-medium">{duplicateOriginal?.invoice_number || invoice.invoice_number}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Invoice Date</p>
                      {isEditing ? (
                        <input type="date" className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          value={editFields.invoice_date}
                          onChange={e => setEditFields(f => ({ ...f, invoice_date: e.target.value }))} />
                      ) : (
                        <p className="font-medium">{formatDate(invoice.invoice_date)}</p>
                      )}
                    </div>
                  </div>
                  {/* ACH Routing # — always shown (empty as "—"), matching the
                      Low/High Confidence detail pages. */}
                  <div className="flex items-start gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">ACH Routing #</p>
                      <p className="font-medium font-mono">{invoice.ach_routing_number || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Due Date</p>
                      {isEditing ? (
                        <input type="date" className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          value={editFields.due_date}
                          onChange={e => setEditFields(f => ({ ...f, due_date: e.target.value }))} />
                      ) : (
                        <p className="font-medium">{formatDate(invoice.due_date)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">ACH Account #</p>
                      <p className="font-medium font-mono">{invoice.ach_account_number || "—"}</p>
                    </div>
                  </div>
                  {invoice.status === "approved" && invoice.transaction_date && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Transaction Date</p>
                        <p className="font-medium">{formatDate(invoice.transaction_date)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* GL coding: Account + Approver — same block as the Low/High
                    Confidence review pages. */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-4">Assignment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="gl-account-input">GL Account</Label>
                      {isEditing ? (
                        <Input
                          id="gl-account-input"
                          value={glAccount}
                          onChange={(e) => setGlAccount(sanitizeGlAccount(e.target.value))}
                          inputMode="numeric"
                          placeholder="14-digit account (dashes allowed)"
                        />
                      ) : (
                        <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center text-sm font-mono">
                          {glAccount || "-"}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gl-approver-input">GL Approver</Label>
                      {isEditing ? (
                        <Input
                          id="gl-approver-input"
                          value={glApprover}
                          onChange={(e) => setGlApprover(e.target.value)}
                          placeholder="Approver name"
                        />
                      ) : (
                        <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center text-sm">
                          {glApprover || "-"}
                        </div>
                      )}
                    </div>
                  </div>
                  {invoice.vendor?.name && (
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50 mt-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="apply-all-toggle" className="text-sm font-medium cursor-pointer">
                          Apply to all {invoice.vendor.name} invoices
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {applyToAllVendorInvoices
                            ? "Changes will update all invoices from this vendor"
                            : "Changes will only apply to this invoice"}
                        </p>
                      </div>
                      <Switch
                        id="apply-all-toggle"
                        checked={applyToAllVendorInvoices}
                        onCheckedChange={setApplyToAllVendorInvoices}
                        disabled={!isEditing}
                      />
                    </div>
                  )}
                </div>

                {isEditing && (
                  <Button onClick={handleSaveEdit} disabled={isActioning} className="w-full">
                    {isActioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Changes
                  </Button>
                )}
                {(invoice.system_filename || invoice.sanitized_filename) && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">System Filename</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        {invoice.system_filename || invoice.sanitized_filename}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {isDuplicate && (
              <DuplicateWarningCard
                duplicateType={invoice.duplicate_type!}
                duplicateOfId={invoice.duplicate_of}
                duplicateOfNumber={duplicateOriginal?.invoice_number}
                isAdmin={isAdmin || isSuperAdmin}
              />
            )}

            {isDuplicate && (
              <div className="flex gap-3">
                <Button variant="destructive" className="flex-1"
                  onClick={handleApproveAsDuplicate} disabled={isActioning}>
                  {isActioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Approve as Duplicate
                </Button>
                <Button variant="destructive" className="flex-1 opacity-80"
                  onClick={() => setDeclineDialogOpen(true)} disabled={isActioning}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Decline as Duplicate
                </Button>
              </div>
            )}

            {isSuperseded && invoice?.status !== 'archived' && (
              <div className="flex gap-3">

                <Button className="flex-1" onClick={handleResolve} disabled={isActioning}>
                  {isActioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Resolve Exception
                </Button>
              </div>
            )}

            {!isDuplicate && !isSuperseded && (isAdmin || isSuperAdmin) && (
              <div className="flex gap-3">
                <Button className="flex-1" onClick={handleResolve} disabled={isActioning}>
                  {isActioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Resolve Exception
                </Button>
                <Button variant="destructive" className="flex-1"
                  onClick={() => setDeclineDialogOpen(true)} disabled={isActioning}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Decline
                </Button>
              </div>
            )}

              </TabsContent>
              <TabsContent value="audit" className="p-4 mt-0">
                <InvoiceAuditTrail invoiceId={invoice.id} />
              </TabsContent>
              <TabsContent value="notes" className="p-4 mt-0">
                <InvoiceNotes invoiceId={invoice.id} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isDuplicate ? "Decline as Duplicate" : "Decline Invoice"}</DialogTitle>
            <DialogDescription>
              {isDuplicate
                ? "This will decline the duplicate. The original invoice is not affected."
                : "Provide a reason for declining this invoice."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              placeholder={isDuplicate ? "e.g. Same invoice submitted twice" : "e.g. Incorrect amount"}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeclineAsDuplicate} disabled={isActioning}>
              {isActioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isDuplicate ? "Decline as Duplicate" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
