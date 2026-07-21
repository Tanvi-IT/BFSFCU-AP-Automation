import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invoicesApi } from "@/services/invoices";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, X } from "lucide-react";

interface InvoiceData {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  currency: string;
  vendor_id: string;
}

interface MakerEditFormProps {
  invoice: InvoiceData;
  onSave: () => void;
  onCancel: () => void;
}

export function MakerEditForm({ invoice, onSave, onCancel }: MakerEditFormProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date || "",
    total_amount: invoice.total_amount.toString(),
    currency: invoice.currency,
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Fields and the status change commit together on the server.
      await invoicesApi.update(invoice.id, {
        invoiceNumber: formData.invoice_number,
        invoiceDate: formData.invoice_date,
        ...(formData.due_date ? { dueDate: formData.due_date } : {}),
        totalAmount: parseFloat(formData.total_amount),
        submitAfterSave: true,
      });


      // Log the edit in audit_logs
      // Audit is written server-side in the same transaction.

      toast({
        title: "Corrections Saved",
        description: "Invoice has been updated and submitted for review.",
      });

      onSave();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <h4 className="font-semibold flex items-center gap-2">
        Edit Invoice Details
      </h4>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="invoice_number">Invoice Number</Label>
          <Input
            id="invoice_number"
            value={formData.invoice_number}
            onChange={(e) => handleChange("invoice_number", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoice_date">Invoice Date</Label>
          <Input
            id="invoice_date"
            type="date"
            value={formData.invoice_date}
            onChange={(e) => handleChange("invoice_date", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <Input
            id="due_date"
            type="date"
            value={formData.due_date}
            onChange={(e) => handleChange("due_date", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(e) => handleChange("currency", e.target.value.toUpperCase())}
            maxLength={3}
          />
        </div>

        <div className="space-y-2 col-span-2">
          <Label htmlFor="total_amount">Total Amount</Label>
          <Input
            id="total_amount"
            type="number"
            step="0.01"
            value={formData.total_amount}
            onChange={(e) => handleChange("total_amount", e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save Corrections
        </Button>
      </div>
    </div>
  );
}
