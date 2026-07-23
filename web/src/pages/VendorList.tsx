import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { vendorsApi } from "@/services";
import { invoicesApi } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";
import { Loader2, Building2, ChevronRight, Sparkles, Upload } from "lucide-react";

interface VendorWithEnrichment {
  id: string;
  tenantId: string;
  name: string;
  hasEnrichment: boolean;
  glCode: string | null;
  riskScore: number | null;
  status: string | null;
}

const VendorList = () => {
  const [vendors, setVendors] = useState<VendorWithEnrichment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setImporting(true);
    try {
      const result = await vendorsApi.import(file);
      const parts = [`${result.inserted} added`, `${result.updated} updated`];
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      toast({ title: "Vendor list imported", description: parts.join(", ") + "." });
      if (result.errors?.length) {
        toast({
          variant: "destructive",
          title: `${result.skipped} rows skipped`,
          description: result.errors.slice(0, 3).join("; "),
        });
      }
      fetchVendors();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: (err as Error).message,
      });
    } finally {
      setImporting(false);
    }
  };

  const fetchVendors = async () => {
    try {
      // Fetch vendors with enrichment check
      const vendorData = await vendorsApi.list();
      // vendor_enrichment is part of the ERP/enrichment subsystem, not yet ported.
      const enrichmentData: { vendor_id: string }[] = [];


      const enrichedVendorIds = new Set((enrichmentData || []).map(e => e.vendor_id));

      // Fetch GL codes from most recent invoice for each vendor
      // Most recent GL code per vendor, derived from the invoice list.
      const allInvoices = await invoicesApi.list({ limit: 1000 });
      const glData = allInvoices
        .filter((i) => i.vendor_id && i.gl_code)
        .map((i) => ({ vendor_id: i.vendor_id as string, gl_code: i.gl_code as string }));

      const vendorGLMap = new Map<string, string>();
      (glData || []).forEach(inv => {
        if (!vendorGLMap.has(inv.vendor_id) && inv.gl_code) {
          vendorGLMap.set(inv.vendor_id, inv.gl_code);
        }
      });

      const mapped: VendorWithEnrichment[] = (vendorData || []).map(v => ({
        id: v.id,
        tenantId: String(v.tenant_id ?? ''),
        name: v.name,
        hasEnrichment: enrichedVendorIds.has(v.id),
        glCode: vendorGLMap.get(v.id) || null,
        riskScore: v.vendor_risk_score ?? null,
        status: v.status ?? null,
      }));

      setVendors(mapped.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
    } catch (error) {
      console.error('Error fetching vendors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Building2 className="h-8 w-8" />
              Vendors
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your vendor directory
            </p>
          </div>

          {isAdmin && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleImport}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload Vendor List
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Vendors ({vendors.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : vendors.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No vendors found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link 
                          to={`/vendors/${vendor.id}`}
                          className="font-medium hover:text-primary flex items-center gap-2"
                        >
                          {vendor.name}
                          {vendor.hasEnrichment && (
                            <Sparkles className="h-3 w-3 text-primary" />
                          )}
                        </Link>
                      </TableCell>

                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          vendor.status === 'active' ? 'bg-green-100 text-green-700' :
                          vendor.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                          vendor.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {vendor.status === 'pending_verification' ? 'Pending' :
                           vendor.status ? vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1) : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {vendor.riskScore !== null ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            vendor.riskScore >= 70 ? 'bg-destructive/10 text-destructive' :
                            vendor.riskScore >= 40 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {vendor.riskScore}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link to={`/vendors/${vendor.id}`}>
                          <Button variant="ghost" size="icon">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
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

export default VendorList;
