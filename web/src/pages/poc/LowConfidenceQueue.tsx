import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { vendorsApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { getReasonLabels } from "@/lib/invoiceReasons";
import { displayInvoiceNumber, sanitizeGlAccount } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  AlertCircle,
  ExternalLink,
  Edit,
  History,
  AlertOctagon,
  Pencil,
  X,
  Save,
} from "lucide-react";
import { format } from "date-fns";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/lib/pocConfig";
import { ConfidenceBadge, anomalyToConfidence } from "@/components/ConfidenceBadge";
import { MakerEditForm } from "@/components/poc/MakerEditForm";
import { InvoiceAuditTrail } from "@/components/poc/InvoiceAuditTrail";
import { InvoiceNotes } from "@/components/InvoiceNotes";
import { DuplicateBadge, DuplicateType } from "@/components/poc/DuplicateBadge";
import { DuplicateWarningCard } from "@/components/poc/DuplicateWarningCard";
import { SupplementalAttachment } from "@/components/SupplementalAttachment";


interface InvoiceDetail {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  invoice_date: string;
  due_date: string | null;
  due_date_defaulted: boolean | null;
  due_date_default_source: string | null;
  created_at: string;
  anomaly_score: number | null;
  variation_flags: string[] | null;
  status: string;
  raw_file_path: string | null;
  transaction_date: string | null;
  source_transaction_date: string | null;
  tax_flagged: boolean | null;
  tax_flag_reason: string | null;
  sanitized_filename: string | null;
  sender_email: string | null;
  bad_file_flag: boolean;
  bad_file_reason: string | null;
  document_type: string | null;
  supplemental_pdf_count: number | null;
  duplicate_type: DuplicateType;
  duplicate_of: string | null;
  gl_code: string | null;
  gl_approver: string | null;
  department_id: string | null;
  extraction_provider: string | null;
  reasoning_provider: string | null;
  system_filename: string | null;
  ach_routing_number: string | null;
  ach_account_number: string | null;
  vendor: {
    id: string;
    name: string;
    status: string;
    bank_verified: boolean;
  } | null;
}

interface PreviousInvoice {
  invoice_number: string;
  total_amount: number;
  currency: string;
  invoice_date: string;
}

interface DuplicateOriginal {
  id: string;
  invoice_number: string;
  status: string;
}


