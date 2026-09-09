import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { invoicesApi, type Invoice } from "@/services/invoices";
import { Files, FileText, Loader2, Search } from "lucide-react";

/**
 * Non-Invoice list.
 *
 * Documents the worker classifies as neither a payable invoice nor a credit
 * memo (purchase orders, statements, remittance advices, etc.) are parked here.
 * No fields are extracted — this lists the stored files and opens them. Fetches
 * `GET /invoices?documentType=non_invoice`.
 */
export default function NonInvoiceList() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Invoice[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchDocs = async () => {
    try {
      const rows = await invoicesApi.list({ documentType: "non_invoice", limit: 500 });
      setDocs(rows);
      setHasLoaded(true);
    } catch (error) {
      console.error("Error fetching non-invoice documents:", error);
    }
  };

  useEffect(() => {
    void fetchDocs();
    // The worker fills this list in the background, so poll like the queues do.
    const timer = window.setInterval(() => void fetchDocs(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return docs;
    const term = searchTerm.toLowerCase();
    return docs.filter(
      (m) =>
        (m.original_filename?.toLowerCase().includes(term) ?? false) ||
        (m.created_at?.includes(term) ?? false)
    );
  }, [docs, searchTerm]);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <Files className="h-8 w-8 text-muted-foreground" />
            Non-Invoice
          </h1>
          <p className="text-muted-foreground mt-1">
            Documents that are not invoices or credit memos ({docs.length})
          </p>
        </div>

        {/* Search */}
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
            <CardTitle>Non-Invoice Documents ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasLoaded ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Files className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">
                  {searchTerm ? "No matching documents found" : "No non-invoice documents yet"}
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
                  {filtered.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/non-invoices/${doc.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-[360px]">
                            {doc.original_filename || "Document"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.source === "email_ingest" || doc.source === "email" ? "Inbox" : "Upload"}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: "America/New_York",
                          month: "short",
                          day: "2-digit",
                          year: "numeric",
                        }).format(new Date(doc.created_at))}
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
