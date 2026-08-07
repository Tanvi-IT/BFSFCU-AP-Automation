import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoicesApi, isInFlight, type Invoice } from "@/services/invoices";
import { displayInvoiceNumber } from "@/lib/utils";
import { Inbox, Loader2, Search, RefreshCcw } from "lucide-react";

/**
 * Inbox Monitor — visibility for invoices arriving from the email / Power
 * Automate inbox.
 *
 * The problem this solves: the shared status chip collapses queued / processing
 * / validated / submitted into one "In Queue" label, so a machine-ingested
 * invoice that NEVER processed (corrupt file, never picked up) looks identical
 * to a healthy one awaiting review. This page shows the real health of each
 * ingested invoice — Processing, Stuck, Extraction failed, In Review, done —
 * and surfaces the processing error, so a bad delivery is obvious at a glance.
 *
 * Read-only: it reuses `GET /invoices` (which returns every column, including
 * `source` and `processing_error`) and filters client-side. No API change.
 */

/** queued/processing older than this, with no result, is treated as stuck. */
const STUCK_AFTER_MIN = 10;

type Tone = "green" | "blue" | "amber" | "red" | "gray";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-green-100 text-green-700 border border-green-300",
  blue: "bg-blue-100 text-blue-700 border border-blue-300",
  amber: "bg-amber-50 text-amber-700 border border-amber-300",
  red: "bg-red-100 text-red-700 border border-red-300",
  gray: "bg-gray-100 text-gray-600 border border-gray-300",
};

type SourceFilter = "inbox" | "api" | "all";

function isInboxSource(source: string | undefined): boolean {
  return source === "email_ingest" || source === "email";
}
function isApiSource(source: string | undefined): boolean {
  return source === "api_ingest" || source === "api";
}
function sourceLabel(source: string | undefined): string {
  if (isInboxSource(source)) return "Inbox";
  if (isApiSource(source)) return "API";
  if (source === "manual_upload") return "Manual";
  return source ?? "—";
}

function ageMinutes(createdAt: string | undefined): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return (Date.now() - t) / 60_000;
}

