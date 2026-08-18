import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { vendorsApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  ExternalLink,
  XCircle,
  AlertOctagon,
  Pencil,
  X,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/pocConfig";
import { ConfidenceBadge, anomalyToConfidence } from "@/components/ConfidenceBadge";
import { displayInvoiceNumber, sanitizeGlAccount } from "@/lib/utils";
import { InvoiceNotes } from "@/components/InvoiceNotes";
import { InvoiceAuditTrail } from "@/components/poc/InvoiceAuditTrail";
import { SupplementalAttachment } from "@/components/SupplementalAttachment";
import { AchRecordHint } from "@/components/AchRecordHint";
import { PdfPageManager } from "@/components/PdfPageManager";
import { PdfRedactor } from "@/components/PdfRedactor";
import { Files, ShieldAlert } from "lucide-react";


interface InvoiceDetail {
  id: string;
  variation_flags: string[] | null;
  invoice_number: string;
  total_amount: number;
  currency: string;
  invoice_date: string;
  due_date: string | null;
  due_date_defaulted: boolean | null;
  due_date_default_source: string | null;
  created_at: string;
  anomaly_score: number | null;
  status: string;
  raw_file_path: string | null;
  transaction_date: string | null;
  source_transaction_date: string | null;
  tax_flagged: boolean | null;
  tax_flag_reason: string | null;
  sanitized_filename: string | null;
  bad_file_flag: boolean;
  bad_file_reason: string | null;
  supplemental_pdf_count: number | null;
  gl_code: string | null;
  gl_approver: string | null;
  department_id: string | null;
  extraction_provider: string | null;
  reasoning_provider: string | null;
  raw_extraction_json: any;
  normalized_extraction_json: any;
  ach_routing_number: string | null;
  ach_account_number: string | null;
  vendor: {
    id: string;
    external_id: string | null;
    name: string;
    status: string;
  } | null;
}

export default function HighConfidenceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isChecker, isAdmin, isSuperAdmin, tenantId, user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceDetail[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  // Gate the "no invoices" screen on a successful load so a transient fetch
  // failure keeps the spinner (the 10s poll recovers) instead of claiming empty.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isActioning, setIsActioning] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // GL coding: Account (14-digit number, dashes allowed) + Approver (name).
  const [glAccount, setGlAccount] = useState<string>("");
  const [glApprover, setGlApprover] = useState<string>("");
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const prevInvoiceIdRef = useRef<string | null>(null);
  const [applyToAllVendorInvoices, setApplyToAllVendorInvoices] = useState(true);
  
  // Editable invoice fields
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editVendor, setEditVendor] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editAchRouting, setEditAchRouting] = useState("");
  const [editAchAccount, setEditAchAccount] = useState("");
  const [isFieldEditing, setIsFieldEditing] = useState(false);
  // Vendor re-link autocomplete (Items 31/38 — link invoice to existing vendor)
  const [vendorSearchResults, setVendorSearchResults] = useState<{id: string, name: string}[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  // The matched/linked vendor's ACH on record — used to auto-fill blank invoice
  // ACH fields and to show the "same as / differs from vendor record" hint.
  const [vendorAch, setVendorAch] = useState<{ routing: string | null; account: string | null } | null>(null);
  const [pdfManagerOpen, setPdfManagerOpen] = useState(false);
  const [redactorOpen, setRedactorOpen] = useState(false);
  const searchVendors = async (query: string) => {
    if (!query || query.length < 2) { setVendorSearchResults([]); setShowVendorDropdown(false); return; }
    const data = await vendorsApi.list({ search: query }).catch(() => []);
    if (data && data.length > 0) { setVendorSearchResults(data.slice(0, 8).map(v => ({ id: v.id, name: v.name }))); setShowVendorDropdown(true); }
    else { setVendorSearchResults([]); setShowVendorDropdown(false); }
  };

  /**
   * Load a vendor's on-record ACH details. When `fillBlanks` is set (used on a
   * manual re-link), any *blank* ACH edit field is filled from the record — an
   * extracted value is never overwritten; a difference is offered via the hint.
   */
  const loadVendorAch = async (vendorId: string, fillBlanks = false) => {
    const vendor = await vendorsApi.get(vendorId).catch(() => null);
    const routing = vendor ? ((vendor.ach_routing_number as string | null) ?? null) : null;
    const account = vendor ? ((vendor.ach_account_number as string | null) ?? null) : null;
    setVendorAch({ routing, account });
    if (fillBlanks) {
      setEditAchRouting((prev) => (prev.trim() ? prev : routing ?? ""));
      setEditAchAccount((prev) => (prev.trim() ? prev : account ?? ""));
    }
  };
  
  // Dialogs
  const [exceptionsDialogOpen, setExceptionsDialogOpen] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [exceptionsComment, setExceptionsComment] = useState("");
  const [declineComment, setDeclineComment] = useState("");

  const canApprove = isChecker || isAdmin || isSuperAdmin;
  const currentInvoice = invoices[currentIndex];

  useEffect(() => {
    fetchHighConfidenceInvoices();
  }, [tenantId]);

  useEffect(() => {
    if (!id) return;
    // Realtime push replaced by polling in the Azure rebuild.
    const timer = window.setInterval(() => fetchHighConfidenceInvoices(), 10_000);
    return () => window.clearInterval(timer);
  }, [id]);

  useEffect(() => {
    if (invoices.length === 0) return;

    if (id) {
      const idx = invoices.findIndex((inv) => inv.id === id);
      if (idx !== -1) {
        setCurrentIndex(idx);
        return;
      }
    }

    // If route id doesn't exist in the current list (e.g. filters changed), fall back safely
    if (currentIndex !== 0) setCurrentIndex(0);
  }, [id, invoices]);

  useEffect(() => {
    if (currentInvoice && currentInvoice.id !== prevInvoiceIdRef.current) {
      prevInvoiceIdRef.current = currentInvoice.id;
      setTimeout(() => fetchPdfUrl(), 100);
      setGlAccount(currentInvoice.gl_code || "");
      setGlApprover(currentInvoice.gl_approver || "");
      // Pre-fill missing GL coding from this vendor's last approved invoice.
      if (!currentInvoice.gl_code || !currentInvoice.gl_approver) {
        const invId = currentInvoice.id;
        invoicesApi
          .suggestedCoding(invId)
          .then((s) => {
            if (prevInvoiceIdRef.current !== invId) return;
            if (!currentInvoice.gl_code && s.glCode) setGlAccount(s.glCode);
            if (!currentInvoice.gl_approver && s.glApprover) setGlApprover(s.glApprover);
          })
          .catch(() => {});
      }
      setEditVendor(currentInvoice.vendor?.name || "");
      setEditAmount(currentInvoice.total_amount.toString());
      setEditInvoiceNumber(currentInvoice.invoice_number);
      setEditDate(currentInvoice.invoice_date || "");
      setEditAchRouting(currentInvoice.ach_routing_number || "");
      setEditAchAccount(currentInvoice.ach_account_number || "");
    }
  }, [currentInvoice?.id]);

  // Pull the matched vendor's ACH on record whenever the linked vendor changes,
  // so the "same as / differs from vendor record" hint has something to compare.
  useEffect(() => {
    const vendorId = currentInvoice?.vendor?.id;
    if (!vendorId) {
      setVendorAch(null);
      return;
    }
    loadVendorAch(vendorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentInvoice?.vendor?.id]);


  const fetchHighConfidenceInvoices = async () => {
    if (!tenantId) return;
    try {
      // High Confidence is the `submitted` status; the backend already routed
      // here, so this page shows the set as-is for prev/next navigation. It must
      // fetch the same status as the High Confidence list, or opening an invoice
      // from that list would land on a page that never loaded it.
      const rows = await invoicesApi.list({ status: QUEUE.highConfidence, limit: 500 });
      const data = rows.map((r) => ({
        ...r,
        vendors: r.vendor_name
          ? {
              id: r.vendor_id ?? "",
              external_id: (r as any).vendor_external_id ?? null,
              name: r.vendor_name,
              status: r.vendor_id ? ((r as any).vendor_status ?? "active") : "unverified",
              bank_verified: (r as any).vendor_bank_verified ?? false,
            }
          : null,
      }));

      setInvoices(data.map((inv: any): InvoiceDetail => ({
        id: inv.id,
        variation_flags: inv.variation_flags ?? null,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        currency: inv.currency,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date ?? null,
        due_date_defaulted: inv.due_date_defaulted ?? null,
        due_date_default_source: inv.due_date_default_source ?? null,
        created_at: inv.created_at,
        anomaly_score: inv.anomaly_score,
        status: inv.status,
        raw_file_path: inv.raw_file_path,
        transaction_date: inv.transaction_date ?? null,
        source_transaction_date: inv.source_transaction_date ?? null,
        tax_flagged: inv.tax_flagged ?? false,
        tax_flag_reason: inv.tax_flag_reason ?? null,
        sanitized_filename: inv.sanitized_filename ?? null,
        bad_file_flag: inv.bad_file_flag ?? false,
        bad_file_reason: inv.bad_file_reason ?? null,
        supplemental_pdf_count: inv.supplemental_pdf_count ?? 0,
        gl_code: inv.gl_code,
        gl_approver: inv.gl_approver ?? null,
        department_id: inv.department_id,
        extraction_provider: inv.extraction_provider,
        reasoning_provider: inv.reasoning_provider,
        raw_extraction_json: inv.raw_extraction_json,
        normalized_extraction_json: inv.normalized_extraction_json,
        ach_routing_number: inv.ach_routing_number ?? null,
        ach_account_number: inv.ach_account_number ?? null,
        vendor: inv.vendors,
      })));
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPdfUrl = async () => {
    if (!currentInvoice?.raw_file_path) {
      setPdfUrl(null);
      return;
    }

    try {
      setPdfUrl(await invoicesApi.fileUrl(currentInvoice.id));
    } catch (error) {
      setPdfUrl(null);
    }
  };

  const handleSaveChanges = async () => {
    if (!currentInvoice) return;

    setIsSavingChanges(true);
    try {
      // Update current invoice.
      // Item 31/38: if user selected an existing vendor from the dropdown, re-link this
      // invoice to that vendor. Only sets vendor_id when a selection was made, so a plain
      // text edit or no change never wipes the existing vendor link.
      await invoicesApi.update(currentInvoice.id, {
        glCode: glAccount.trim(),
        glApprover: glApprover.trim(),
        invoiceNumber: editInvoiceNumber.trim(),
        totalAmount: parseFloat(editAmount) || currentInvoice.total_amount,
        ...(editDate ? { invoiceDate: editDate } : {}),
        achRoutingNumber: editAchRouting.trim(),
        achAccountNumber: editAchAccount.trim(),
        // Vendor changes only via explicit selection from the dropdown.
        ...(selectedVendorId ? { vendorId: selectedVendorId } : {}),
      });
      // The server writes the audit entry (including any vendor re-link) in the
      // same transaction as the update.

      // Apply the same GL coding to every other invoice from this vendor.
      if (applyToAllVendorInvoices && currentInvoice.vendor?.id) {
        await vendorsApi
          .applyCoding(currentInvoice.vendor.id, {
            glCode: glAccount.trim() || null,
            glApprover: glApprover.trim() || null,
          })
          .catch((err) => console.error("Error updating vendor invoices:", err));
      }

      // Honest toast: describe only what actually changed.
      const glSet = !!(glAccount.trim() || glApprover.trim());
      let savedDescription: string;
      if (selectedVendorId && selectedVendorId !== currentInvoice.vendor?.id) {
        savedDescription = "Invoice re-linked to the selected vendor.";
      } else if (applyToAllVendorInvoices && glSet && currentInvoice.vendor?.name) {
        savedDescription = `GL coding updated for all ${currentInvoice.vendor.name} invoices.`;
      } else {
        savedDescription = "Invoice details updated for this invoice.";
      }
      toast({
        title: "Changes Saved",
        description: savedDescription,
      });
      
      setEditingField(null);
      setIsFieldEditing(false);
      fetchHighConfidenceInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message,
      });
    } finally {
      setIsSavingChanges(false);
    }
  };

  const handleApprove = async () => {
    if (!currentInvoice) return;

    setIsActioning(true);
    try {
      await invoicesApi.approve(currentInvoice.id);

      // Audit is written server-side in the same transaction.

      toast({
        title: "Invoice Approved",
        description: `Invoice ${currentInvoice.invoice_number} has been approved.`,
      });

      if (currentIndex < invoices.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
      fetchHighConfidenceInvoices();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: error.message,
      });
    } finally {
      setIsActioning(false);
    }
  };

  const handleRouteToExceptions = async () => {
    if (!currentInvoice) return;

    setIsActioning(true);
    try {
      await invoicesApi.escalate(
        currentInvoice.id,
        exceptionsComment || "Routed to Exceptions for investigation"
      );

      // Audit is written server-side in the same transaction.

      toast({
        title: "Routed to Exceptions",
        description: `Invoice ${currentInvoice.invoice_number} has been routed for investigation.`,
      });

      setExceptionsDialogOpen(false);
      setExceptionsComment("");

      if (currentIndex < invoices.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
      fetchHighConfidenceInvoices();
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

  const handleDecline = async () => {
    if (!currentInvoice) return;

    setIsActioning(true);
    try {
      await invoicesApi.decline(
        currentInvoice.id,
        declineComment || "Declined by reviewer"
      );

      // Audit is written server-side in the same transaction.

      toast({
        title: "Invoice Declined",
        description: `Invoice ${currentInvoice.invoice_number} has been declined.`,
      });

      setDeclineDialogOpen(false);
      setDeclineComment("");

      if (currentIndex < invoices.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
      fetchHighConfidenceInvoices();
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

  if (!hasLoaded) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (invoices.length === 0 || !currentInvoice) {
    return (
      <Layout>
        <div className="text-center py-20">
          <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h2 className="text-2xl font-bold mt-4">No High-Confidence Invoices</h2>
          <p className="text-muted-foreground mt-2">All invoices have been processed.</p>
          <Button className="mt-4" onClick={() => navigate("/high-confidence")}>
            Back to Queue
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Superseded Banner — shown when invoice auto-moved to Exceptions */}
        {currentInvoice?.status === 'exception' && currentInvoice?.variation_flags?.includes('superseded_by_new_submission') && (
          <div className="flex items-center gap-3 rounded-md border border-orange-400 bg-orange-50 px-4 py-3 text-orange-800">
            <AlertOctagon className="h-5 w-5 shrink-0 text-orange-500" />
            <div>
              <p className="font-semibold">This invoice was superseded by a new submission.</p>
              <p className="text-sm">It has been moved to Exceptions. Review the new invoice in the Low Confidence queue.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/high-confidence")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to List
              </Button>
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
  <h1 className="flex items-center gap-2 text-3xl font-bold">
    <CheckCircle2 className="h-8 w-8 text-success" />
              High-Confidence Review
  </h1>

  <div className="flex flex-wrap gap-2 -translate-y-2">
    <ConfidenceBadge score={anomalyToConfidence(currentInvoice.anomaly_score)} />
  </div>
</div>
           
            <p className="text-muted-foreground mt-1">
              Invoice {currentIndex + 1} of {invoices.length}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={currentIndex === 0}
              onClick={() => navigate(`/high-confidence/${invoices[currentIndex - 1].id}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentIndex === invoices.length - 1}
              onClick={() => navigate(`/high-confidence/${invoices[currentIndex + 1].id}`)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PDF Viewer */}
          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Document
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pdfUrl ? (
                <div className="space-y-3">
                  <object
                    key={pdfUrl}
                    data={pdfUrl}
                    type="application/pdf"
                    className="w-full h-[500px] rounded-lg border bg-muted overflow-auto"
                  >
                    <iframe
                      key={pdfUrl}
                      src={pdfUrl}
                      className="w-full h-[500px] rounded-lg border"
                      title="Invoice PDF"
                    />
                  </object>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPdfManagerOpen(true)}
                    >
                      <Files className="h-4 w-4 mr-2" />
                      Manage Pages
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRedactorOpen(true)}
                    >
                      <ShieldAlert className="h-4 w-4 mr-2" />
                      Redact
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[600px] bg-muted rounded-lg gap-3 p-6 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/50" />
                  <div className="space-y-1">
                    <p className="text-muted-foreground font-medium">Document processed successfully</p>
                    <p className="text-sm text-muted-foreground/70">
                      Preview will be available after publish.
                    </p>
                  </div>
                </div>
              )}
              <SupplementalAttachment
                invoiceId={currentInvoice.id}
                status={currentInvoice.status}
                supplementalCount={currentInvoice.supplemental_pdf_count}
                onAttached={fetchHighConfidenceInvoices}
                onInvoicePdfUpdated={fetchPdfUrl}
              />
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoice Details</CardTitle>
                  <CardDescription>{displayInvoiceNumber(currentInvoice.invoice_number)}</CardDescription>
                </div>
                {!isFieldEditing ? (
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditVendor(currentInvoice.vendor?.name || "");
                    setEditAmount(String(currentInvoice.total_amount));
                    setEditInvoiceNumber(currentInvoice.invoice_number);
                    setEditDate(currentInvoice.invoice_date || "");
                    // Show the invoice's own ACH as-is. We never silently stage the
                    // vendor's record here — opening the editor must not change (and
                    // then save) ACH the reviewer didn't touch. Filling a blank from
                    // the record is an explicit action: re-linking a vendor, or
                    // clicking "Use" in the record hint.
                    setEditAchRouting(currentInvoice.ach_routing_number || "");
                    setEditAchAccount(currentInvoice.ach_account_number || "");
                    setIsFieldEditing(true);
                  }} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => {
    setEditVendor(currentInvoice.vendor?.name || "");
    setEditAmount(String(currentInvoice.total_amount));
    setEditInvoiceNumber(currentInvoice.invoice_number);
    setEditDate(currentInvoice.invoice_date || "");
    setEditAchRouting(currentInvoice.ach_routing_number || "");
    setEditAchAccount(currentInvoice.ach_account_number || "");
    setGlAccount(currentInvoice.gl_code || "");
    setGlApprover(currentInvoice.gl_approver || "");

    setIsFieldEditing(false);
}} className="gap-1 text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              <Tabs defaultValue="review" className="w-full">
                <TabsList className="w-full rounded-none border-b bg-transparent h-auto p-0">
                  <TabsTrigger value="review" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm">Review</TabsTrigger>
                  <TabsTrigger value="audit" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm">Audit Trail</TabsTrigger>
                  <TabsTrigger value="notes" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm">Notes</TabsTrigger>
                </TabsList>
                <TabsContent value="review" className="p-4 space-y-4 mt-0">

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    {isFieldEditing ? (
  <div className="relative">
    <Input
      value={editVendor}
      onChange={(e) => {
        const val = e.target.value;
        setEditVendor(val);
        setSelectedVendorId(null);
        searchVendors(val);
      }}
      onFocus={(e) => searchVendors(e.target.value)}
      className="h-7 text-sm"
      placeholder="Type to search existing vendors..."
      autoComplete="off"
    />
    {showVendorDropdown && vendorSearchResults.length > 0 && (
      <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded shadow-md max-h-48 overflow-auto">
        {vendorSearchResults.map(v => (
          <button
            key={v.id}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
            onClick={() => {
              setEditVendor(v.name);
              setSelectedVendorId(v.id);
              setShowVendorDropdown(false);
              // Fill blank ACH from the newly linked vendor's record.
              void loadVendorAch(v.id, true);
            }}>
            {v.name}
          </button>
        ))}
      </div>
    )}
    {selectedVendorId && (
      <p className="text-xs text-green-600 mt-0.5">Will link to existing vendor</p>
    )}
    {!selectedVendorId && editVendor.trim() && editVendor.trim() !== (currentInvoice.vendor?.name || "") && (
      <p className="text-xs text-muted-foreground mt-0.5">Pick a vendor from the list to re-link. Typing a new name will not rename or create a vendor.</p>
    )}
  </div>
) : (
  <p className="font-medium text-sm">
    {currentInvoice.vendor?.name || "-"}
  </p>
)}
                    {currentInvoice.vendor?.id && (
                      <p className="text-xs text-muted-foreground mt-0.5">Vendor ID: {currentInvoice.vendor.external_id || "—"}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    {isFieldEditing ? (
                      <Input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-7 text-sm" type="number" step="0.01" />
                    ) : (
                      <p className="font-medium text-sm">{currentInvoice.currency} {currentInvoice.total_amount?.toLocaleString()}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Invoice #</p>
                    {isFieldEditing ? (
                      <Input value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} className="h-7 text-sm" />
                    ) : (
                      <p className="font-medium text-sm">{displayInvoiceNumber(currentInvoice.invoice_number)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Invoice Date</p>
                    {isFieldEditing ? (
                      <Input value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-7 text-sm" type="date" />
                    ) : (
                      <p className="font-medium text-sm">{currentInvoice.invoice_date ? (() => { const [y,m,d] = String(currentInvoice.invoice_date).split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); })() : '—'}</p>
                    )}
                  </div>
                </div>
                {/* ACH routing/account — editable in Edit mode. Ordered so both
                    ACH fields land in the LEFT column (Due Date sits between
                    them on the right), matching the Low Confidence detail. */}
                <div className="flex items-start gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">ACH Routing #</p>
                    {isFieldEditing ? (
                      <Input
                        value={editAchRouting}
                        onChange={(e) => setEditAchRouting(e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="9-digit routing number"
                      />
                    ) : (
                      <p className="font-medium text-sm font-mono">{currentInvoice?.ach_routing_number || '—'}</p>
                    )}
                    <AchRecordHint
                      value={isFieldEditing ? editAchRouting : currentInvoice?.ach_routing_number}
                      record={vendorAch?.routing}
                      onUseRecord={isFieldEditing ? setEditAchRouting : undefined}
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-medium">
                        {currentInvoice.due_date
                          ? (() => { const [y,m,d] = String(currentInvoice.due_date).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()
                          : "N/A"}
                      </p>
                      {currentInvoice.due_date_defaulted && (
                        <Badge
                          variant="outline"
                          className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs"
                        >
                          {currentInvoice.due_date_default_source === "invoice_date"
                            ? "Defaulted — calculated from invoice date"
                            : currentInvoice.due_date_default_source === "processing_date"
                            ? "Defaulted — calculated from processing date"
                            : "Defaulted — calculated from email receipt date"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">ACH Account #</p>
                    {isFieldEditing ? (
                      <Input
                        value={editAchAccount}
                        onChange={(e) => setEditAchAccount(e.target.value)}
                        className="h-7 text-sm font-mono"
                        placeholder="Account number"
                      />
                    ) : (
                      <p className="font-medium text-sm font-mono">{currentInvoice?.ach_account_number || '—'}</p>
                    )}
                    <AchRecordHint
                      value={isFieldEditing ? editAchAccount : currentInvoice?.ach_account_number}
                      record={vendorAch?.account}
                      onUseRecord={isFieldEditing ? setEditAchAccount : undefined}
                    />
                  </div>
                </div>
              </div>
            <Separator />
 {/* GL coding: Account + Approver */}
              <div className="space-y-4">
                <h4 className="font-semibold">Assignment</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="gl-account-input">GL Account</Label>
                    {isFieldEditing ? (
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
                    {isFieldEditing ? (
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
                
                  {/* Apply to all vendor invoices toggle */}
                  {currentInvoice.vendor?.name && (
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="apply-all-toggle" className="text-sm font-medium cursor-pointer">
                          Apply to all {currentInvoice.vendor.name} invoices
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
                        disabled={!isFieldEditing}
                      />
                    </div>
                  )}
                  
                  {isFieldEditing && (
    <Button
        onClick={handleSaveChanges}
        disabled={isSavingChanges}
        className="w-full"
    >
        {isSavingChanges && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        )}
        Save Changes
    </Button>
)}
              </div>
              <div className="field-row" style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                  Transaction Date
                </span>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  {currentInvoice.transaction_date
                    ? (() => { const [y,m,d] = String(currentInvoice.transaction_date).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()
                    : '—'}
                </span>
              </div>
              {currentInvoice.source_transaction_date && (
                <div className="field-row" style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                    Source Document Date
                  </span>
                  <span style={{ fontSize: '13px', color: '#9CA3AF', fontStyle: 'italic' }}>
                    {currentInvoice.source_transaction_date}
                  </span>
                  <span style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginTop: '2px' }}>
                    Note only — not used for processing
                  </span>
                </div>
              )}
              {currentInvoice.sanitized_filename && (
                <div className="field-row" style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                    System Filename
                  </span>
                  <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                    {currentInvoice.sanitized_filename}
                  </span>
                </div>
              )}
              {/* Processing Details removed from client view - retained in admin diagnostics */}

              {/* Actions */}
              {canApprove && (
                <div className="space-y-3">
                  <Button
                    onClick={handleApprove}
                    disabled={isActioning}
                    className="w-full"
                  >
                    {isActioning ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Approve
                  </Button>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setExceptionsDialogOpen(true)}
                      disabled={isActioning}
                      className="flex-1"
                    >
                      <AlertOctagon className="h-4 w-4 mr-2" />
                      Route to Exceptions
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setDeclineDialogOpen(true)}
                      disabled={isActioning}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                </div>
              )}
                </TabsContent>
                <TabsContent value="audit" className="p-4 mt-0">
                  {currentInvoice && (
                    <InvoiceAuditTrail invoiceId={currentInvoice.id} />
                  )}
                </TabsContent>
                <TabsContent value="notes" className="p-4 mt-0">
                  <InvoiceNotes invoiceId={currentInvoice.id} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Route to Exceptions Dialog */}
      <Dialog open={exceptionsDialogOpen} onOpenChange={setExceptionsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Route to Exceptions</DialogTitle>
            <DialogDescription>
              This invoice will be flagged for investigation. Add a note explaining the issue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="exceptions-comment">Investigation Notes</Label>
              <Textarea
                id="exceptions-comment"
                placeholder="Describe the issue or reason for escalation..."
                value={exceptionsComment}
                onChange={(e) => setExceptionsComment(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleRouteToExceptions}
              disabled={isActioning}
            >
              {isActioning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <AlertOctagon className="h-4 w-4 mr-2" />
              )}
              Route to Exceptions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Invoice</DialogTitle>
            <DialogDescription>
              This invoice will be declined and moved to the Declined queue. Add a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decline-comment">Reason for Decline</Label>
              <Textarea
                id="decline-comment"
                placeholder="Explain why this invoice is being declined..."
                value={declineComment}
                onChange={(e) => setDeclineComment(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDecline}
              disabled={isActioning}
            >
              {isActioning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currentInvoice && (
        <PdfPageManager
          open={pdfManagerOpen}
          onOpenChange={setPdfManagerOpen}
          invoiceId={currentInvoice.id}
          onDeleted={() => {
            fetchPdfUrl();
            fetchHighConfidenceInvoices();
          }}
        />
      )}

      {currentInvoice && (
        <PdfRedactor
          open={redactorOpen}
          onOpenChange={setRedactorOpen}
          invoiceId={currentInvoice.id}
          onRedacted={() => {
            fetchPdfUrl();
            fetchHighConfidenceInvoices();
          }}
        />
      )}
    </Layout>
  );
}
