import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invoicesApi, type Invoice } from "@/services/invoices";
import { FileText, Loader2, Search } from "lucide-react";

type ParkedTab = "credit_memo" | "non_invoice";

const TAB_LABELS: Record<ParkedTab, { title: string; empty: string }> = {
  credit_memo: { title: "Credit Memos", empty: "No credit memos yet" },
  non_invoice: { title: "Non-Invoices", empty: "No non-invoice documents yet" },
};

/**
 * Credit Memo section.
 *
 * Documents the worker classifies out of the invoice pipeline (from the
 * Document Intelligence OCR) are parked here — credit memos on one tab,
 * everything else that isn't a payable invoice on the Non-Invoices tab. No
 * fields are extracted; this just lists the stored files and opens them.
 * Fetches `GET /invoices?documentType=credit_memo|non_invoice`.
 */
export default function CreditMemoList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ParkedTab>("credit_memo");
  const [lists, setLists] = useState<Record<ParkedTab, Invoice[]>>({ credit_memo: [], non_invoice: [] });
  const [loaded, setLoaded] = useState<Record<ParkedTab, boolean>>({ credit_memo: false, non_invoice: false });
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAll = async () => {
    await Promise.all(
      (["credit_memo", "non_invoice"] as ParkedTab[]).map(async (t) => {
        try {
          const rows = await invoicesApi.list({ documentType: t, limit: 500 });
          setLists((prev) => ({ ...prev, [t]: rows }));
          setLoaded((prev) => ({ ...prev, [t]: true }));
        } catch (error) {
          console.error(`Error fetching ${t}:`, error);
        }
      })
    );
  };

  useEffect(() => {
    void fetchAll();
    // The worker fills these lists in the background, so poll like the queues do.
    const timer = window.setInterval(() => void fetchAll(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = lists[tab];
  const hasLoaded = loaded[tab];
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (m) =>
        (m.original_filename?.toLowerCase().includes(term) ?? false) ||
        (m.created_at?.includes(term) ?? false)
    );
  }, [rows, searchTerm]);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <FileText className="h-8 w-8 text-muted-foreground" />
            Credit Memo
          </h1>
          <p className="text-muted-foreground mt-1">
            Documents parked out of the invoice pipeline — view the original file.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ParkedTab)}>
          <TabsList>
            <TabsTrigger value="credit_memo">
              Credit Memos ({lists.credit_memo.length})
            </TabsTrigger>
            <TabsTrigger value="non_invoice">
              Non-Invoices ({lists.non_invoice.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
          <CardContent className="p-0">
            {!hasLoaded ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">
                  {searchTerm ? "No matching documents found" : TAB_LABELS[tab].empty}
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
                      onClick={() => navigate(`/credit-memos/${doc.id}`)}
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
