import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Shield, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { invoicesApi, type Invoice } from "@/services/invoices";
import { activityApi } from "@/services";
import { invoiceStatusLabel } from "@/lib/invoiceStatus";
import {
  DateRangePresetFilter,
  presetToRange,
  DEFAULT_DATE_PRESET,
  type DatePreset,
} from "@/components/DateRangePresetFilter";

// The meaningful states a reviewer filters on: an invoice awaiting a decision
// (submitted), one escalated (exception), or one already settled (approved /
// declined). Intake states (queued/processing/validated) are omitted.
const STATUSES: { value: string; label: string }[] = [
  { value: "submitted", label: "In Queue" },
  { value: "exception", label: "Exception" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Declined" },
];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "declined" || status === "rejected" || status === "exception") return "destructive";
  return "outline";
}

function actionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "approved":
      return "default";
    case "declined":
    case "deleted":
    case "routed_to_exception":
      return "destructive";
    case "uploaded":
    case "processed":
      return "secondary";
    default:
      return "outline";
  }
}

/** Internal invoice statuses → the queue names the rest of the app shows. */
function queueLabel(status: unknown): string {
  switch (status) {
    case "validated":
      return "Low Confidence";
    case "submitted":
      return "High Confidence";
    case "exception":
      return "Exceptions";
    case "approved":
      return "Approved";
    case "rejected":
    case "declined":
      return "Declined";
    default:
      return String(status ?? "—");
  }
}

/**
 * Turn one audit row into a readable line. The metadata is a raw JSON blob;
 * this maps the events that matter — the automatic routing to a confidence
 * queue, and every move into and out of Exceptions — into plain English, so the
 * invoice's journey reads as a story rather than a dump of internal fields.
 */
function describeAudit(e: {
  action: string;
  metadata: Record<string, unknown> | null;
}): { label: string; detail: string | null } {
  const m = e.metadata ?? {};
  const conf =
    typeof m.confidence === "number" ? ` · ${Math.round(m.confidence * 100)}% confidence` : "";

  switch (e.action) {
    case "uploaded":
      return { label: "Uploaded", detail: typeof m.filename === "string" ? m.filename : null };
    case "processed":
      // The system's routing decision — which confidence queue it landed in.
      return { label: `Routed to ${queueLabel(m.status)}`, detail: conf ? conf.slice(3) : null };
    case "returned_to_review":
      return {
        label: "Returned to review",
        detail: `${queueLabel(m.from)} → ${queueLabel(m.to ?? "validated")}`,
      };
    case "returned_to_submitter":
      return { label: "Returned to submitter", detail: (m.reason as string) || null };
    case "routed_to_exception":
      return {
        label: "Moved to Exceptions",
        detail: [queueLabel(m.from) + " → Exceptions", m.reason].filter(Boolean).join(" · "),
      };
    case "submitted_for_approval":
      return { label: "Sent for approval", detail: `${queueLabel(m.from)} → Approval` };
    case "approved":
      return { label: "Approved", detail: (m.note as string) || null };
    case "declined":
      return { label: "Declined", detail: (m.reason as string) || null };
    case "superseded":
      return { label: "Superseded by a newer upload", detail: null };
    case "note_added":
      return { label: "Note added", detail: null };
    case "supplemental_added":
      return { label: "Document attached", detail: (m.filename as string) || null };
    case "supplemental_removed":
      return { label: "Document removed", detail: null };
    default:
      return { label: e.action.replace(/_/g, " "), detail: null };
  }
}

/** The per-invoice history dialog. */
function InvoiceHistory({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-audit", invoice.id],
    queryFn: () => activityApi.audit(invoice.id),
  });

  // The full journey, including the system's automatic routing to a confidence
  // queue and every move in and out of Exceptions. System events have no actor
  // and render as "System".
  const entries = data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoice.invoice_number || "Invoice"} — history
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground -mt-2 mb-2">
          {invoice.vendor_name || "Unknown vendor"} · {invoice.currency} {invoice.total_amount}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No history recorded for this invoice.</p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-5 py-2">
            {entries.map((e) => {
              const { label, detail } = describeAudit(e);
              return (
                <li key={e.id} className="ml-4">
                  <div className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={actionVariant(e.action)}>{label}</Badge>
                    {(e.metadata as Record<string, unknown> | null)?.self_approved === true && (
                      <Badge variant="destructive" className="text-[10px]">self-approved</Badge>
                    )}
                    {/* Email for a person, "System" for automatic events. */}
                    <span className="text-sm font-medium">{e.actor_name || "System"}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.created_at), "PPp")}
                    </span>
                  </div>
                  {detail && (
                    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AuditConsole() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
  const [selected, setSelected] = useState<Invoice | null>(null);

  const dateRange = presetToRange(datePreset);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["audit-invoices", search, status, datePreset],
    queryFn: () =>
      invoicesApi.list({
        limit: 500,
        // Newest-first, filtered on upload time — consistent with every queue.
        dateField: "created_at",
        order: "desc",
        ...(search ? { search } : {}),
        ...(status ? { status: status as Invoice["status"] } : {}),
        ...(dateRange.from ? { dateFrom: dateRange.from } : {}),
        ...(dateRange.to ? { dateTo: dateRange.to } : {}),
      }),
  });

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Audit Trail</h1>
            <p className="text-muted-foreground">
              Select an invoice to see who uploaded it, who approved it, and every action taken
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1 md:min-w-[16rem]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by invoice number or vendor…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="md:w-44">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePresetFilter value={datePreset} onChange={setDatePreset} label="Uploaded" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : !invoices || invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelected(inv)}
                    >
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{inv.vendor_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inv.currency} {inv.total_amount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.created_at ? format(new Date(inv.created_at), "yyyy-MM-dd HH:mm") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {selected && <InvoiceHistory invoice={selected} onClose={() => setSelected(null)} />}
    </Layout>
  );
}
