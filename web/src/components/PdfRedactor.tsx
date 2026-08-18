import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
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
import { Loader2, ShieldAlert, X } from "lucide-react";
import { invoicesApi } from "@/services/invoices";
import { useToast } from "@/hooks/use-toast";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfRedactorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  /** Called after redaction so the parent can refetch the PDF/list. */
  onRedacted: () => void;
}

/** A redaction box in page-relative coordinates (0..1). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pg {
  page: number; // 1-based
  dataUrl: string;
}
interface Drag {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MIN_SIZE = 0.01; // ignore accidental tiny drags

/**
 * Redaction editor. Renders each PDF page (pdf.js, bytes fetched same-origin),
 * lets the reviewer drag black boxes over content, and on apply FLATTENS every
 * page that has a box into an image with the bars burned in — so the covered
 * text is permanently removed, not just hidden. Server rebuilds the PDF with
 * those pages replaced. It does not re-run extraction.
 */
export function PdfRedactor({ open, onOpenChange, invoiceId, onRedacted }: PdfRedactorProps) {
  const { toast } = useToast();
  const [pages, setPages] = useState<Pg[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rects, setRects] = useState<Record<number, Rect[]>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPages([]);
    setRects({});
    setDrag(null);
    dragRef.current = null;

    (async () => {
      try {
        const blob = await invoicesApi.fileBytes(invoiceId);
        const data = new Uint8Array(await blob.arrayBuffer());
        const doc = await pdfjsLib.getDocument({ data }).promise;

        const out: Pg[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          out.push({ page: n, dataUrl: canvas.toDataURL("image/jpeg", 0.92) });
          if (!cancelled) setPages([...out]);
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

  const norm = (e: React.MouseEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onDown = (e: React.MouseEvent, page: number) => {
    if (saving) return;
    e.preventDefault();
    const p = norm(e, e.currentTarget as HTMLElement);
    const d = { page, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    dragRef.current = d;
    setDrag(d);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const p = norm(e, e.currentTarget as HTMLElement);
    const d = { ...dragRef.current, x1: p.x, y1: p.y };
    dragRef.current = d;
    setDrag(d);
  };
  const finishDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const rect: Rect = {
      x: Math.min(d.x0, d.x1),
      y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0),
      h: Math.abs(d.y1 - d.y0),
    };
    if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) return;
    setRects((prev) => ({ ...prev, [d.page]: [...(prev[d.page] ?? []), rect] }));
  };

  const removeRect = (page: number, idx: number) =>
    setRects((prev) => ({ ...prev, [page]: (prev[page] ?? []).filter((_, i) => i !== idx) }));

  const totalBoxes = Object.values(rects).reduce((n, r) => n + r.length, 0);

  const flatten = (dataUrl: string, rs: Rect[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, 0, 0);
        ctx.fillStyle = "#000000";
        for (const r of rs) {
          ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
        }
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => reject(new Error("failed to load page image"));
      img.src = dataUrl;
    });

  const apply = async () => {
    const targets = pages.filter((p) => (rects[p.page]?.length ?? 0) > 0);
    if (targets.length === 0) return;
    setSaving(true);
    try {
      const payload = await Promise.all(
        targets.map(async (p) => ({ page: p.page, image: await flatten(p.dataUrl, rects[p.page]!) }))
      );
      await invoicesApi.redact(invoiceId, payload);
      toast({
        title: "Redaction applied",
        description: `${totalBoxes} area${totalBoxes === 1 ? "" : "s"} permanently removed across ${targets.length} page${targets.length === 1 ? "" : "s"}.`,
      });
      onRedacted();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Redaction failed",
        description: (err as Error)?.message ?? "Could not redact the document.",
      });
    } finally {
      setSaving(false);
    }
  };

  const live =
    drag && Math.abs(drag.x1 - drag.x0) >= MIN_SIZE && Math.abs(drag.y1 - drag.y0) >= MIN_SIZE
      ? {
          page: drag.page,
          x: Math.min(drag.x0, drag.x1),
          y: Math.min(drag.y0, drag.y1),
          w: Math.abs(drag.x1 - drag.x0),
          h: Math.abs(drag.y1 - drag.y0),
        }
      : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Redact document</DialogTitle>
          <DialogDescription>
            Drag to draw black boxes over anything to hide. On apply, those pages are
            flattened to an image with the bars burned in — the covered content is
            <strong> permanently removed</strong> and cannot be recovered.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto pr-1">
          {loading && pages.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {pages.map((p) => {
                const pageRects = rects[p.page] ?? [];
                return (
                  <div key={p.page} className="w-full max-w-[640px]">
                    <div className="mb-1 text-xs text-muted-foreground">Page {p.page}</div>
                    <div className="relative select-none border">
                      <img
                        src={p.dataUrl}
                        alt={`Page ${p.page}`}
                        draggable={false}
                        className="pointer-events-none block w-full select-none"
                      />
                      <div
                        className="absolute inset-0 cursor-crosshair"
                        onMouseDown={(e) => onDown(e, p.page)}
                        onMouseMove={onMove}
                        onMouseUp={finishDrag}
                        onMouseLeave={finishDrag}
                      >
                        {pageRects.map((r, i) => (
                          <div
                            key={i}
                            className="group absolute bg-black/80"
                            style={{
                              left: `${r.x * 100}%`,
                              top: `${r.y * 100}%`,
                              width: `${r.w * 100}%`,
                              height: `${r.h * 100}%`,
                            }}
                          >
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRect(p.page, i);
                              }}
                              className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                              title="Remove this box"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {live && live.page === p.page && (
                          <div
                            className="absolute border border-white/70 bg-black/60"
                            style={{
                              left: `${live.x * 100}%`,
                              top: `${live.y * 100}%`,
                              width: `${live.w * 100}%`,
                              height: `${live.h * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center">
          <span className="mr-auto flex items-center gap-1 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            {totalBoxes} box{totalBoxes === 1 ? "" : "es"} — permanent, no undo
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={apply} disabled={saving || totalBoxes === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
            Apply redaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
