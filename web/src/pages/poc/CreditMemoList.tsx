import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { invoicesApi, type Invoice } from "@/services/invoices";
import { FileText, Loader2, Search } from "lucide-react";

/**
 * Credit Memo list.
 *
 * Credit memos are classified out of the invoice pipeline by the worker (from
 * the Document Intelligence OCR) and parked here. No fields are extracted for
 * now — this simply lists the stored files and opens them. Fetches
 * `GET /invoices?documentType=credit_memo`.
 */
export default function CreditMemoList() {
  const navigate = useNavigate();
  const [memos, setMemos] = useState<Invoice[]>([]);
  // True only after a fetch has SUCCEEDED at least once, so a transient failure
  // keeps the spinner (and the poll recovers) instead of flashing "none".
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchMemos = async () => {
    try {
      const rows = await invoicesApi.list({ documentType: "credit_memo", limit: 500 });
      setMemos(rows);
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching credit memos:", error);
    }
  };

  useEffect(() => {
    void fetchMemos();
    // The worker fills this list in the background, so poll like the queues do.
    const timer = window.setInterval(() => void fetchMemos(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return memos;
    const term = searchTerm.toLowerCase();
    return memos.filter((m) =>
      (m.original_filename?.toLowerCase().includes(term) ?? false) ||
      (m.created_at?.includes(term) ?? false)
    );
  }, [memos, searchTerm]);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <FileText className="h-8 w-8 text-muted-foreground" />
            Credit Memo
          </h1>
          <p className="text-muted-foreground mt-1">
            Documents classified as credit memos ({memos.length})
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by file name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Credit Memos ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasLoaded ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">
                  {searchTerm ? "No matching credit memos found" : "No credit memos yet"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((memo) => (
                    <TableRow
                      key={memo.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/credit-memos/${memo.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-[360px]">
                            {memo.original_filename || "Document"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {memo.source === "email_ingest" || memo.source === "email"
                          ? "Inbox"
                          : "Upload"}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: "America/New_York",
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
                        }).format(new Date(memo.created_at))}
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
