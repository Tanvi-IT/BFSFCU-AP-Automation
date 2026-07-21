import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { invoicesApi } from "@/services/invoices";
import { activityApi } from "@/services";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  File,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "processing" | "success" | "error";
  progress: number;
  error?: string;
  invoiceId?: string;
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
      setRecentUploads(await invoicesApi.list({ limit: 10 }));
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
    const uploadFiles: UploadFile[] = newFiles.map((file) => ({
      file,
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFriendlyError = (message: string): string => {
    if (message.includes('non-2xx') || message.includes('status code')) return 'Server error — could not process invoice. Try again.';
    if (message.includes('Failed to fetch') || message.includes('fetch')) return 'Connection timed out — try again or upload in smaller batches.';
    if (message.includes('timeout') || message.includes('timed out')) return 'Processing timed out — file may be too large or complex.';
    if (message.includes('Edge Function') || message.includes('edge function') || message.includes('Failed to send')) return 'Processing failed — please try again.';
    return 'Processing failed — please try again.';
  };

  const processFiles = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);

    // Uploads now return as soon as the file is stored and queued, so they run
    // in parallel instead of one-at-a-time. Extraction happens in the background
    // worker — the browser no longer waits on the AI pipeline.
    const pending = files
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.status === "pending");

    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as const, progress: 40 } : f
      )
    );

    const results = await Promise.allSettled(
      pending.map(({ f }) => invoicesApi.upload(f.file))
    );

    let queued = 0;
    let duplicates = 0;
    let failed = 0;

    results.forEach((result, i) => {
      const entry = pending[i];
      if (!entry) return;
      const { index } = entry;

      if (result.status === "fulfilled") {
        const wasDuplicate = result.value.duplicate === true;
        if (wasDuplicate) duplicates++;
        else queued++;

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === index
              ? {
                  ...f,
                  status: "success" as const,
                  progress: 100,
                  invoiceId: result.value.invoiceId,
                  ...(wasDuplicate ? { error: "Already uploaded" } : {}),
                }
              : f
          )
        );
      } else {
        failed++;
        const reason =
          result.reason instanceof ApiError
            ? result.reason.message
            : getFriendlyError(String(result.reason?.message ?? result.reason));

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === index
              ? { ...f, status: "error" as const, progress: 0, error: reason }
              : f
          )
        );
      }
    });

    setIsProcessing(false);

    if (queued > 0) {
      toast({
        title: "Uploaded",
        description: `${queued} invoice(s) queued. Extraction runs in the background — the queues will update shortly.`,
      });
    }
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

    // Reset file list and file input so the upload area is ready for the next batch
    setFiles([]);
    const input = document.getElementById("file-input") as HTMLInputElement;
    if (input) input.value = "";
    fetchRecentUploads();
  };

  const getStatusIcon = (status: UploadFile["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "uploading":
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <File className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: UploadFile["status"]) => {
    switch (status) {
      case "success":
        return "Processed";
      case "error":
        return "Failed";
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Processing...";
      default:
        return "Ready";
    }
  };

  const pendingCount = files.filter(f => f.status === "pending").length;
  const successCount = files.filter(f => f.status === "success").length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/poc/dashboard")}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Button>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Upload className="h-8 w-8" />
              Upload Invoices
            </h1>
            <p className="text-muted-foreground mt-1">
              Upload PDF or image files for processing
            </p>
          </div>
        </div>

        {/* Upload Zone */}
        <Card>
          <CardHeader>
            <CardTitle>Select Files</CardTitle>
            <CardDescription>
              Drag and drop files or click to browse. Supported: PDF, PNG, JPG
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
                  {pendingCount === 0 && successCount > 0
                    ? `${successCount} invoice(s) processed successfully. Click View Invoices to review them in the queue.`
                    : `${pendingCount} pending • ${successCount} processed`
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {pendingCount > 0 && (
                  <Button
                    onClick={processFiles}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Process All
                      </>
                    )}
                  </Button>
                )}
                {successCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => navigate("/poc/low-confidence")}
                  >
                    View Invoices
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {files.map((uploadFile, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                  >
                    {getStatusIcon(uploadFile.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {uploadFile.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {(uploadFile.file.size / 1024).toFixed(0)} KB
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {getStatusLabel(uploadFile.status)}
                        </span>
                        {uploadFile.error && (
                          <span className="text-xs text-destructive">
                            {uploadFile.error}
                          </span>
                        )}
                      </div>
                      {(uploadFile.status === "uploading" || uploadFile.status === "processing") && (
                        <Progress value={uploadFile.progress} className="mt-2 h-1" />
                      )}
                    </div>
                    {uploadFile.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    {uploadFile.status === "success" && uploadFile.invoiceId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/poc/low-confidence/${uploadFile.invoiceId}`)}
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
                      <p className="font-medium text-sm">{inv.vendors?.name || "Unknown Vendor"}</p>
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
                        {inv.status === "validated" ? "In Review" :
                         inv.status === "approved" ? "Approved" :
                         inv.status === "exception" && inv.source === "email" ? "⚠ Email — Needs Review" :
                         inv.status === "exception" ? "Exception" :
                         inv.status === "rejected" ? "Declined" :
                         inv.status}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(
                          inv.status === "exception" ? `/poc/exceptions/${inv.id}` :
                          inv.status === "approved" ? `/invoices` :
                          `/poc/low-confidence/${inv.id}`
                        )}
                      >
                        View
                      </Button>
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
