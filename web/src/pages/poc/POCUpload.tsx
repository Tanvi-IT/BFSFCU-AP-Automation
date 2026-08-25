import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { invoicesApi, isInFlight, type InvoiceStatus } from "@/services/invoices";
import { activityApi } from "@/services";
import { invoiceStatusLabel } from "@/lib/invoiceStatus";
import { invoiceRoute } from "@/lib/invoiceRoute";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Files,
  CheckCircle2,
  XCircle,
  Loader2,
  File,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  Copy,
} from "lucide-react";

/**
 * What a file is doing right now. These are UI stages, not invoice statuses —
 * `uploading` is the browser sending bytes, `queued`/`extracting` mirror the
 * background worker, and everything after that is terminal.
 */
type UploadStage =
  | "pending"
  | "uploading"
  | "queued"
  | "extracting"
  | "done"
  | "duplicate"
  | "stalled"
  | "error";

const TERMINAL_STAGES: readonly UploadStage[] = ["done", "duplicate", "stalled", "error"];
const isTerminal = (stage: UploadStage) => TERMINAL_STAGES.includes(stage);

interface UploadFile {
  /** Stable across re-renders so rows never reshuffle mid-upload. */
  id: string;
  file: File;
  stage: UploadStage;
  /** Real bytes-sent percentage, only meaningful while `stage === "uploading"`. */
  progress: number;
  error?: string;
  invoiceId?: string;
  /** Where the worker finally put the invoice, once it is out of our hands. */
  finalStatus?: InvoiceStatus;
  /** Set once the worker classifies it — a credit memo routes to its own viewer. */
  documentType?: string | null;
  /** When the file entered the queue, used to stop waiting on a dead worker. */
  queuedAt?: number;
}

/** How many files upload at once. Enough to be fast, few enough that each bar moves visibly. */
const UPLOAD_CONCURRENCY = 3;

/**
 * Cap on files per batch. Each upload becomes a queued job the worker runs
 * through Document Intelligence + the language model; too many in flight at
 * once starves the worker/DB pool and later jobs appear to hang. Keep batches
 * small — submit these, then add more.
 */
const MAX_BATCH = 10;

/** "Process Large File(s)" keeps only the first N pages of each PDF before it is
 *  stored and extracted — a one-click trim for long documents. */
const LARGE_FILE_TOP_PAGES = 10;

/** How often to ask the API whether the worker has finished a queued invoice. */
const POLL_INTERVAL_MS = 2500;

/** Give up watching after this long — the worker is down or the job was poison-queued. */
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

let nextFileId = 0;

