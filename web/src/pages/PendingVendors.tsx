import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { vendorsApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Building2, CheckCircle, GitMerge, Pencil, ArrowLeft, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface PendingVendor {
  id: string;
  name: string;
  taxId: string | null;
  emailDomain: string | null;
  bankAccount: string | null;
  source: string;
  createdAt: string;
}

interface ActiveVendor {
  id: string;
  name: string;
}

const PendingVendors = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  
  const [vendors, setVendors] = useState<PendingVendor[]>([]);
  const [activeVendors, setActiveVendors] = useState<ActiveVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState<PendingVendor | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [editForm, setEditForm] = useState({ name: "", taxId: "", emailDomain: "" });
  const [isProcessing, setIsProcessing] = useState(false);

  // Only Admin and Superadmin can access vendor verification
  const canManageVendors = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (!authLoading && !canManageVendors) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "Only administrators can manage vendor verification.",
      });
      navigate("/vendors");
    }
  }, [authLoading, canManageVendors, navigate, toast]);

  useEffect(() => {
    if (canManageVendors) {
      fetchVendors();
    }
  }, [canManageVendors]);

  const fetchVendors = async () => {
    try {
      const [pendingRes, activeRes] = await Promise.all([
        vendorsApi.list({ status: 'pending_verification' }).then((d) => ({ data: d, error: null })),
        vendorsApi.list({ status: 'active' }).then((d) => ({ data: d, error: null })),
      ]);

      if (pendingRes.error) throw pendingRes.error;
      if (activeRes.error) throw activeRes.error;

      setVendors((pendingRes.data || []).map(v => ({
        id: v.id,
        name: v.name,
        taxId: v.tax_id,
        emailDomain: v.email_domain,
        bankAccount: v.bank_account,
        source: v.source || 'manual',
        createdAt: v.created_at,
      })));

      setActiveVendors((activeRes.data || []).map(v => ({
        id: v.id,
        name: v.name,
      })));
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load vendors",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const approveVendor = async (vendor: PendingVendor) => {
    setIsProcessing(true);
    try {
      await vendorsApi.setStatus(vendor.id, 'active');

      toast({
        title: "Vendor approved",
        description: `${vendor.name} is now active`,
      });
      fetchVendors();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve vendor",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openMergeDialog = (vendor: PendingVendor) => {
    setSelectedVendor(vendor);
    setMergeTargetId("");
    setMergeDialogOpen(true);
  };

  const openEditDialog = (vendor: PendingVendor) => {
    setSelectedVendor(vendor);
    setEditForm({
      name: vendor.name,
      taxId: vendor.taxId || "",
      emailDomain: vendor.emailDomain || "",
    });
    setEditDialogOpen(true);
  };

  const mergeVendor = async () => {
    if (!selectedVendor || !mergeTargetId) return;
    
    setIsProcessing(true);
    try {
      // Reassign + delete happen in one server transaction.
      await vendorsApi.merge(selectedVendor.id, mergeTargetId);

      toast({
        title: "Vendor merged",
        description: `${selectedVendor.name} has been merged successfully`,
      });
      
      setMergeDialogOpen(false);
      setSelectedVendor(null);
      fetchVendors();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to merge vendor",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateVendor = async () => {
    if (!selectedVendor) return;
    
    setIsProcessing(true);
    try {
      await vendorsApi.update(selectedVendor.id, {
        name: editForm.name,
        ...(editForm.taxId ? { taxId: editForm.taxId } : {}),
      });
      await vendorsApi.setStatus(selectedVendor.id, 'active');
      const error = null;

      if (error) throw error;

      toast({
        title: "Vendor updated",
        description: `${editForm.name} has been updated and approved`,
      });
      
      setEditDialogOpen(false);
      setSelectedVendor(null);
      fetchVendors();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update vendor",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!canManageVendors) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            Only administrators can access vendor verification.
          </p>
          <Button onClick={() => navigate("/vendors")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Vendors
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Pending Vendors</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve auto-detected vendors from invoices
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Vendors Pending Verification ({vendors.length})</CardTitle>
            <CardDescription>
              These vendors were automatically detected from uploaded invoices
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {vendors.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4">No pending vendors</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Tax ID</TableHead>
                    <TableHead>Email Domain</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Detected On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>
                        {vendor.taxId || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {vendor.emailDomain || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {vendor.source === 'auto' ? 'Auto-detected' : 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(vendor.createdAt), 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(vendor)}
                            disabled={isProcessing}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMergeDialog(vendor)}
                            disabled={isProcessing || activeVendors.length === 0}
                          >
                            <GitMerge className="h-4 w-4 mr-1" />
                            Merge
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => approveVendor(vendor)}
                            disabled={isProcessing}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Merge Dialog */}
        <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Merge Vendor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Merge <strong>{selectedVendor?.name}</strong> into an existing vendor. 
                All invoices will be reassigned to the target vendor.
              </p>
              <div className="space-y-2">
                <Label>Select Target Vendor</Label>
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMergeDialogOpen(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={mergeVendor} disabled={!mergeTargetId || isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Merge Vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit & Approve Vendor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Vendor Name *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tax">Tax ID</Label>
                <Input
                  id="edit-tax"
                  value={editForm.taxId}
                  onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-domain">Email Domain</Label>
                <Input
                  id="edit-domain"
                  value={editForm.emailDomain}
                  onChange={(e) => setEditForm({ ...editForm, emailDomain: e.target.value })}
                  placeholder="e.g., vendor.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={updateVendor} disabled={!editForm.name.trim() || isProcessing}>
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default PendingVendors;