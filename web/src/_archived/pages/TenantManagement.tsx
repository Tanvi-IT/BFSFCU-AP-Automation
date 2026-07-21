import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Tenant } from "@/types/invoice";
import { Loader2, Shield, Building2, Plus, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface NewTenantForm {
  name: string;
  erpType: string;
  emailAlias: string;
  makerEmail: string;
  makerPassword: string;
  makerName: string;
  checkerEmail: string;
  checkerPassword: string;
  checkerName: string;
}

const TenantManagement = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTenant, setNewTenant] = useState<NewTenantForm>({
    name: "",
    erpType: "",
    emailAlias: "",
    makerEmail: "",
    makerPassword: "",
    makerName: "",
    checkerEmail: "",
    checkerPassword: "",
    checkerName: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    } else {
      setIsLoading(false);
    }
  }, [isSuperAdmin]);

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const mapped: Tenant[] = (data || []).map(t => ({
        id: t.id,
        name: t.name,
        erpType: t.erp_type,
        isActive: t.is_active,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));
      setTenants(mapped);
    } catch (error) {
      console.error('Error fetching tenants:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load tenants",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTenantStatus = async (tenantId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ is_active: !currentStatus })
        .eq('id', tenantId);

      if (error) throw error;

      toast({
        title: "Status updated",
        description: `Tenant has been ${!currentStatus ? 'activated' : 'deactivated'}`,
      });

      fetchTenants();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update tenant status",
      });
    }
  };

  const validateForm = (): string | null => {
    if (!newTenant.name.trim()) return "Tenant name is required";
    if (!newTenant.emailAlias.trim()) return "Email alias is required";
    // Validate email alias format (lowercase alphanumeric and hyphens only)
    const aliasRegex = /^[a-z0-9-]+$/;
    if (!aliasRegex.test(newTenant.emailAlias)) {
      return "Email alias must be lowercase letters, numbers, and hyphens only";
    }
    if (!newTenant.makerEmail.trim()) return "Maker email is required";
    if (!newTenant.makerPassword || newTenant.makerPassword.length < 8) 
      return "Maker password must be at least 8 characters";
    if (!newTenant.checkerEmail.trim()) return "Checker email is required";
    if (!newTenant.checkerPassword || newTenant.checkerPassword.length < 8) 
      return "Checker password must be at least 8 characters";
    if (newTenant.makerEmail === newTenant.checkerEmail) 
      return "Maker and Checker must have different email addresses";
    return null;
  };

  const createTenant = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: validationError,
      });
      return;
    }

    setIsCreating(true);
    try {
      // Step 1: Create tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: newTenant.name.trim(),
          erp_type: newTenant.erpType || null,
          email_alias: newTenant.emailAlias.toLowerCase(),
          is_active: true,
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // Step 2: Create maker and checker users via edge function
      const { data: usersData, error: usersError } = await supabase.functions.invoke(
        'create-tenant-users',
        {
          body: {
            tenant_id: tenantData.id,
            maker_email: newTenant.makerEmail.trim(),
            maker_password: newTenant.makerPassword,
            maker_name: newTenant.makerName.trim() || "Maker User",
            checker_email: newTenant.checkerEmail.trim(),
            checker_password: newTenant.checkerPassword,
            checker_name: newTenant.checkerName.trim() || "Checker User",
          },
        }
      );

      if (usersError) {
        // Rollback: delete the tenant if user creation fails
        await supabase.from('tenants').delete().eq('id', tenantData.id);
        throw new Error(usersError.message || "Failed to create users");
      }

      if (usersData?.error) {
        // Rollback: delete the tenant if user creation fails
        await supabase.from('tenants').delete().eq('id', tenantData.id);
        throw new Error(usersData.error);
      }

      toast({
        title: "Tenant created successfully",
        description: `${newTenant.name} has been added with Maker and Checker users`,
      });

      setIsDialogOpen(false);
      setNewTenant({
        name: "",
        erpType: "",
        emailAlias: "",
        makerEmail: "",
        makerPassword: "",
        makerName: "",
        checkerEmail: "",
        checkerPassword: "",
        checkerName: "",
      });
      fetchTenants();
    } catch (error: any) {
      console.error("Error creating tenant:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create tenant",
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="mt-2 text-muted-foreground">This page is only accessible to superadmins</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Shield className="h-8 w-8 text-primary" />
              Tenant Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage customer tenants (Superadmin only)
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Tenant</DialogTitle>
                <DialogDescription>
                  Create a new tenant with mandatory Maker and Checker users for compliance
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Tenant Info */}
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Tenant Information
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="name">Tenant Name *</Label>
                    <Input
                      id="name"
                      placeholder="Acme Corporation"
                      value={newTenant.name}
                      onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="erpType">ERP Type</Label>
                    <Select
                      value={newTenant.erpType}
                      onValueChange={(value) => setNewTenant({ ...newTenant, erpType: value })}
                    >
                      <SelectTrigger id="erpType">
                        <SelectValue placeholder="Select ERP type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sap">SAP</SelectItem>
                        <SelectItem value="oracle">Oracle</SelectItem>
                        <SelectItem value="netsuite">NetSuite</SelectItem>
                        <SelectItem value="quickbooks">QuickBooks</SelectItem>
                        <SelectItem value="xero">Xero</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="emailAlias">Invoice Email Alias *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="emailAlias"
                        placeholder="company-name"
                        value={newTenant.emailAlias}
                        onChange={(e) => setNewTenant({ ...newTenant, emailAlias: e.target.value.toLowerCase() })}
                        className="flex-1"
                      />
                      <span className="flex items-center text-sm text-muted-foreground">@clarusap.com</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lowercase letters, numbers, and hyphens only
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Maker User */}
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Maker User (Invoice Uploader)
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Can upload invoices and view data, but cannot approve or reject.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="makerEmail">Email *</Label>
                      <Input
                        id="makerEmail"
                        type="email"
                        placeholder="maker@company.com"
                        value={newTenant.makerEmail}
                        onChange={(e) => setNewTenant({ ...newTenant, makerEmail: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="makerName">Display Name</Label>
                      <Input
                        id="makerName"
                        placeholder="John Doe"
                        value={newTenant.makerName}
                        onChange={(e) => setNewTenant({ ...newTenant, makerName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="makerPassword">Password * (min 8 characters)</Label>
                      <Input
                        id="makerPassword"
                        type="password"
                        placeholder="••••••••"
                        value={newTenant.makerPassword}
                        onChange={(e) => setNewTenant({ ...newTenant, makerPassword: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Checker User */}
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Checker User (Approver)
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Can do everything Maker can, plus approve/reject invoices and manage vendors.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="checkerEmail">Email *</Label>
                      <Input
                        id="checkerEmail"
                        type="email"
                        placeholder="checker@company.com"
                        value={newTenant.checkerEmail}
                        onChange={(e) => setNewTenant({ ...newTenant, checkerEmail: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="checkerName">Display Name</Label>
                      <Input
                        id="checkerName"
                        placeholder="Jane Smith"
                        value={newTenant.checkerName}
                        onChange={(e) => setNewTenant({ ...newTenant, checkerName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="checkerPassword">Password * (min 8 characters)</Label>
                      <Input
                        id="checkerPassword"
                        type="password"
                        placeholder="••••••••"
                        value={newTenant.checkerPassword}
                        onChange={(e) => setNewTenant({ ...newTenant, checkerPassword: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createTenant} disabled={isCreating}>
                    {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Tenant
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Tenants ({tenants.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : tenants.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">No tenants found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ERP Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell>
                        {tenant.emailAlias ? (
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {tenant.emailAlias}@clarusap.com
                          </code>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not configured</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tenant.erpType ? (
                          <code className="rounded bg-muted px-2 py-1 text-sm uppercase">
                            {tenant.erpType}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            tenant.isActive
                              ? 'bg-success text-white'
                              : 'bg-destructive text-white'
                          }
                        >
                          {tenant.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(tenant.createdAt), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={tenant.isActive ? "destructive" : "default"}
                          size="sm"
                          onClick={() => toggleTenantStatus(tenant.id, tenant.isActive)}
                        >
                          {tenant.isActive ? 'Deactivate' : 'Activate'}
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

export default TenantManagement;
