import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { erpApi } from "@/services/settings";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, Users, FileText, Building2, Calculator, Clock, Eye, RefreshCcw } from "lucide-react";
import { format } from "date-fns";

const ERPMasterData = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, isAdmin, isChecker, tenantId, loading: authLoading, canAccessSettings } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<any[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<any[]>([]);
  const [selectedPayload, setSelectedPayload] = useState<any>(null);
  const [payloadDialogOpen, setPayloadDialogOpen] = useState(false);

  // Check access - Superadmin, Admin, or Checker (tenant admin)
  const hasAccess = canAccessSettings;

  useEffect(() => {
    if (!authLoading && !hasAccess) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You don't have permission to view ERP master data.",
      });
      navigate("/dashboard");
    }
  }, [hasAccess, authLoading, navigate, toast]);

  useEffect(() => {
    if (hasAccess && !authLoading) {
      fetchAllData();
    }
  }, [hasAccess, authLoading, tenantId]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const tenantFilter = !isSuperAdmin && tenantId ? { tenant_id: tenantId } : {};

      const [vendorsRes, glRes, ccRes, deptRes, taxRes, termsRes] = await Promise.all([
        erpApi.master('vendors').then((d) => ({ data: d, error: null })),
        erpApi.master('gl-accounts').then((d) => ({ data: d, error: null })),
        erpApi.master('cost-centers').then((d) => ({ data: d, error: null })),
        erpApi.master('departments').then((d) => ({ data: d, error: null })),
        erpApi.master('tax-codes').then((d) => ({ data: d, error: null })),
        erpApi.master('payment-terms').then((d) => ({ data: d, error: null })),
      ]);

      setVendors(vendorsRes.data || []);
      setGlAccounts(glRes.data || []);
      setCostCenters(ccRes.data || []);
      setDepartments(deptRes.data || []);
      setTaxCodes(taxRes.data || []);
      setPaymentTerms(termsRes.data || []);
    } catch (error) {
      console.error('[ERPMasterData] Error fetching data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load ERP master data.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      let data = null;
      let error = new Error('ERP master-data sync is not available yet in the Azure build.');


      if (error) throw error;

      toast({
        title: "Sync Complete",
        description: `Synced ${data.processed} tenant(s) from ERP.`,
      });

      // Refresh data
      await fetchAllData();
    } catch (error: any) {
      console.error('[ERPMasterData] Sync error:', error);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error.message || "Failed to sync ERP master data.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleViewPayload = (payload: any) => {
    setSelectedPayload(payload);
    setPayloadDialogOpen(true);
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">ERP Master Data</h1>
              <p className="text-muted-foreground mt-1">
                View synchronized master data from your ERP system
              </p>
            </div>
          </div>
          <Button onClick={handleManualSync} disabled={isSyncing}>
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Sync Now
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Vendors</span>
              </div>
              <p className="text-2xl font-bold">{vendors.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">GL Accounts</span>
              </div>
              <p className="text-2xl font-bold">{glAccounts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Cost Centers</span>
              </div>
              <p className="text-2xl font-bold">{costCenters.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Departments</span>
              </div>
              <p className="text-2xl font-bold">{departments.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Tax Codes</span>
              </div>
              <p className="text-2xl font-bold">{taxCodes.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Payment Terms</span>
              </div>
              <p className="text-2xl font-bold">{paymentTerms.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Data Views */}
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="vendors">
              <TabsList className="mb-4">
                <TabsTrigger value="vendors">Vendors ({vendors.length})</TabsTrigger>
                <TabsTrigger value="gl">GL Accounts ({glAccounts.length})</TabsTrigger>
                <TabsTrigger value="costcenters">Cost Centers ({costCenters.length})</TabsTrigger>
                <TabsTrigger value="departments">Departments ({departments.length})</TabsTrigger>
                <TabsTrigger value="tax">Tax Codes ({taxCodes.length})</TabsTrigger>
                <TabsTrigger value="terms">Payment Terms ({paymentTerms.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="vendors">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ERP ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Tax ID</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-sm">{v.erp_vendor_id}</TableCell>
                        <TableCell>{v.name}</TableCell>
                        <TableCell>{v.tax_id || '—'}</TableCell>
                        <TableCell>{v.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={v.status === 'active' ? 'default' : 'secondary'}>
                            {v.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(v.updated_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPayload(v.raw_payload)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {vendors.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No vendors synced yet. Click "Sync Now" to pull data from your ERP.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="gl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GL Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glAccounts.map((gl) => (
                      <TableRow key={gl.id}>
                        <TableCell className="font-mono">{gl.erp_gl_code}</TableCell>
                        <TableCell>{gl.description || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(gl.updated_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPayload(gl.raw_payload)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {glAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No GL accounts synced yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="costcenters">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cost Center ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costCenters.map((cc) => (
                      <TableRow key={cc.id}>
                        <TableCell className="font-mono">{cc.erp_cost_center_id}</TableCell>
                        <TableCell>{cc.name}</TableCell>
                        <TableCell>{cc.department || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(cc.updated_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPayload(cc.raw_payload)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {costCenters.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No cost centers synced yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="departments">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map((dept) => (
                      <TableRow key={dept.id}>
                        <TableCell className="font-mono">{dept.erp_department_id}</TableCell>
                        <TableCell>{dept.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(dept.updated_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPayload(dept.raw_payload)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {departments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No departments synced yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="tax">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tax Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxCodes.map((tax) => (
                      <TableRow key={tax.id}>
                        <TableCell className="font-mono">{tax.erp_tax_code}</TableCell>
                        <TableCell>{tax.description || '—'}</TableCell>
                        <TableCell>{tax.rate != null ? `${tax.rate}%` : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(tax.updated_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPayload(tax.raw_payload)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {taxCodes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No tax codes synced yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="terms">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Terms ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentTerms.map((term) => (
                      <TableRow key={term.id}>
                        <TableCell className="font-mono">{term.erp_payment_terms_id}</TableCell>
                        <TableCell>{term.name}</TableCell>
                        <TableCell>{term.days != null ? `Net ${term.days}` : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(term.updated_at), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleViewPayload(term.raw_payload)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {paymentTerms.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No payment terms synced yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Payload Dialog */}
      <Dialog open={payloadDialogOpen} onOpenChange={setPayloadDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Raw ERP Payload</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
            {JSON.stringify(selectedPayload, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ERPMasterData;