function relativeAge(createdAt: string | undefined): string {
  const mins = ageMinutes(createdAt);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface Health {
  label: string;
  tone: Tone;
  /** true for states that need attention (stuck / failed / exception). */
  attention: boolean;
  detail?: string;
}

function health(inv: Invoice): Health {
  const flags = inv.variation_flags ?? [];
  const failed = flags.includes("extraction_failed") || !!inv.processing_error;

  if (isInFlight(inv.status)) {
    const age = ageMinutes(inv.created_at);
    if (age >= STUCK_AFTER_MIN) {
      return {
        label: "Stuck",
        tone: "red",
        attention: true,
        detail: `No result after ${Math.round(age)} min — never finished processing`,
      };
    }
    return { label: "Processing…", tone: "blue", attention: false };
  }

  switch (inv.status) {
    case "approved":
      return { label: "Approved", tone: "green", attention: false };
    case "rejected":
      return { label: "Declined", tone: "gray", attention: false };
    case "exception":
      return { label: "Exception", tone: "red", attention: true };
    case "submitted":
      return { label: "In Review · High", tone: "blue", attention: false };
    case "validated":
      return failed
        ? {
            label: "Extraction failed",
            tone: "red",
            attention: true,
            detail: inv.processing_error || "No data could be extracted from the file",
          }
        : { label: "In Review · Low", tone: "amber", attention: false };
    default:
      return { label: inv.status, tone: "gray", attention: false };
  }
}

const money = (currency: string | undefined, amount: unknown): string => {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  return `${currency ?? "USD"} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function InboxMonitor() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [source, setSource] = useState<SourceFilter>("inbox");
  const [searchTerm, setSearchTerm] = useState("");
  // Bump on every poll so relative ages / stuck detection re-render live.
  const [, setTick] = useState(0);

  const fetchInvoices = async () => {
    try {
      // Newest first; one generous page covers the monitor's needs at this
      // volume (~18/hour). The API caps limit at 200.
      const rows = await invoicesApi.list({ limit: 200, order: "desc" });
      setInvoices(rows);
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching inbox invoices:", error);
    }
  };

  useEffect(() => {
    void fetchInvoices();
    const timer = window.setInterval(() => {
      void fetchInvoices();
      setTick((t) => t + 1);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const sourceFiltered = useMemo(
    () =>
      invoices.filter((inv) => {
        if (source === "inbox") return isInboxSource(inv.source);
        if (source === "api") return isApiSource(inv.source);
        return true;
      }),
    [invoices, source]
  );

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return sourceFiltered;
    const term = searchTerm.toLowerCase();
    return sourceFiltered.filter(
      (inv) =>
        inv.vendor_name?.toLowerCase().includes(term) ||
        inv.invoice_number?.toLowerCase().includes(term) ||
        inv.original_filename?.toLowerCase().includes(term) ||
        inv.sender_email?.toLowerCase().includes(term) ||
        String(inv.total_amount ?? "").includes(term)
    );
  }, [sourceFiltered, searchTerm]);

  // Health summary across the (source-filtered) set, so the counts describe the
  // inbox regardless of the text search.
  const summary = useMemo(() => {
    const s = { processing: 0, stuck: 0, failed: 0, review: 0, done: 0 };
    for (const inv of sourceFiltered) {
      const h = health(inv);
      if (h.label === "Processing…") s.processing += 1;
      else if (h.label === "Stuck") s.stuck += 1;
      else if (h.label === "Extraction failed" || h.label === "Exception") s.failed += 1;
      else if (h.label.startsWith("In Review")) s.review += 1;
      else s.done += 1;
    }
    return s;
  }, [sourceFiltered]);

  const SourceButton = ({ value, label }: { value: SourceFilter; label: string }) => (
    <Button
      variant={source === value ? "default" : "outline"}
      size="sm"
      onClick={() => setSource(value)}
    >
      {label}
    </Button>
  );

  const SummaryChip = ({ n, label, tone }: { n: number; label: string; tone: Tone }) => (
    <div className={`rounded-lg px-3 py-2 text-sm ${TONE_CLASS[tone]}`}>
      <span className="font-semibold">{n}</span> {label}
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Inbox className="h-8 w-8 text-primary" />
              Inbox Monitor
            </h1>
            <p className="text-muted-foreground mt-1">
              Invoices received from the email / Power Automate inbox and their real
              processing status. Auto-refreshes every 10s.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchInvoices()} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Health summary */}
        <div className="flex flex-wrap gap-2">
          <SummaryChip n={summary.processing} label="Processing" tone="blue" />
          <SummaryChip n={summary.stuck} label="Stuck" tone="red" />
          <SummaryChip n={summary.failed} label="Failed / Exception" tone="red" />
          <SummaryChip n={summary.review} label="In Review" tone="amber" />
          <SummaryChip n={summary.done} label="Approved / Declined" tone="green" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <SourceButton value="inbox" label="Inbox" />
            <SourceButton value="api" label="API" />
            <SourceButton value="all" label="All sources" />
          </div>
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendor, invoice #, sender, file…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {source === "inbox" ? "Inbox" : source === "api" ? "API" : "All"} invoices (
              {filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasLoaded ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">
                  {searchTerm ? "No matching invoices." : "No invoices from this source yet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const h = health(inv);
                    return (
                      <TableRow
                        key={inv.id}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          h.attention ? "bg-red-50/40" : ""
                        }`}
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                      >
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm">{relativeAge(inv.created_at)}</div>
                          <div className="text-xs text-muted-foreground">
                            {inv.created_at
                              ? new Date(inv.created_at).toLocaleString("en-US", {
                                  month: "short",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                            {sourceLabel(inv.source)}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {inv.vendor_name || (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>{displayInvoiceNumber(inv.invoice_number)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {money(inv.currency, inv.total_amount)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                              TONE_CLASS[h.tone]
                            }`}
                          >
                            {h.label === "Processing…" && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            {h.label}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {h.detail || inv.original_filename || "—"}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
