import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DateRangePresetFilter,
  presetToRange,
  DEFAULT_DATE_PRESET,
  type DatePreset,
} from "@/components/DateRangePresetFilter";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { Loader2, XCircle, Eye, Search } from "lucide-react";
import { format } from "date-fns";

interface DeclinedInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  checker_comment: string | null;
  vendor: {
    id: string;
    name: string;
  } | null;
}

const PAGE_SIZE = 25;

export default function DeclinedQueue() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<DeclinedInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
  const dateRange = presetToRange(datePreset);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Debounced so typing a vendor name is one query, not one per keystroke.
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setAppliedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // Any filter change invalidates the accumulated pages, so start over at 0.
  useEffect(() => {
    setPage(0);
    fetchDeclinedInvoices(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, dateRange.from, dateRange.to]);

  useEffect(() => {
    if (page > 0) fetchDeclinedInvoices(page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchDeclinedInvoices = async (pageNum: number, reset: boolean) => {
    if (reset) setIsLoading(true);
    try {
      // Legacy status 'rejected' is 'declined' in the new schema.
      //
      // Search and date range are applied server-side, against `updated_at` —
      // the timestamp of the decline, which is the "Declined Date" column. Doing
      // it here in the browser would only ever filter the pages already loaded,
      // so an old invoice would stay invisible until you had clicked Load More
      // past it.
      const rows = await invoicesApi.list({
        status: QUEUE.declined,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
        dateField: "updated_at",
        order: "asc",
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(dateRange.from ? { dateFrom: dateRange.from } : {}),
        ...(dateRange.to ? { dateTo: dateRange.to } : {}),
      });

      const mapped = rows.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number ?? "",
        total_amount: Number(inv.total_amount),
        currency: inv.currency,
        created_at: inv.created_at,
        updated_at: inv.updated_at,
        // The decline reason is written to checker_comment (decline_reason is a
        // legacy, unused column — reading it showed "No reason provided").
        checker_comment: (inv as { checker_comment?: string | null }).checker_comment ?? null,
        // Name, not vendor_id: a vendor removed by a later list upload must not
        // blank out the payee on invoices already decided.
        vendor: inv.vendor_name ? { id: inv.vendor_id ?? "", name: inv.vendor_name } : null,
      }));

      if (reset) {
        setInvoices(mapped);
      } else {
        setInvoices(prev => [...prev, ...mapped]);
      }
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching declined invoices:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <XCircle className="h-8 w-8 text-destructive" />
            Declined
          </h1>
          <p className="text-muted-foreground mt-1">
            Rejected invoices for audit and traceability ({invoices.length}{hasMore ? "+" : ""})
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[16rem] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by vendor, invoice #, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <DateRangePresetFilter value={datePreset} onChange={setDatePreset} label="Declined" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Declined Invoices ({invoices.length}{hasMore ? "+" : ""})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <XCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">
                  {appliedSearch || dateRange.from || dateRange.to
                    ? "No declined invoices match these filters"
                    : "No declined invoices"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Declined Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.vendor?.name || "Unknown"}
                      </TableCell>
                      <TableCell>{invoice.invoice_number}</TableCell>
                      <TableCell>
                        {invoice.currency} {invoice.total_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.updated_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs max-w-[200px] truncate">
                          {invoice.checker_comment || "No reason provided"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/invoices/${invoice.id}?from=declined`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button variant="outline" onClick={() => setPage(prev => prev + 1)}>
                  Load More
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
