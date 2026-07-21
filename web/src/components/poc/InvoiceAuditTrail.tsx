import { useEffect, useState } from "react";
import { activityApi } from "@/services";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Clock, ChevronDown, ChevronUp } from "lucide-react";

const formatAuditTimestamp = (timestamp: string): string => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};
import { Button } from "@/components/ui/button";

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  metadata: any;
  created_at: string;
}

interface InvoiceAuditTrailProps {
  invoiceId: string;
}

export function InvoiceAuditTrail({ invoiceId }: InvoiceAuditTrailProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!invoiceId) return;
    setEntries([]);
    setIsLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const rows = await activityApi.audit(invoiceId);
        if (cancelled) return;
        // Newest first for the audit panel.
        setEntries([...rows].reverse() as unknown as AuditEntry[]);
        // The API joins the actor in, so no second lookup is needed.
        const map: Record<string, string> = {};
        rows.forEach((r) => {
          if (r.user_id && r.actor_name) map[r.user_id] = r.actor_name;
        });
        setEmails(map);
      } catch (error) {
        if (!cancelled) console.error("Error fetching audit trail:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const fetchAuditEntries = async () => {
    try {
      const rows = await activityApi.audit(invoiceId);
      setEntries([...rows].reverse() as unknown as AuditEntry[]);
    } catch (error) {
      console.error("Error fetching audit trail:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: "Created",
      update: "Updated",
      approve: "Approved",
      reject: "Rejected",
      export: "Exported",
      route_exception: "Routed to Trouble Team",
      submit: "Submitted for Review",
      validate: "Validated",
      note_added: "Note Added",
      supplemental_pdf_appended: "Supplemental PDF Attached",
    };
    return labels[action.toLowerCase()] || action;
  };

  const getActionColor = (action: string): "default" | "secondary" | "destructive" | "outline" => {
    const colors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      create: "secondary",
      update: "outline",
      approve: "default",
      reject: "destructive",
      export: "secondary",
      route_exception: "destructive",
      submit: "outline",
      validate: "secondary",
      note_added: "secondary",
      supplemental_pdf_appended: "secondary",
    };
    return colors[action.toLowerCase()] || "outline";
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No audit history available</p>
    );
  }

  const displayEntries = isExpanded ? entries : entries.slice(0, 3);

  return (
    <div className="space-y-3">
      {displayEntries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
        >
          <div className="p-1.5 bg-background rounded-full">
            <Clock className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getActionColor(entry.action)}>
                {getActionLabel(entry.action)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatAuditTimestamp(entry.created_at)}
              </span>
            </div>
            {entry.metadata?.comment && (
              <p className="text-sm text-muted-foreground mt-1">
                "{entry.metadata.comment}"
              </p>
            )}
            {entry.action === 'invoice_fields_edited' && entry.metadata?.changes && (
              <div className="mt-1 space-y-0.5">
                {entry.metadata.changes.map((c: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium">{c.field}</span>: {String(c.old_value)} → {String(c.new_value)}
                  </p>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span className="font-mono">
                {entry.action === 'note_added' && entry.metadata?.author_name
                  ? entry.metadata.author_name
                  : entry.user_id
                    ? (emails[entry.user_id] || entry.user_id.slice(0, 8))
                    : "System"}
              </span>
            </div>
          </div>
        </div>
      ))}

      {entries.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Show {entries.length - 3} More
            </>
          )}
        </Button>
      )}
    </div>
  );
}
