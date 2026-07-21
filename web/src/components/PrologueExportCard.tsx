import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PrologueExportCardProps {
  invoiceIds?: string[];
}

export function PrologueExportCard({ invoiceIds }: PrologueExportCardProps) {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  const runExport = async () => {
    setLoading(true);
    try {
      // Server-side export; the API client attaches the token.
      const blob = await api.blob('/exports/prologue', {
        ...(dateFrom ? { dateFrom: new Date(dateFrom).toISOString() } : {}),
        ...(dateTo
          ? {
              dateTo: (() => {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                return end.toISOString();
              })(),
            }
          : {}),
        ...(invoiceIds && invoiceIds.length > 0 ? { invoiceIds: invoiceIds.join(',') } : {}),
      });
      const count: string | null = null;
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const today = new Date().toISOString().split("T")[0];
      a.download = `BFSFCU_Prologue_Export_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Export complete",
        description: count ? `${count} invoice(s) included` : "Export file downloaded successfully",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e.message ?? "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prologue Reconciliation Export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Excel file containing all approved invoices with vendor, amount, invoice
          date, and ACH payment details for Prologue downstream verification.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="prologue-from">From date</Label>
            <Input
              id="prologue-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prologue-to">To date</Label>
            <Input
              id="prologue-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
        <Button onClick={runExport} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating export...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export Prologue Reconciliation File
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
