import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { activityApi } from "@/services";

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
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Upload, 
  Send, 
  AlertTriangle,
  Clock,
  DollarSign,
  RefreshCw,
  MessageSquare,
  Paperclip
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  actor_email?: string | null;
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  created: { icon: FileText, label: "Invoice Created", color: "text-blue-500" },
  ingested: { icon: Upload, label: "Ingested", color: "text-blue-500" },
  extracted: { icon: FileText, label: "AI Extracted", color: "text-purple-500" },
  validated: { icon: CheckCircle, label: "Validated", color: "text-green-500" },
  submitted: { icon: Send, label: "Submitted by Maker", color: "text-blue-500" },
  approved: { icon: CheckCircle, label: "Approved by Checker", color: "text-green-600" },
  rejected: { icon: XCircle, label: "Rejected", color: "text-red-500" },
  exported: { icon: Send, label: "Exported to ERP", color: "text-indigo-500" },
  delivered: { icon: CheckCircle, label: "Delivered to ERP", color: "text-green-500" },
  posted: { icon: CheckCircle, label: "Posted to ERP", color: "text-green-600" },
  paid: { icon: DollarSign, label: "Paid", color: "text-emerald-600" },
  exception: { icon: AlertTriangle, label: "Exception Raised", color: "text-orange-500" },
  updated: { icon: RefreshCw, label: "Updated", color: "text-gray-500" },
  config_changed: { icon: RefreshCw, label: "Config Changed", color: "text-gray-500" },
  note_added: { icon: MessageSquare, label: "Note Added", color: "text-blue-400" },
  supplemental_pdf_appended: { icon: Paperclip, label: "Supplemental PDF Attached", color: "text-blue-400" },
};

interface InvoiceTimelineProps {
  invoiceId: string;
}

export function InvoiceTimeline({ invoiceId }: InvoiceTimelineProps) {
  console.log('[InvoiceTimeline] mounted with invoiceId:', invoiceId);
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useQuery({
    queryKey: ["invoice-timeline", invoiceId],
    queryFn: async () => {
      // The API joins the actor in, so there is no second lookup and no N+1.
      const entries = await activityApi.audit(invoiceId);
      return entries.map((e) => ({
        id: e.id,
        action: e.action,
        created_at: e.created_at,
        metadata: e.metadata,
        user_id: e.user_id,
        actor_email: e.actor_name,
      })) as TimelineEvent[];
    },
  });

  // Realtime push was dropped in the Azure rebuild. Invalidating the query
  // after an action (approve, note, edit) refreshes the timeline, which is
  // sufficient at this volume and removes a service from the stack.
  useEffect(() => {
    if (!invoiceId) return;
    void queryClient.invalidateQueries({ queryKey: ["invoice-timeline", invoiceId] });
  }, [invoiceId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Clock className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No timeline events recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Invoice Lifecycle Timeline</h3>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
        
        <div className="space-y-4">
          {events.map((event, index) => {
            const config = ACTION_CONFIG[event.action] || {
              icon: Clock,
              label: event.action,
              color: "text-gray-500",
            };
            const Icon = config.icon;

            return (
              <div key={event.id} className="relative flex items-start gap-4 pl-10">
                {/* Timeline dot */}
                <div className={cn(
                  "absolute left-2 w-5 h-5 rounded-full bg-background border-2 flex items-center justify-center",
                  index === events.length - 1 ? "border-primary" : "border-muted"
                )}>
                  <Icon className={cn("h-3 w-3", config.color)} />
                </div>
                
                <div className="flex-1 bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className={cn("font-medium", config.color)}>
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatAuditTimestamp(event.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {event.action === 'note_added' && typeof event.metadata?.author_name === 'string'
                      ? event.metadata.author_name
                      : (event as any).actor_email || event.user_id || 'System'}
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {JSON.stringify(event.metadata)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
