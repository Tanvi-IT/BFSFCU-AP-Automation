import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { invoicesApi, type Invoice } from "@/services/invoices";
import { ArrowLeft, ExternalLink, FileText, Loader2 } from "lucide-react";

/**
 * Credit Memo detail — a document viewer, not a review screen.
 *
 * There is no data workflow for credit memos yet: this simply shows the stored
 * PDF (via the short-lived `GET /invoices/{id}/file` URL). No fields are
 * extracted or displayed for now.
 */
export default function CreditMemoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [memo, setMemo] = useState<Invoice | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const [invoice, url] = await Promise.all([
          invoicesApi.get(id),
          invoicesApi.fileUrl(id).catch(() => null),
        ]);
        if (!active) return;
        setMemo(invoice);
        setPdfUrl(url);
      } catch (err) {
        if (active) setError((err as Error)?.message || "Could not load the credit memo.");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/credit-memos")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Credit Memos
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !memo ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {error || "Credit memo not found."}
            </CardContent>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
                <FileText className="h-6 w-6 text-muted-foreground" />
                {memo.original_filename || "Credit Memo"}
              </h1>
              <p className="text-muted-foreground mt-1">
                Credit memo ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/New_York",
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                }).format(new Date(memo.created_at))}
              </p>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5" />
                  Document
                </CardTitle>
                {pdfUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in New Tab
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {pdfUrl ? (
                  <object
                    key={pdfUrl}
                    data={pdfUrl}
                    type="application/pdf"
                    className="w-full h-[75vh] rounded-lg border bg-muted overflow-auto"
                  >
                    <iframe
                      key={pdfUrl}
                      src={pdfUrl}
                      className="w-full h-[75vh] rounded-lg border"
                      title="Credit Memo PDF"
                    />
                  </object>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    The document could not be loaded.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
