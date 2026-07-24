import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip, FileText, ExternalLink, Trash2 } from "lucide-react";
import { invoicesApi, type Attachment } from "@/services/invoices";

interface SupplementalAttachmentProps {
  invoiceId: string;
  status: string;
  supplementalCount?: number | null;
  onAttached?: (newCount?: number) => void;
}

export function SupplementalAttachment({
  invoiceId,
  status,
  onAttached,
}: SupplementalAttachmentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // A settled invoice keeps its documents but takes no new ones.
  const locked = status === "approved" || status === "declined" || status === "rejected";

  const load = async () => {
    try {
      setAttachments(await invoicesApi.supplemental.list(invoiceId));
    } catch {
      // A read failure just leaves the list empty; the upload button still works.
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const res = await invoicesApi.supplemental.add(invoiceId, file);
      await load();
      onAttached?.(res.supplementalCount);
    } catch (err) {
      setError((err as Error)?.message || "Failed to attach document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpen = async (att: Attachment) => {
    setOpeningId(att.id);
    try {
      const url = await invoicesApi.supplemental.fileUrl(invoiceId, att.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError((err as Error)?.message || "Could not open document");
    } finally {
      setOpeningId(null);
    }
  };

  const handleRemove = async (att: Attachment) => {
    setRemovingId(att.id);
    setError(null);
    try {
      await invoicesApi.supplemental.remove(invoiceId, att.id);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Could not remove document");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => handleOpen(att)}
                className="flex-1 truncate text-left hover:text-primary"
                title={att.original_filename}
              >
                {att.original_filename}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {(att.bytes / 1024).toFixed(0)} KB
              </span>
              {openingId === att.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              {!locked && (
                <button
                  type="button"
                  onClick={() => handleRemove(att)}
                  disabled={removingId === att.id}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${att.original_filename}`}
                >
                  {removingId === att.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx"
            style={{ display: "none" }}
            ref={fileInputRef}
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Attaching...
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4 mr-2" />
                Attach Supplemental Document
              </>
            )}
          </Button>
        </>
      )}

      {locked && attachments.length === 0 && (
        <p className="text-xs text-muted-foreground">No supplemental documents.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
