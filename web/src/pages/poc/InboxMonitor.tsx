import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoicesApi, isInFlight, type Invoice } from "@/services/invoices";
import { displayInvoiceNumber } from "@/lib/utils";
import { invoiceRoute } from "@/lib/invoiceRoute";
import { Inbox, Loader2, Search, RefreshCcw } from "lucide-react";

/**
 * Inbox Monitor — visibility for invoices arriving from the email / Power
 * Automate pipeline (tagged `email_ingest` by the API, keyed off the X-Api-Key
 * auth channel; `email` is a legacy value).
 *
 * The problem this solves: the shared status chip collapses queued / processing
 * / validated / submitted into one "In Queue" label, so a pipeline invoice that
 * NEVER processed (corrupt file, never picked up) looks identical to a healthy
 * one awaiting review. This page shows the real health of each pipeline invoice
 * — Processing, Stuck, Extraction failed, In Review, done — so a bad delivery is
 * obvious at a glance. Manual (browser) uploads live on the Upload page instead.
 *
 * Read-only: reuses `GET /invoices` and filters to inbox-sourced rows client-side.
 */

/**
 * queued/processing older than this, with no result, is treated as stuck.
 * Normal processing finishes in ~15s, so a few minutes with no terminal status
 * is almost certainly stuck (worker died mid-run, or the job was never queued).
 */
const STUCK_AFTER_MIN = 3;

type Tone = "green" | "blue" | "amber" | "red" | "gray";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-green-100 text-green-700 border border-green-300",
  blue: "bg-blue-100 text-blue-700 border border-blue-300",
  amber: "bg-amber-50 text-amber-700 border border-amber-300",
  red: "bg-red-100 text-red-700 border border-red-300",
  gray: "bg-gray-100 text-gray-600 border border-gray-300",
};

/** Inbox = the email / Power Automate pipeline. `email` is a legacy tag value. */
function isInboxSource(source: string | undefined): boolean {
  return source === "email_ingest" || source === "email";
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

/** Compact elapsed label: seconds under a minute, then minutes, then hours. */
function elapsedLabel(mins: number): string {
  if (mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`;
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${Math.round(mins / 60)}h`;
}

type HealthKind = "processing" | "stuck" | "failed" | "review" | "done" | "other";

interface Health {
  /** Stable category for counting/icons — labels carry the elapsed time. */
  kind: HealthKind;
  label: string;
  tone: Tone;
  /** true for states that need attention (stuck / failed / exception). */
  attention: boolean;
}

function health(inv: Invoice): Health {
  const flags = inv.variation_flags ?? [];
  const failed = flags.includes("extraction_failed") || !!inv.processing_error;

  if (isInFlight(inv.status)) {
    const age = ageMinutes(inv.created_at);
    const el = elapsedLabel(age);
    if (age >= STUCK_AFTER_MIN) {
      return { kind: "stuck", label: `Stuck (${el})`, tone: "red", attention: true };
    }
    return { kind: "processing", label: `Processing… (${el})`, tone: "blue", attention: false };
  }

  switch (inv.status) {
    case "approved":
      return { kind: "done", label: "Approved", tone: "green", attention: false };
    case "rejected":
      return { kind: "done", label: "Declined", tone: "gray", attention: false };
    case "exception":
      return { kind: "failed", label: "Exception", tone: "red", attention: true };
    case "submitted":
      return { kind: "review", label: "In Review · High", tone: "blue", attention: false };
    case "validated":
      return failed
        ? { kind: "failed", label: "Extraction failed", tone: "red", attention: true }
        : { kind: "review", label: "In Review · Low", tone: "amber", attention: false };
    default:
      return { kind: "other", label: inv.status, tone: "gray", attention: false };
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
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // Bump on every poll so relative ages / stuck detection re-render live.
  const [, setTick] = useState(0);

  const fetchInvoices = async () => {
    try {
      // Newest first; one generous page covers the monitor's needs at this
      // volume (~18/hour). The API caps limit at 200.
      const rows = await invoicesApi.list({ limit: 200, order: "desc" });
      setInvoices(rows);
      setHasLoaded(true);
      setLastUpdated(Date.now());
    } catch (error) {
      console.error("Error fetching inbox invoices:", error);
    }
  };

  // Manual refresh, with visible feedback so the button never feels dead.
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchInvoices();
    } finally {
      setIsRefreshing(false);
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

  // This page is specifically the email / Power Automate pipeline, so it only
  // shows inbox-sourced invoices (the API tags them email_ingest from the
  // X-Api-Key auth channel). Manual browser uploads stay on the Upload page.
  const inboxInvoices = useMemo(
    () => invoices.filter((inv) => isInboxSource(inv.source)),
    [invoices]
  );

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return inboxInvoices;
    const term = searchTerm.toLowerCase();
    return inboxInvoices.filter(
      (inv) =>
        inv.vendor_name?.toLowerCase().includes(term) ||
        inv.invoice_number?.toLowerCase().includes(term) ||
        inv.original_filename?.toLowerCase().includes(term) ||
        inv.sender_email?.toLowerCase().includes(term) ||
        String(inv.total_amount ?? "").includes(term)
    );
  }, [inboxInvoices, searchTerm]);

  // Health summary across all inbox invoices, so the counts describe the
  // pipeline regardless of the text search.
  const summary = useMemo(() => {
    const s = { processing: 0, stuck: 0, failed: 0, review: 0, done: 0 };
    for (const inv of inboxInvoices) {
      const k = health(inv).kind;
      if (k === "processing") s.processing += 1;
      else if (k === "stuck") s.stuck += 1;
      else if (k === "failed") s.failed += 1;
      else if (k === "review") s.review += 1;
      else s.done += 1;
    }
    return s;
  }, [inboxInvoices]);

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
              Invoices from the email / Power Automate pipeline and their real
              processing status — spot stuck or failed deliveries at a glance.
              Auto-refreshes every 10s.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Updated {new Date(lastUpdated).toLocaleTimeString("en-US")}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Health summary */}
        <div className="flex flex-wrap gap-2">
          <SummaryChip n={summary.processing} label="Processing" tone="blue" />
          <SummaryChip n={summary.stuck} label="Stuck" tone="red" />
          <SummaryChip n={summary.failed} label="Failed / Exception" tone="red" />
          <SummaryChip n={summary.review} label="In Review" tone="amber" />
          <SummaryChip n={summary.done} label="Approved / Declined" tone="green" />
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendor, invoice #, sender, file…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inbox invoices ({filtered.length})</CardTitle>
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
                  {searchTerm ? "No matching invoices." : "No inbox invoices yet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Vendor / File</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Health</TableHead>
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
                        onClick={() => navigate(invoiceRoute(inv.status, inv.id))}
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
                        <TableCell className="font-medium">
                          <div>
                            {inv.vendor_name || (
                              <span className="text-muted-foreground">Unknown</span>
                            )}
                          </div>
                          {(inv.system_filename || inv.original_filename) && (
                            <div
                              className="text-xs text-muted-foreground truncate max-w-[240px]"
                              title={inv.system_filename || inv.original_filename || ""}
                            >
                              {inv.system_filename || inv.original_filename}
                            </div>
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
                            {h.kind === "processing" && (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            {h.label}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(invoiceRoute(inv.status, inv.id))}
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