/** Run `worker` over `items`, at most `limit` at a time. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}


export default function POCUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [recentUploads, setRecentUploads] = useState<any[]>([]);
  const [failedUploads, setFailedUploads] = useState<any[]>([]);
  const [recentOpen, setRecentOpen] = useState(true);
  const [failedOpen, setFailedOpen] = useState(false);

  useEffect(() => {
    void fetchRecentUploads();
    void fetchFailedUploads();
  }, []);

  const fetchRecentUploads = async () => {
    try {
      // Recent Uploads is the manual/direct-upload log for THIS page. Inbox
      // (email/Power Automate) invoices have their own view — Inbox Monitor —
      // so exclude them here. Fetch a wider page and keep the 10 most recent
      // non-inbox uploads.
      const rows = await invoicesApi.list({ limit: 40 });
      setRecentUploads(
        rows
          .filter((r) => r.source !== "email_ingest" && r.source !== "email")
          .slice(0, 10)
      );
    } catch {
      setRecentUploads([]);
    }
  };

  const fetchFailedUploads = async () => {
    try {
      const entries = await activityApi.recentAudit(50);
      setFailedUploads(entries.filter((e) => e.action === "upload_failed"));
    } catch {
      // Audit is admin-only; a non-admin simply sees no failure list.
      setFailedUploads([]);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);

  const acceptedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => acceptedTypes.includes(file.type)
    );
    
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => acceptedTypes.includes(file.type)
    );
    addFiles(selectedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    const available = MAX_BATCH - files.length;
    if (available <= 0) {
      toast({
        variant: "destructive",
        title: "Upload limit reached",
        description: `Upload up to ${MAX_BATCH} files at a time. Submit these, then add more.`,
      });
      return;
    }
    const accepted = newFiles.slice(0, available);
    const dropped = newFiles.length - accepted.length;

    const uploadFiles: UploadFile[] = accepted.map((file) => ({
      id: `f${nextFileId++}`,
      file,
      stage: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);

    if (dropped > 0) {
      toast({
        title: `Only ${MAX_BATCH} at a time`,
        description: `${dropped} file(s) weren't added. Upload up to ${MAX_BATCH} at once to keep processing reliable.`,
      });
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  /** Patch one row without disturbing the others. */
  const patchFile = (id: string, patch: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const clearFiles = () => {
    setFiles([]);
    const input = document.getElementById("file-input") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  const getFriendlyError = (message: string): string => {
    if (message.includes('non-2xx') || message.includes('status code')) return 'Server error — could not process invoice. Try again.';
    if (message.includes('Failed to fetch') || message.includes('fetch')) return 'Connection timed out — try again or upload in smaller batches.';
    if (message.includes('timeout') || message.includes('timed out')) return 'Processing timed out — file may be too large or complex.';
    if (message.includes('Edge Function') || message.includes('edge function') || message.includes('Failed to send')) return 'Processing failed — please try again.';
    return 'Processing failed — please try again.';
  };

  const processFiles = async (pageRange?: { from: number; to: number }) => {
    const pending = files.filter((f) => f.stage === "pending");
    if (pending.length === 0) return;

    setIsProcessing(true);

    let duplicates = 0;
    let failed = 0;

    // A few at a time rather than all at once: each file's bar then moves at a
    // speed a human can actually read, and the API is not hit with 10 multipart
    // bodies simultaneously.
    await runWithConcurrency(pending, UPLOAD_CONCURRENCY, async (entry) => {
      patchFile(entry.id, { stage: "uploading", progress: 0, error: undefined });

      try {
        const result = await invoicesApi.upload(
          entry.file,
          (percent) => patchFile(entry.id, { progress: percent }),
          pageRange
        );

        if (result.duplicate === true) {
          duplicates++;
          patchFile(entry.id, {
            stage: "duplicate",
            progress: 100,
            invoiceId: result.invoiceId,
          });
          return;
        }

        // Stored and queued — the worker owns it now, so hand off to the poller.
        patchFile(entry.id, {
          stage: "queued",
          progress: 100,
          invoiceId: result.invoiceId,
          queuedAt: Date.now(),
        });
      } catch (err) {
        failed++;
        const reason =
          err instanceof ApiError
            ? err.message
            : getFriendlyError(String((err as Error)?.message ?? err));
        patchFile(entry.id, { stage: "error", progress: 0, error: reason });
      }
    });

    setIsProcessing(false);

    if (duplicates > 0) {
      toast({
        title: "Duplicates skipped",
        description: `${duplicates} file(s) had already been uploaded.`,
      });
    }
    if (failed > 0) {
      toast({
        variant: "destructive",
        title: "Some uploads failed",
        description: `${failed} file(s) could not be uploaded.`,
      });
    }

    // The list deliberately stays on screen. Extraction is still running, and
    // clearing here is what made the whole thing feel like it vanished into the
    // background. `Clear list` is now an explicit choice.
    fetchRecentUploads();
  };

  /**
   * Watch every queued invoice until the worker is done with it.
   *
   * Keyed on the set of invoice ids being watched, not on `files` — otherwise
   * each byte-progress update would tear down and restart the interval, and it
   * would never actually fire while an upload was running.
   */
  const filesRef = useRef<UploadFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const watchKey = files
    .filter((f) => f.invoiceId && (f.stage === "queued" || f.stage === "extracting"))
    .map((f) => f.invoiceId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!watchKey) return;

    let cancelled = false;

    const tick = async () => {
      const watching = filesRef.current.filter(
        (f) => f.invoiceId && (f.stage === "queued" || f.stage === "extracting")
      );
      if (watching.length === 0) return;

      const results = await Promise.allSettled(
        watching.map(async (f) => ({
          fileId: f.id,
          invoice: await invoicesApi.get(f.invoiceId as string),
        }))
      );
      if (cancelled) return;

      const latest = new Map<string, InvoiceStatus>();
      const errors = new Map<string, string | null>();
      const docTypes = new Map<string, string | null>();
      for (const r of results) {
        if (r.status === "fulfilled") {
          latest.set(r.value.fileId, r.value.invoice.status);
          errors.set(r.value.fileId, r.value.invoice.processing_error);
          docTypes.set(r.value.fileId, r.value.invoice.document_type ?? null);
        }
      }
      if (latest.size === 0) return;

      // Decide what settled *before* touching state: a `setFiles` updater runs
      // during render, so anything it assigns to an outer variable is not
      // readable here.
      const now = Date.now();
      const stalled = new Set(
        watching
          .filter((f) => {
            const status = latest.get(f.id);
            return (
              status !== undefined &&
              isInFlight(status) &&
              f.queuedAt !== undefined &&
              now - f.queuedAt > POLL_TIMEOUT_MS
            );
          })
          .map((f) => f.id)
      );
      const settledAny =
        stalled.size > 0 ||
        watching.some((f) => {
          const status = latest.get(f.id);
          return status !== undefined && !isInFlight(status);
        });

      setFiles((prev) =>
        prev.map((f) => {
          const status = latest.get(f.id);
          if (!status) return f;

          if (!isInFlight(status)) {
            return {
              ...f,
              stage: "done",
              finalStatus: status,
              documentType: docTypes.get(f.id) ?? null,
              error: errors.get(f.id) ?? undefined,
            };
          }

          // Still the worker's: surface the queued → extracting transition, and
          // stop waiting forever if nothing is consuming the queue.
          if (stalled.has(f.id)) return { ...f, stage: "stalled" };

          const nextStage = status === "processing" ? "extracting" : "queued";
          return f.stage === nextStage ? f : { ...f, stage: nextStage };
        })
      );

      if (settledAny) void fetchRecentUploads();
    };

    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [watchKey]);

  const getStatusIcon = (stage: UploadStage) => {
    switch (stage) {
      case "done":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "duplicate":
        return <Copy className="h-5 w-5 text-muted-foreground" />;
      case "stalled":
        return <Clock className="h-5 w-5 text-amber-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "uploading":
      case "queued":
      case "extracting":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  /** Where the worker put it — the same tag vocabulary used across the app. */
  const finalStatusLabel = (status: InvoiceStatus): string => invoiceStatusLabel(status);

  const getStatusLabel = (f: UploadFile): string => {
    switch (f.stage) {
      case "uploading":
        return `Uploading ${f.progress}%`;
      case "queued":
        return "Waiting for extraction…";
      case "extracting":
        return "Extracting invoice data…";
      case "done":
        return f.finalStatus ? `Done · ${finalStatusLabel(f.finalStatus)}` : "Done";
      case "duplicate":
        return "Already uploaded";
      case "stalled":
        return "Still processing — check the queue later";
      case "error":
        return "Failed";
      default:
        return "Ready";
    }
  };

  const pendingCount = files.filter((f) => f.stage === "pending").length;
  const doneCount = files.filter((f) => f.stage === "done").length;
  const finishedCount = files.filter((f) => isTerminal(f.stage)).length;
  const activeCount = files.length - pendingCount - finishedCount;
  const errorCount = files.filter((f) => f.stage === "error").length;
  const batchPercent = files.length === 0 ? 0 : Math.round((finishedCount / files.length) * 100);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <Upload className="h-8 w-8" />
            Upload Invoices
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload PDF or image files for processing
          </p>
        </div>

        {/* Upload Zone */}
        <Card>
          <CardHeader>
            <CardTitle>Select Files</CardTitle>
            <CardDescription>
              Drag and drop files or click to browse. Supported: PDF, PNG, JPG.
              {" "}Upload up to {MAX_BATCH} invoices at a time — submit these, then add more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">
                {isDragging ? "Drop files here" : "Drag files here or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
              </p>
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        {files.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Selected Files ({files.length})</CardTitle>
                <CardDescription>
                  {activeCount > 0
                    ? `${finishedCount} of ${files.length} complete • ${activeCount} in progress`
                    : pendingCount > 0
                      ? `${pendingCount} ready to upload`
                      : `${finishedCount} of ${files.length} complete${errorCount > 0 ? ` • ${errorCount} failed` : ""}`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {pendingCount > 0 && (
                  <>
                    <Button onClick={() => processFiles()} disabled={isProcessing}>
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Process All
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => processFiles({ from: 1, to: LARGE_FILE_TOP_PAGES })}
                      disabled={isProcessing}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                      title={`Keep only the first ${LARGE_FILE_TOP_PAGES} pages of each PDF, then process`}
                    >
                      <Files className="h-4 w-4 mr-2" />
                      Process Large File(s)
                    </Button>
                  </>
                )}
                {doneCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => navigate("/low-confidence")}
                  >
                    View Invoices
                  </Button>
                )}
                {finishedCount === files.length && (
                  <Button variant="ghost" onClick={clearFiles}>
                    Clear list
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Batch progress — one glance answers "how far along is my batch of 10?" */}
              {(activeCount > 0 || finishedCount > 0) && (
                <div className="mb-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {activeCount > 0 ? "Processing batch" : "Batch complete"}
                    </span>
                    <span>{finishedCount} / {files.length}</span>
                  </div>
                  <Progress value={batchPercent} className="h-2" />
                </div>
              )}
              <div className="space-y-3">
                {files.map((uploadFile) => (
                  <div
                    key={uploadFile.id}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                  >
                    {getStatusIcon(uploadFile.stage)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {uploadFile.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {(uploadFile.file.size / 1024).toFixed(0)} KB
                        </Badge>
                        <span
                          className={`text-xs ${
                            uploadFile.stage === "done"
                              ? "text-success"
                              : uploadFile.stage === "error"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {getStatusLabel(uploadFile)}
                        </span>
                        {uploadFile.error && (
                          <span className="text-xs text-destructive truncate">
                            {uploadFile.error}
                          </span>
                        )}
                      </div>

                      {/* Sending bytes: a real percentage, so the bar tracks the file. */}
                      {uploadFile.stage === "uploading" && (
                        <Progress value={uploadFile.progress} className="mt-2 h-1" />
                      )}

                      {/* Worker's turn: no percentage exists, so show motion instead
                          of a number the server never gave us. */}
                      {(uploadFile.stage === "queued" || uploadFile.stage === "extracting") && (
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
                          <div className="h-full w-1/4 rounded-full bg-primary animate-indeterminate" />
                        </div>
                      )}
                    </div>
                    {uploadFile.stage === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(uploadFile.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    {isTerminal(uploadFile.stage) && uploadFile.invoiceId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigate(
                            invoiceRoute(
                              uploadFile.finalStatus,
                              uploadFile.invoiceId,
                              uploadFile.documentType
                            )
                          )
                        }
                      >
                        View
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {/* Recent Uploads (collapsible) */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setRecentOpen((v) => !v)}
          >
            <CardTitle className="flex items-center gap-2">
              {recentOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Recent Uploads
            </CardTitle>
            <CardDescription>Last 10 invoices received</CardDescription>
          </CardHeader>
          {recentOpen && (
          <CardContent>
            {recentUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent uploads found.</p>
            ) : (
              <div className="space-y-2">
                {recentUploads.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{inv.vendor_name || "Unknown Vendor"}</p>
                      <p className="text-xs text-muted-foreground">{inv.invoice_number} • {inv.currency} {inv.total_amount?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        inv.status === "approved" ? "bg-green-100 text-green-700" :
                        inv.status === "exception" && inv.source === "email" ? "bg-red-200 text-red-800" :
                        inv.status === "exception" ? "bg-red-100 text-red-700" :
                        inv.status === "rejected" ? "bg-gray-100 text-gray-600" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {inv.status === "exception" && inv.source === "email"
                          ? "⚠ Email — Needs Review"
                          : invoiceStatusLabel(inv.status)}
                      </span>
                      {/* Only offer "View" once the worker has finished — a
                          queued/processing invoice has nothing to review yet and
                          would route to the generic detail page. While in flight,
                          show a Processing hint instead. */}
                      {isInFlight(inv.status) ? (
                        <span className="text-xs text-muted-foreground italic px-2">
                          Processing…
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(invoiceRoute(inv.status, inv.id, inv.document_type))}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          )}
        </Card>

        {/* Failed Uploads (collapsible) — immutable record of unsuccessful uploads */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setFailedOpen((v) => !v)}
          >
            <CardTitle className="flex items-center gap-2">
              {failedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Failed Uploads
              {failedUploads.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">({failedUploads.length})</span>
              )}
            </CardTitle>
            <CardDescription>Unsuccessful uploads, recorded for audit and review</CardDescription>
          </CardHeader>
          {failedOpen && (
          <CardContent>
            {failedUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failed uploads recorded.</p>
            ) : (
              <div className="space-y-2">
                {failedUploads.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{f.metadata?.filename || "Unknown file"}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.metadata?.failure_reason || "Processing failed"} • {f.metadata?.attempted_by || "Unknown user"} • {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })} {new Date(f.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700 whitespace-nowrap">
                      Failed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          )}
        </Card>
      </div>
    </Layout>
  );
}
