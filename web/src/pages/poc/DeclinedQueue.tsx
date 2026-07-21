import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { Loader2, XCircle, Eye, Building2, Search } from "lucide-react";
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
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchDeclinedInvoices(0, true);
  }, [dateFilter]);

  useEffect(() => {
    if (page > 0) fetchDeclinedInvoices(page, false);
  }, [page]);

  const fetchDeclinedInvoices = async (pageNum: number, reset: boolean) => {
    if (reset) setIsLoading(true);
    try {
      // Legacy status 'rejected' is 'declined' in the new schema.
      const rows = await invoicesApi.list({
        status: QUEUE.declined,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      });

      // Date filtering is applied client-side for now; if these queues grow,
      // move it into the API as a query parameter.
      const cutoff = (() => {
        const d = new Date();
        if (dateFilter === "today") {
          d.setHours(0, 0, 0, 0);
          return d;
        }
        if (dateFilter === "week") {
          d.setDate(d.getDate() - 7);
          return d;
        }
        if (dateFilter === "month") {
          d.setDate(d.getDate() - 30);
          return d;
        }
        return null;
      })();

      const filtered = cutoff
        ? rows.filter((inv) => new Date(inv.updated_at) >= cutoff)
        : rows;

      const mapped = filtered.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number ?? "",
        total_amount: Number(inv.total_amount),
        currency: inv.currency,
        created_at: inv.created_at,
        updated_at: inv.updated_at,
        // Renamed: checker_comment → decline_reason
        checker_comment: (inv as { decline_reason?: string | null }).decline_reason ?? null,
        vendor: inv.vendor_id ? { id: inv.vendor_id, name: inv.vendor_name ?? "—" } : null,
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

  const filteredInvoices = invoices.filter(inv => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.vendor?.name?.toLowerCase().includes(q) ||
      inv.checker_comment?.toLowerCase().includes(q)
    );
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <XCircle className="h-8 w-8 text-destructive" />
            Declined
          </h1>
          <p className="text-muted-foreground mt-1">
            Rejected invoices for audit and traceability ({filteredInvoices.length}{hasMore ? "+" : ""})
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by vendor, invoice #, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Declined Invoices ({filteredInvoices.length}{hasMore ? "+" : ""})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <XCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">No declined invoices</p>
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
                  {filteredInvoices.map((invoice) => (
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
