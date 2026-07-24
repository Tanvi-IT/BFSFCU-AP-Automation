import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vendorsApi } from "@/services";
import { invoicesApi } from "@/services/invoices";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";
import {
  Loader2,
  Building2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Upload,
  Search,
} from "lucide-react";

interface VendorWithEnrichment {
  id: string;
  tenantId: string;
  name: string;
  hasEnrichment: boolean;
  glCode: string | null;
  externalId: string | null;
  status: string | null;
}

/** Rows per page. The directory runs to hundreds of vendors after an import. */
const PAGE_SIZE = 25;

const VendorList = () => {
  const [vendors, setVendors] = useState<VendorWithEnrichment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchVendors();
  }, []);

  // Filtered in the browser: the whole directory is already loaded, and a
  // few hundred rows is nothing to scan.
  const filteredVendors = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.externalId ?? "").toLowerCase().includes(term) ||
        (v.glCode ?? "").toLowerCase().includes(term)
    );
  }, [vendors, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredVendors.length / PAGE_SIZE));
  // Clamp rather than store a page that no longer exists: narrowing the search
  // while on page 9 would otherwise show an empty table.
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredVendors.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setImporting(true);
    try {
      const result = await vendorsApi.import(file);
      const parts = [`${result.inserted} added`, `${result.updated} updated`];
      if (result.removed) parts.push(`${result.removed} removed`);
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      toast({
        title: "Vendor list replaced",
        description: parts.join(", ") + ".",
      });
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
      const vendorData = await vendorsApi.listAll();
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
        externalId: (v.external_id as string | null) ?? null,
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
              Vendors are added only by an admin uploading a spreadsheet.
              Processing an invoice never creates one.
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

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by vendor name, vendor ID, or GL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              All Vendors ({filteredVendors.length}
              {searchQuery.trim() ? ` of ${vendors.length}` : ""})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {searchQuery.trim() ? "No vendors match this search" : "No vendors found"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Vendor ID</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <span className="font-medium flex items-center gap-2">
                          {vendor.name}
                          {vendor.hasEnrichment && (
                            <Sparkles className="h-3 w-3 text-primary" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {vendor.externalId || "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          vendor.status === 'active' ? 'bg-green-100 text-green-700' :
                          vendor.status === 'blocked' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {vendor.status === 'pending_verification' ? 'Pending' :
                           vendor.status === 'active' ? 'Approved' :
                           vendor.status ? vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1) : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {filteredVendors.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Showing {currentPage * PAGE_SIZE + 1}–
                  {Math.min((currentPage + 1) * PAGE_SIZE, filteredVendors.length)} of{" "}
                  {filteredVendors.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={currentPage >= pageCount - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default VendorList;