export default function LowConfidenceQueue() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isChecker, isAdmin, isSuperAdmin, isMaker, tenantId, user } = useAuth();
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<InvoiceDetail[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousInvoice, setPreviousInvoice] = useState<PreviousInvoice | null>(null);
  const [duplicateOriginal, setDuplicateOriginal] = useState<DuplicateOriginal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [exceptionsDialogOpen, setExceptionsDialogOpen] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [exceptionsComment, setExceptionsComment] = useState("");
  const [declineComment, setDeclineComment] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isFieldEditing, setIsFieldEditing] = useState(false);
  
  // GL coding: Account (14-digit number, dashes allowed) + Approver (name).
  const [glAccount, setGlAccount] = useState<string>("");
  const [glApprover, setGlApprover] = useState<string>("");
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [applyToAllVendorInvoices, setApplyToAllVendorInvoices] = useState(true);
  const [editFields, setEditFields] = useState<{
    vendor_name: string;
    total_amount: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    ach_routing_number: string;
    ach_account_number: string;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [vendorSearchResults, setVendorSearchResults] = useState<{id: string, name: string}[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const prevInvoiceIdRef = useRef<string | null>(null);

  const searchVendors = async (query: string) => {
    if (!query || query.length < 2) { setVendorSearchResults([]); setShowVendorDropdown(false); return; }
    const data = await vendorsApi.list({ search: query }).catch(() => []);
    if (data && data.length > 0) { setVendorSearchResults(data.slice(0, 8).map(v => ({ id: v.id, name: v.name }))); setShowVendorDropdown(true); }
    else { setVendorSearchResults([]); setShowVendorDropdown(false); }
  };

  const startEdit = () => {
    if (!currentInvoice) return;
    setEditFields({
      vendor_name: currentInvoice.vendor?.name || "",
      total_amount: String(currentInvoice.total_amount),
      invoice_number: currentInvoice.invoice_number,
      invoice_date: currentInvoice.invoice_date || "",
      due_date: currentInvoice.due_date || "",
      ach_routing_number: currentInvoice.ach_routing_number || "",
      ach_account_number: currentInvoice.ach_account_number || "",
    });
    setIsFieldEditing(true);
  };

  const cancelEdit = () => {
    setIsFieldEditing(false);
    setEditFields(null);
    setShowVendorDropdown(false);
    setVendorSearchResults([]);
  };

  const saveEdit = async () => {
    if (!currentInvoice || !editFields || !user) return;
    setIsSavingEdit(true);
    try {
      const changes: { field: string; old_value: any; new_value: any }[] = [];
      if (editFields.invoice_number !== currentInvoice.invoice_number)
        changes.push({ field: "invoice_number", old_value: currentInvoice.invoice_number, new_value: editFields.invoice_number });
      if (parseFloat(editFields.total_amount) !== currentInvoice.total_amount)
        changes.push({ field: "total_amount", old_value: currentInvoice.total_amount, new_value: parseFloat(editFields.total_amount) });
      if (editFields.invoice_date !== currentInvoice.invoice_date)
        changes.push({ field: "invoice_date", old_value: currentInvoice.invoice_date, new_value: editFields.invoice_date });
      if (editFields.due_date !== (currentInvoice.due_date || ""))
        changes.push({ field: "due_date", old_value: currentInvoice.due_date, new_value: editFields.due_date });
      // Only record a vendor change when the user actually linked to a different existing vendor
      // (selectedVendorId set via dropdown). Free-typed text is not a vendor change.
      if (selectedVendorId && editFields.vendor_name !== (currentInvoice.vendor?.name || ""))
        changes.push({ field: "vendor_name", old_value: currentInvoice.vendor?.name, new_value: editFields.vendor_name });
      if (editFields.ach_routing_number !== (currentInvoice.ach_routing_number || ""))
        changes.push({ field: "ach_routing_number", old_value: currentInvoice.ach_routing_number, new_value: editFields.ach_routing_number });
      if (editFields.ach_account_number !== (currentInvoice.ach_account_number || ""))
        changes.push({ field: "ach_account_number", old_value: currentInvoice.ach_account_number, new_value: editFields.ach_account_number });

      // Filename uses the ACTUAL vendor name: the linked vendor's name if one was selected,
      // otherwise the current vendor's real name — never unsaved free-typed text.
      const effectiveVendorName = selectedVendorId ? editFields.vendor_name : (currentInvoice.vendor?.name || "");
      const updatedVendorName = effectiveVendorName.trim().toUpperCase() || "UNKNOWN VENDOR";
      const updatedInvoiceNumber = editFields.invoice_number.replace(/[^a-zA-Z0-9]/g, "");
      const updatedAmountCents = Math.round(parseFloat(editFields.total_amount) * 100);
      const updatedFilename = `${updatedVendorName} Inv ${updatedInvoiceNumber} Amt ${updatedAmountCents}.pdf`;

      if (changes.length === 0 && !selectedVendorId) {
        // Still update system_filename even if no field changes
        await invoicesApi.update(currentInvoice.id, { systemFilename: updatedFilename });
        cancelEdit();
        fetchLowConfidenceInvoices();
        return;
      }

      await invoicesApi.update(currentInvoice.id, {
        invoiceNumber: editFields.invoice_number,
        totalAmount: parseFloat(editFields.total_amount),
        ...(editFields.invoice_date ? { invoiceDate: editFields.invoice_date } : {}),
        ...(editFields.due_date ? { dueDate: editFields.due_date } : {}),
        systemFilename: updatedFilename,
        ...(editFields.ach_routing_number ? { achRoutingNumber: editFields.ach_routing_number } : {}),
        ...(editFields.ach_account_number ? { achAccountNumber: editFields.ach_account_number } : {}),
        // Vendor changes only via explicit selection from the dropdown.
        ...(selectedVendorId ? { vendorId: selectedVendorId } : {}),
      });

      // Vendor is changed ONLY by selecting an existing vendor from the dropdown (sets vendor_id above).
      // Typing a name without selecting must NEVER rename the master vendor record — that would
      // rewrite the vendor across every linked invoice. Free-typed text with no selection is ignored.

      // The server writes the 'fields_edited' audit entry inside the same
      // transaction as the update, so no client-side audit insert is needed.
      // A vendor re-link is captured in that entry's metadata.

      toast({ title: "Invoice updated", description: `${changes.length} field(s) saved.` });
      // Optimistic update: patch the current invoice in local state immediately
      // so the UI reflects new values without waiting for a refetch (prevents flicker).
      setInvoices(prev => prev.map((inv, idx) =>
        idx === currentIndex
          ? {
              ...inv,
              invoice_number: editFields.invoice_number,
              total_amount: parseFloat(editFields.total_amount),
              invoice_date: editFields.invoice_date || inv.invoice_date,
              due_date: editFields.due_date || inv.due_date,
              system_filename: updatedFilename,
              ach_routing_number: editFields.ach_routing_number || null,
              ach_account_number: editFields.ach_account_number || null,
              ...(selectedVendorId ? { vendor: { ...inv.vendor!, id: selectedVendorId, name: editFields.vendor_name } } : {}),
            }
          : inv
      ));
      setIsFieldEditing(false);
      setEditFields(null);
      setShowVendorDropdown(false);
      setVendorSearchResults([]);
      // Background sync to keep list consistent
      fetchLowConfidenceInvoices();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const canApprove = isChecker || isAdmin || isSuperAdmin;
  const canEdit = isMaker;
  const currentInvoice = id ? invoices.find(inv => inv.id === id) ?? invoices[currentIndex] : invoices[currentIndex];
  
  const isHardDuplicate = currentInvoice?.duplicate_type === "hard";
  const canApproveThisInvoice = canApprove && (!isHardDuplicate || isAdmin || isSuperAdmin);

  useEffect(() => {
    if (!tenantId) return;
    fetchLowConfidenceInvoices();
  }, [tenantId]);

  // Removed: unconditional mount fetch caused double-fetch race condition with tenantId effect

  // Realtime push was replaced by polling in the Azure rebuild. Invoices are
  // processed by a background worker, so the queue still fills in on its own —
  // it just arrives on the next poll rather than being pushed. At this volume
  // (~18 invoices/hour) a 10-second poll is indistinguishable in practice and
  // removes an entire service from the stack.
  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchLowConfidenceInvoices();
    }, 10_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (id && invoices.length > 0) {
      const idx = invoices.findIndex((inv) => inv.id === id);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    }
  }, [id, invoices]);

  useEffect(() => {
    if (currentInvoice && currentInvoice.id !== prevInvoiceIdRef.current) {
      prevInvoiceIdRef.current = currentInvoice.id;
      setPdfUrl(null);
      fetchPreviousInvoice();
      fetchDuplicateOriginal();
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
    }
  }, [currentInvoice]);

  // Removed: this effect was overriding URL-based navigation from list view
  // currentIndex is now synced from URL id via the effect above

  const fetchLowConfidenceInvoices = async () => {
    console.log("[LC Debug] fetchLowConfidenceInvoices called, tenantId:", tenantId);
    try {
      // The API returns every invoice column, so the same fields are available
      // as before; only the transport changed.
      const rows = await invoicesApi.list({ status: QUEUE.lowConfidence, limit: 500 });
      const data = rows
        .map((r) => ({
          ...r,
          vendors: r.vendor_name
            ? {
                id: r.vendor_id ?? "",
                name: r.vendor_name,
                // Status comes from the joined vendor row. Without one, the
                // name is only a snapshot and the vendor is not approved.
                status: r.vendor_id ? ((r as any).vendor_status ?? "active") : "unverified",
                bank_verified: (r as any).vendor_bank_verified ?? false,
              }
            : null,
        }));

      // Low Confidence is exactly the `validated` status — the backend already
      // routed here. This detail page shows the set as-is for prev/next
      // navigation, matching the Low Confidence list; re-deriving it would let
      // the list and this page disagree on which invoices exist.
      const mapped = data.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_amount: inv.total_amount,
        currency: inv.currency,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date ?? null,
        due_date_defaulted: inv.due_date_defaulted ?? null,
        due_date_default_source: inv.due_date_default_source ?? null,
        created_at: inv.created_at,
        anomaly_score: inv.anomaly_score,
        variation_flags: inv.variation_flags,
        status: inv.status,
        raw_file_path: inv.raw_file_path,
        transaction_date: inv.transaction_date ?? null,
        source_transaction_date: inv.source_transaction_date ?? null,
        tax_flagged: inv.tax_flagged ?? false,
        tax_flag_reason: inv.tax_flag_reason ?? null,
        sanitized_filename: inv.sanitized_filename ?? null,
        sender_email: inv.sender_email ?? null,
        bad_file_flag: inv.bad_file_flag ?? false,
        bad_file_reason: inv.bad_file_reason ?? null,
        document_type: inv.document_type ?? null,
        supplemental_pdf_count: inv.supplemental_pdf_count ?? 0,
        duplicate_type: inv.duplicate_type as DuplicateType,
        duplicate_of: inv.duplicate_of,
        gl_code: inv.gl_code,
        gl_approver: inv.gl_approver ?? null,
        department_id: inv.department_id,
        extraction_provider: inv.extraction_provider,
        reasoning_provider: inv.reasoning_provider,
        system_filename: inv.system_filename ?? null,
        ach_routing_number: inv.ach_routing_number ?? null,
        ach_account_number: inv.ach_account_number ?? null,
        vendor: inv.vendors,
      }));
      setInvoices(mapped);
      // Cache the result for this tenant
      try {
        const cacheKey = `lc_invoices_${tenantId}`;
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: mapped, ts: Date.now() }));
      } catch {}
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPreviousInvoice = async () => {
    if (!currentInvoice?.vendor?.id) {
      setPreviousInvoice(null);
      return;
    }

    try {
      // Most recent non-duplicate invoice for the same vendor.
      const rows = await invoicesApi.list({ limit: 50 });
      const prior = rows.find(
        (r) =>
          r.vendor_id === currentInvoice.vendor?.id &&
          r.id !== currentInvoice.id &&
          !r.duplicate_type
      );
      setPreviousInvoice(
        prior
          ? {
              invoice_number: prior.invoice_number ?? "",
              total_amount: Number(prior.total_amount),
              currency: prior.currency,
              invoice_date: prior.invoice_date ?? "",
            }
          : null
      );
    } catch (error) {
      console.error("Error fetching previous invoice:", error);
    }
  };

  const fetchDuplicateOriginal = async () => {
    if (!currentInvoice?.duplicate_of) {
      setDuplicateOriginal(null);
      return;
    }

    try {
      const original = await invoicesApi.get(currentInvoice.duplicate_of);
      setDuplicateOriginal(
        original
          ? {
              id: original.id,
              invoice_number: original.invoice_number ?? "",
              status: original.status,
            }
          : null
      );
    } catch (error) {
      console.error("Error fetching duplicate original:", error);
    }
  };

  const fetchPdfUrl = async () => {
    if (!currentInvoice?.raw_file_path) {
      setPdfUrl(null);
      return;
    }

    try {
      // The API issues a short-lived SAS URL; the container is never public.
      setPdfUrl(await invoicesApi.fileUrl(currentInvoice.id));
    } catch (error) {
      setPdfUrl(null);
    }
  };

  const handleSaveChanges = async () => {
    if (!currentInvoice) return;

    setIsSavingChanges(true);
    try {
      // Update current invoice's GL coding (Account + Approver).
      await invoicesApi.update(currentInvoice.id, {
        glCode: glAccount.trim(),
        glApprover: glApprover.trim(),
      });

      // Also apply the same GL coding to ALL invoices from this vendor (if toggle is ON)
      if (applyToAllVendorInvoices && currentInvoice.vendor?.id) {
        await vendorsApi
          .applyCoding(currentInvoice.vendor.id, {
            glCode: glAccount.trim() || null,
            glApprover: glApprover.trim() || null,
          })
          .catch((err) => console.error("Error updating vendor invoices:", err));
      }

      // Honest toast: only claim GL coding updated when it actually has values.
      const glSet = !!(glAccount.trim() || glApprover.trim());
      let savedDescription: string;
      if (applyToAllVendorInvoices && glSet && currentInvoice.vendor?.name) {
        savedDescription = `GL coding updated for all ${currentInvoice.vendor.name} invoices.`;
      } else if (glSet) {
        savedDescription = "GL coding updated for this invoice.";
      } else {
        savedDescription = "Changes saved for this invoice.";
      }
      toast({
        title: "Changes Saved",
        description: savedDescription,
      });

      fetchLowConfidenceInvoices();
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

  const advanceToNext = () => {
    if (currentIndex < invoices.length - 1) {
      navigate(`/poc/low-confidence/${invoices[currentIndex + 1].id}`);
    } else {
      // No more invoices, go back to list
      navigate("/poc/low-confidence");
    }
  };

  const handleSubmit = async () => {
    if (!currentInvoice) return;
    setIsActioning(true);
    try {
      // Status change and audit entry now happen in one server transaction.
      await invoicesApi.submitForApproval(currentInvoice.id);
      toast({
        title: "Submitted for Approval",
        description: `Invoice ${currentInvoice.invoice_number} has been submitted to Checker.`,
      });
      navigate("/poc/low-confidence");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message,
      });
    } finally {
      setIsActioning(false);
    }
  };

  const handleApproveAsDuplicate = async () => {
    if (!currentInvoice) return;
    setIsActioning(true);
    try {
      // The server sets approved_at/transaction_date and writes the audit entry
      // in the same transaction — the client no longer stamps its own timestamps.
      await invoicesApi.approve(
        currentInvoice.id,
        `Approved as duplicate (${currentInvoice.duplicate_type ?? "duplicate"})`
      );
      toast({ title: "Approved as Duplicate", description: `Invoice ${currentInvoice.invoice_number} approved as duplicate.` });
      fetchLowConfidenceInvoices().then(() => { advanceToNext(); });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Approval Failed", description: error.message });
    } finally {
      setIsActioning(false);
    }
  };

  const handleApprove = async () => {
    if (!currentInvoice) return;

    setIsActioning(true);
    try {
      await invoicesApi.approve(currentInvoice.id);

      toast({
        title: "Invoice Approved",
        description: `Invoice ${currentInvoice.invoice_number} has been approved.`,
      });

      // Auto-advance to next invoice
      fetchLowConfidenceInvoices().then(() => {
        advanceToNext();
      });
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

      toast({
        title: "Routed to Exceptions",
        description: `Invoice ${currentInvoice.invoice_number} has been routed for investigation.`,
      });

      setExceptionsDialogOpen(false);
      setExceptionsComment("");

      // Auto-advance to next invoice
      fetchLowConfidenceInvoices().then(() => {
        advanceToNext();
      });
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
      // Legacy status 'rejected' is 'declined' in the new schema. The server
      // requires a reason and records it with the status change.
      await invoicesApi.decline(
        currentInvoice.id,
        declineComment || "Declined by reviewer"
      );

      toast({
        title: "Invoice Declined",
        description: `Invoice ${currentInvoice.invoice_number} has been declined.`,
      });

      setDeclineDialogOpen(false);
      setDeclineComment("");

      // Auto-advance to next invoice
      fetchLowConfidenceInvoices().then(() => {
        advanceToNext();
      });
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

  const getLowConfidenceReasons = () => {
    if (!currentInvoice) return [];
    return getReasonLabels(currentInvoice);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (invoices.length === 0) {
    return (
      <Layout>
        <div className="text-center py-20">
          <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h2 className="text-2xl font-bold mt-4">No Low-Confidence Invoices</h2>
          <p className="text-muted-foreground mt-2">All invoices are ready for batch approval.</p>
          <Link to="/poc/high-confidence">
            <Button className="mt-4">Go to High-Confidence Queue</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/poc/low-confidence")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to List
              </Button>
            </div>
            <div className="flex flex-wrap items-baseline gap-3">
  <h1 className="flex items-center gap-2 text-3xl font-bold">
    <AlertTriangle className="h-8 w-8 text-warning" />
    Low-Confidence Review
  </h1>

  <div className="flex flex-wrap gap-2 -translate-y-2">
    {getLowConfidenceReasons().map((reason, idx) => (
      <Badge
        key={idx}
        className="rounded-full bg-amber-50 text-amber-700 border border-amber-300"
      >
        {reason}
      </Badge>
    ))}
  </div>
</div>
            <p className="text-muted-foreground mt-1">
              Invoice {currentIndex + 1} of {invoices.length} requiring review
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={currentIndex === 0}
              onClick={() => navigate(`/poc/low-confidence/${invoices[currentIndex - 1].id}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentIndex === invoices.length - 1}
              onClick={() => navigate(`/poc/low-confidence/${invoices[currentIndex + 1].id}`)}
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
                  <div className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
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
              {currentInvoice && (
                <SupplementalAttachment
                  invoiceId={currentInvoice.id}
                  status={currentInvoice.status}
                  supplementalCount={currentInvoice.supplemental_pdf_count}
                  onAttached={fetchLowConfidenceInvoices}
                  onInvoicePdfUpdated={fetchPdfUrl}
                />
              )}
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoice Details</CardTitle>
                  <CardDescription>{displayInvoiceNumber(currentInvoice?.invoice_number)}</CardDescription>
                </div>
                {!isFieldEditing ? (
                  <Button variant="outline" size="sm" onClick={startEdit} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1 text-muted-foreground">
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
                  <Building2 className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    {isFieldEditing && editFields ? (
                      <div className="relative">
                        <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary" value={editFields.vendor_name}
                          onChange={e => {
                            const val = e.target.value;
                            setEditFields({...editFields, vendor_name: val});
                            setSelectedVendorId(null);
                            searchVendors(val);
                          }}
                          onFocus={e => searchVendors(e.target.value)}
                          placeholder="Type to search existing vendors..."
                          autoComplete="off" />
                        {showVendorDropdown && vendorSearchResults.length > 0 && (
                          <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded shadow-md max-h-48 overflow-auto">
                            {vendorSearchResults.map(v => (
                              <button
                                key={v.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                                onClick={() => {
                                  setEditFields({...editFields, vendor_name: v.name});
                                  setSelectedVendorId(v.id);
                                  setShowVendorDropdown(false);
                                }}>
                                {v.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedVendorId && (
                          <p className="text-xs text-green-600 mt-0.5">Will link to existing vendor</p>
                        )}
                        {!selectedVendorId && editFields?.vendor_name?.trim() && editFields.vendor_name.trim() !== (currentInvoice.vendor?.name || "") && (
                          <p className="text-xs text-muted-foreground mt-0.5">Pick a vendor from the list to re-link. Typing a new name will not rename or create a vendor.</p>
                        )}
                      </div>
                    ) : (
                      <p className="font-medium">{currentInvoice?.vendor?.name || "Unknown"}</p>
                    )}
                    {currentInvoice?.vendor?.id && (
                      <p className="text-xs text-muted-foreground mt-0.5">ID: {currentInvoice.vendor.id}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    {isFieldEditing && editFields ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={editFields.total_amount}
                        onChange={e => setEditFields({...editFields, total_amount: e.target.value})} />
                    ) : (
                      <p className="font-medium">{currentInvoice?.currency} {currentInvoice?.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Invoice #</p>
                    {isFieldEditing && editFields ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary" value={editFields.invoice_number}
                        onChange={e => setEditFields({...editFields, invoice_number: e.target.value})} />
                    ) : (
                      <p className="font-medium">{displayInvoiceNumber(currentInvoice?.invoice_number)}</p>
                    )}
                  </div>
                </div>
                {currentInvoice?.document_type && currentInvoice.document_type !== 'invoice' && (
                  <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-1" />
                    <div className="flex-1">
                      <p className="text-xs text-red-500 font-medium">Document Type</p>
                      <p className="font-medium text-red-700 capitalize">{currentInvoice.document_type.replace(/_/g, ' ')} — This may not be a payable invoice</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Invoice Date</p>
                    {isFieldEditing && editFields ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary" type="date" value={editFields.invoice_date}
                        onChange={e => setEditFields({...editFields, invoice_date: e.target.value})} />
                    ) : (
                      <p className="font-medium">
                        {currentInvoice?.invoice_date
                          ? (() => { const [y,m,d] = String(currentInvoice.invoice_date).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()
                          : "N/A"}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">ACH Routing #</p>
                    {isFieldEditing && editFields ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono" type="text" value={editFields.ach_routing_number}
                        onChange={e => setEditFields({...editFields, ach_routing_number: e.target.value})} placeholder="9-digit routing number" />
                    ) : (
                      <p className="font-medium font-mono">{currentInvoice?.ach_routing_number || '—'}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    {isFieldEditing && editFields ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary" type="date" value={editFields.due_date}
                        onChange={e => setEditFields({...editFields, due_date: e.target.value})} />
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {currentInvoice?.due_date
                            ? (() => { const [y,m,d] = String(currentInvoice.due_date).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()
                            : "N/A"}
                        </p>
                        {currentInvoice?.due_date_defaulted && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                            {currentInvoice.due_date_default_source === "invoice_date"
                              ? "Defaulted — calculated from invoice date"
                              : currentInvoice.due_date_default_source === "processing_date"
                              ? "Defaulted — calculated from processing date"
                              : "Defaulted — calculated from email receipt date"}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">ACH Account #</p>
                    {isFieldEditing && editFields ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary font-mono" type="text" value={editFields.ach_account_number}
                        onChange={e => setEditFields({...editFields, ach_account_number: e.target.value})} placeholder="Account number" />
                    ) : (
                      <p className="font-medium font-mono">{currentInvoice?.ach_account_number || '—'}</p>
                    )}
                  </div>
                </div>
{/* GL coding: Account + Approver */}
              {/* Assignment */}
<div className="col-span-2 border-t pt-4 mt-2">
  <h4 className="font-semibold mb-4">Assignment</h4>

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

  {currentInvoice?.vendor?.name && (
    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/50 mt-4">
      <div className="space-y-0.5">
        <Label
          htmlFor="apply-all-toggle"
          className="text-sm font-medium cursor-pointer"
        >
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
</div>
              </div>
              {isFieldEditing && (
  <Button
    onClick={async () => {
      await saveEdit();
      await handleSaveChanges();
    }}
    disabled={isSavingEdit || isSavingChanges}
    className="w-full mt-2"
  >
    {(isSavingEdit || isSavingChanges) ? (
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
    ) : (
      <Save className="h-4 w-4 mr-2" />
    )}
    Save Changes
  </Button>
)}

              <div className="field-row" style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                  Transaction Date
                </span>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  {currentInvoice?.transaction_date
                    ? (() => { const [y,m,d] = String(currentInvoice.transaction_date).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()
                    : '—'}
                </span>
              </div>
              {currentInvoice?.source_transaction_date && (
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
              {(currentInvoice?.system_filename || currentInvoice?.sanitized_filename) && (
                <div className="field-row" style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                    System Filename
                  </span>
                  <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                    {currentInvoice.system_filename || currentInvoice.sanitized_filename}
                  </span>
                </div>
              )}
              {currentInvoice?.sender_email && (
                <div className="field-row" style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '2px' }}>
                    Received From
                  </span>
                  <span style={{ fontSize: '13px', color: '#374151' }}>
                    {currentInvoice.sender_email}
                  </span>
                </div>
              )}

              

              {/* Duplicate Warning Card */}
              {currentInvoice?.duplicate_type && (
                <>
                  <DuplicateWarningCard
                    duplicateType={currentInvoice.duplicate_type}
                    duplicateOfId={currentInvoice.duplicate_of}
                    duplicateOfNumber={duplicateOriginal?.invoice_number}
                    duplicateOfStatus={duplicateOriginal?.status}
                    isAdmin={isAdmin || isSuperAdmin}
                    isChecker={isChecker}
                    isMaker={isMaker}
                    onDeclineAsDuplicate={() => setDeclineDialogOpen(true)}
                  />
                 
                </>
              )}

             
              

              

              {/* Previous Invoice Comparison */}
              {previousInvoice && (
                <>
                 
                  <div>
                    <h4 className="font-semibold mb-2">Last Invoice from Vendor</h4>
                    <div className="bg-muted rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Invoice #</span>
                        <span>{previousInvoice.invoice_number}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">Amount</span>
                        <span>
                          {previousInvoice.currency} {previousInvoice.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">Invoice Date</span>
                        <span>{(() => { const [y,m,d] = String(previousInvoice.invoice_date).split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); })()}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

             

              {/* Actions */}
              {(canApprove || canEdit) && (
                <div className="space-y-3">
                  {currentInvoice?.duplicate_type && currentInvoice?.duplicate_type !== 'possible_duplicate' ? (
                    <div className="flex gap-3">
                      <Button
                        variant="destructive"
                        onClick={handleApproveAsDuplicate}
                        disabled={isActioning}
                        className="flex-1"
                      >
                        {isActioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Approve as Duplicate
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setDeclineDialogOpen(true)}
                        disabled={isActioning}
                        className="flex-1 opacity-80"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Decline as Duplicate
                      </Button>
                    </div>
                  ) : (
                    <>
                      {canApprove && (
                      <Button
                        onClick={handleApprove}
                        disabled={isActioning || !canApproveThisInvoice}
                        className="w-full"
                      >
                        {isActioning ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      )}
                      {canApprove && <div className="flex gap-3">
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
                      </div>}
                    </>
                  )}
                </div>
              )}



                </TabsContent>
                <TabsContent value="audit" className="p-4 mt-0">
                  {currentInvoice && (
                    <InvoiceAuditTrail invoiceId={currentInvoice.id} />
                  )}
                </TabsContent>
                <TabsContent value="notes" className="p-4 mt-0">
                  {currentInvoice && (
                    <InvoiceNotes invoiceId={currentInvoice.id} />
                  )}
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
    </Layout>
  );
}
