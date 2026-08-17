import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a bundled worker asset URL (works with rolldown-vite).
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Undo2, X } from "lucide-react";
import { invoicesApi } from "@/services/invoices";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPageManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  /** Called after pages are deleted so the parent can refetch the PDF/list. */
  onDeleted: () => void;
}

interface Thumb {
  page: number; // 1-based
  dataUrl: string;
}

/**
 * Page-management modal: renders each page of the invoice PDF as a thumbnail
 * (via pdf.js, reading bytes same-origin to avoid a blob CORS rule), lets the
 * reviewer mark pages for deletion, and applies the deletion server-side. It
 * only edits the stored PDF — extraction is not re-run.
 */
export function PdfPageManager({ open, onOpenChange, invoiceId, onDeleted }: PdfPageManagerProps) {
  const { toast } = useToast();
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [loading, setLoading] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setThumbs([]);
    setMarked(new Set());

    (async () => {
      try {
        const blob = await invoicesApi.fileBytes(invoiceId);
        const data = new Uint8Array(await blob.arrayBuffer());
        const doc = await pdfjsLib.getDocument({ data }).promise;

        const rendered: Thumb[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push({ page: n, dataUrl: canvas.toDataURL("image/png") });
          if (!cancelled) setThumbs([...rendered]); // progressive reveal
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Could not load pages",
            description: (err as Error)?.message ?? "Failed to render the PDF.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const toggle = (page: number) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });

  const apply = async () => {
    if (marked.size === 0) return;
    if (marked.size >= thumbs.length) {
      toast({
        variant: "destructive",
        title: "Can't delete every page",
        description: "Keep at least one page on the invoice.",
      });
      return;
    }
    setSaving(true);
    try {
      await invoicesApi.deletePages(invoiceId, [...marked].sort((a, b) => a - b));
      toast({
        title: "Pages deleted",
        description: `${marked.size} page${marked.size === 1 ? "" : "s"} removed from the document.`,
      });
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: (err as Error)?.message ?? "Could not delete the pages.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage pages</DialogTitle>
          <DialogDescription>
            Click a page to mark it for deletion, then apply. This updates the stored
            PDF only — it does not re-run extraction, so review the fields afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {loading && thumbs.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {thumbs.map((t) => {
                const isMarked = marked.has(t.page);
                return (
                  <button
                    key={t.page}
                    type="button"
                    onClick={() => toggle(t.page)}
                    className={cn(
                      "group relative overflow-hidden rounded-md border bg-muted/30 p-1 text-left transition-all hover:border-primary/60",
                      isMarked && "border-destructive ring-1 ring-destructive"
                    )}
                    title={isMarked ? "Click to keep this page" : "Click to delete this page"}
                  >
                    <img
                      src={t.dataUrl}
                      alt={`Page ${t.page}`}
                      className={cn("w-full rounded-sm border bg-white", isMarked && "opacity-40")}
                    />
                    <div className="mt-1 flex items-center justify-between px-0.5">
                      <span className="text-xs text-muted-foreground">Page {t.page}</span>
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full",
                          isMarked
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-muted text-muted-foreground opacity-0 group-hover:opacity-100"
                        )}
                      >
                        {isMarked ? <Undo2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      </span>
                    </div>
                    {isMarked && (
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
                        Delete
                      </span>
                    )}
                  </button>
                );
              })}
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center">
          <span className="mr-auto text-sm text-muted-foreground">
            {marked.size} marked for deletion
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={apply} disabled={saving || marked.size === 0}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete {marked.size > 0 ? marked.size : ""} page{marked.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
