import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Shield, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { invoicesApi, type Invoice } from "@/services/invoices";
import { activityApi } from "@/services";

const STATUSES = ["queued", "processing", "validated", "submitted", "approved", "declined", "exception"];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "declined" || status === "exception") return "destructive";
  if (status === "queued" || status === "processing") return "secondary";
  return "outline";
}

function actionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "approved":
      return "default";
    case "declined":
    case "deleted":
      return "destructive";
    case "uploaded":
    case "processed":
      return "secondary";
    default:
      return "outline";
  }
}

/** The per-invoice history dialog. */
function InvoiceHistory({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["invoice-audit", invoice.id],
    queryFn: () => activityApi.audit(invoice.id),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoice.invoice_number || "Invoice"} — history
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground -mt-2 mb-2">
          {invoice.vendor_name || "Unknown vendor"} · {invoice.currency} {invoice.total_amount}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No recorded activity for this invoice.</p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-5 py-2">
            {entries.map((e) => (
              <li key={e.id} className="ml-4">
                <div className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={actionVariant(e.action)}>{e.action.replace(/_/g, " ")}</Badge>
                  {(e.metadata as Record<string, unknown> | null)?.self_approved === true && (
                    <Badge variant="destructive" className="text-[10px]">self-approved</Badge>
                  )}
                  <span className="text-sm font-medium">{e.actor_name || "System"}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), "PPp")}
                  </span>
                </div>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <pre className="mt-1 text-xs bg-muted rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(e.metadata, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AuditConsole() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["audit-invoices", search, status],
    queryFn: () =>
      invoicesApi.list({
        limit: 500,
        ...(search ? { search } : {}),
        ...(status ? { status: status as Invoice["status"] } : {}),
      }),
  });

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Audit Trail</h1>
            <p className="text-muted-foreground">
              Select an invoice to see who uploaded it, who approved it, and every action taken
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by invoice number or vendor…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : !invoices || invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelected(inv)}
                    >
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{inv.vendor_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inv.currency} {inv.total_amount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.created_at ? format(new Date(inv.created_at), "yyyy-MM-dd HH:mm") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {selected && <InvoiceHistory invoice={selected} onClose={() => setSelected(null)} />}
    </Layout>
  );
}
