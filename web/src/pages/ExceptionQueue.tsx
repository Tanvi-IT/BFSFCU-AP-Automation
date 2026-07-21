import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge, RiskBadge } from "@/components/StatusBadge";
import { invoicesApi, QUEUE } from "@/services/invoices";
import { CanonicalInvoice } from "@/types/invoice";
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const ExceptionQueue = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<(CanonicalInvoice & { taxFlagged?: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchExceptions();
  }, []);

  const fetchExceptions = async () => {
    try {
      const rows = await invoicesApi.list({ status: QUEUE.exceptions, limit: 500 });
      const data = rows.map((r) => ({
        ...r,
        vendors: r.vendor_id ? { id: r.vendor_id, name: r.vendor_name } : null,
      }));


      const mapped = (data || []).map(inv => ({
        id: inv.id,
        tenantId: undefined as any,
        vendorId: inv.vendor_id,
        poId: undefined as any,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        currency: inv.currency,
        subtotalAmount: inv.subtotal_amount,
        taxAmount: inv.tax_amount,
        totalAmount: inv.total_amount,
        status: inv.status,
        source: inv.source,
        anomalyScore: inv.anomaly_score,
        riskLevel: inv.risk_level,
        rawFilePath: inv.raw_file_path,
        createdAt: inv.created_at,
        updatedAt: inv.updated_at,
        taxFlagged: inv.tax_flagged ?? false,
        vendor: inv.vendors ? {
          id: inv.vendors.id,
          name: inv.vendors.name,
        } : undefined,
      }));

      setInvoices(mapped as any);
    } catch (error) {
      console.error('Error fetching exceptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <AlertCircle className="h-8 w-8 text-warning" />
              Exception Queue
            </h1>
            <p className="text-muted-foreground mt-1">
              Invoices requiring manual review and approval
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Exceptions ({invoices.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">No exceptions found - all clear!</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice, index) => (
                    <TableRow
                      key={invoice.id}
                      className={
                        invoice.riskLevel === 'high'
                          ? 'bg-destructive/5'
                          : invoice.riskLevel === 'medium'
                          ? 'bg-warning/5'
                          : ''
                      }
                    >
                      <TableCell>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {index + 1}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{invoice.invoiceNumber}</span>
                          {invoice.taxFlagged && (
                            <span className="inline-flex items-center rounded-md bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">
                              TAX FLAGGED
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{invoice.vendor?.name || 'Unknown'}</TableCell>
                      <TableCell>{format(new Date(invoice.invoiceDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{invoice.currency} {invoice.totalAmount.toLocaleString()}</TableCell>
                      <TableCell>
                        <RiskBadge level={invoice.riskLevel} />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {(invoice.anomalyScore || 0).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ExceptionQueue;
