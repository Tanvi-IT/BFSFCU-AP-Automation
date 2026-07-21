import { useEffect, useState } from "react";
import { activityApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvoiceNote {
  id: string;
  author_name: string;
  note_text: string;
  created_at: string;
}

interface InvoiceNotesProps {
  invoiceId: string;
}

const formatNoteTimestamp = (timestamp: string): string => {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export function InvoiceNotes({ invoiceId }: InvoiceNotesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<InvoiceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchNotes = async () => {
    try {
      const rows = await activityApi.notes(invoiceId);
      setNotes(
        rows.map((n) => ({
          id: n.id,
          author_name: n.author_name ?? "User",
          note_text: n.body,
          created_at: n.created_at,
        }))
      );
    } catch (err) {
      console.error("Error fetching invoice notes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!invoiceId) return;
    setNotes([]);
    setIsLoading(true);
    let cancelled = false;

    // Realtime push was dropped in the Azure rebuild: notes are added by the
    // person looking at the screen, so a fetch on mount (plus the refresh after
    // submitting) is sufficient and removes a whole service from the stack.
    (async () => {
      try {
        const rows = await activityApi.notes(invoiceId);
        if (cancelled) return;
        setNotes(
          rows.map((n) => ({
            id: n.id,
            author_name: n.author_name ?? "User",
            note_text: n.body,
            created_at: n.created_at,
          }))
        );
      } catch (error) {
        if (!cancelled) console.error("Error fetching notes:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const handleSubmit = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      // The server attributes the note to the authenticated caller — the client
      // no longer supplies (or can spoof) an author name.
      await activityApi.addNote(invoiceId, trimmed);
      setNoteText("");
      await fetchNotes();
    } catch (err: any) {
      console.error("Error adding note:", err);
      toast({
        title: "Could not add note",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="font-semibold flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4" />
        Notes
      </h4>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm italic text-muted-foreground py-2">
          No notes yet. Add the first note below.
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-md bg-muted/40 p-3 pl-4 border-l-4"
              style={{ borderLeftColor: "#003366" }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">
                  {note.author_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatNoteTimestamp(note.created_at)}
                </span>
              </div>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">
                {note.note_text}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2">
        <Textarea
          placeholder="Add a note..."
          rows={3}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          disabled={isSubmitting}
        />
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || noteText.trim().length === 0}
            size="sm"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Note
          </Button>
        </div>
      </div>
    </div>
  );
}
