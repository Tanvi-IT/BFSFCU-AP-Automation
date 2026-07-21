import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip } from "lucide-react";

interface SupplementalAttachmentProps {
  invoiceId: string;
  status: string;
  supplementalCount?: number | null;
  onAttached?: (newCount?: number) => void;
}

export function SupplementalAttachment({
  invoiceId,
  status,
  supplementalCount,
  onAttached,
}: SupplementalAttachmentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localCount, setLocalCount] = useState<number | null>(null);

  const effectiveCount = localCount ?? supplementalCount ?? 0;

  const handleSupplementalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("invoice_id", invoiceId);
      formData.append("file", file);

      // Supplemental PDF merging (pdf-lib) has not been ported yet.
      const data = null;
      const fnErr = new Error('Attaching supplemental documents is not available yet in the Azure build.');


      if (fnErr) {
        throw new Error(fnErr.message || "Upload failed");
      }
      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }

      const newCount = (data as any)?.supplemental_pdf_count;
      if (typeof newCount === "number") {
        setLocalCount(newCount);
      }
      setSuccess(true);
      onAttached?.(typeof newCount === "number" ? newCount : undefined);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err?.message || "Failed to attach supplemental document");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const hidden = status === "approved" || status === "declined" || status === "rejected";

  if (hidden) {
    if (effectiveCount > 0) {
      return (
        <p className="text-xs text-muted-foreground mt-2">
          {effectiveCount} supplemental document(s) attached
        </p>
      );
    }
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleSupplementalUpload}
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
      {success && (
        <p className="text-sm text-green-600">
          Supplemental document attached successfully
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {effectiveCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {effectiveCount} supplemental document(s) attached
        </p>
      )}
    </div>
  );
}
