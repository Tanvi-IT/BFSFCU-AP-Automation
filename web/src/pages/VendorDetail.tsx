import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { vendorsApi } from "@/services";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { VendorRiskBadge } from "@/components/VendorRiskBadge";
import { VendorEnrichmentCard } from "@/components/VendorEnrichmentCard";
import {
  Loader2,
  Building2,
  ArrowLeft,
  Mail,
  CreditCard,
  Hash,
  Calendar,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface VendorData {
  id: string;
  tenant_id: string;
  name: string;
  external_id: string | null;
  tax_id: string | null;
  bank_account: string | null;
  ach_routing_number: string | null;
  ach_account_number: string | null;
  bank_verified: boolean;
  email_domain: string | null;
  status: string;
  source: string | null;
  vendor_risk_score: number | null;
  fraud_probability: number | null;
  created_at: string;
  updated_at: string;
}

interface EnrichmentData {
  id: string;
  legal_name: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  address: string | null;
  duplicate_risk: number | null;
  fraud_risk: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ContractData {
  id: string;
  file_path: string;
  payment_terms: string | null;
  discount_terms: string | null;
  service_period: string | null;
  termination_clauses: string | null;
  renewal_rules: string | null;
  price_change_clauses: string | null;
  net_terms: string | null;
  delivery_obligations: string | null;
  ai_summary: string | null;
  created_at: string;
}

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isAdmin, user, tenantId } = useAuth();

  const [vendor, setVendor] = useState<VendorData | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", tax_id: "", bank_account: "", ach_routing_number: "", ach_account_number: "" });
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [isVendorEditing, setIsVendorEditing] = useState(false);
  const [vendorEditForm, setVendorEditForm] = useState({ name: "", tax_id: "", bank_account: "", ach_routing_number: "", ach_account_number: "" });

  const canEnrich = isAdmin;
  const canUpload = isAdmin;
  const canApproveVendor = isAdmin;

  useEffect(() => {
    if (id) {
      fetchVendorData();
    }
  }, [id]);

  const fetchVendorData = async () => {
    try {
      // Fetch vendor
      const vendorData = await vendorsApi.get(id!);
      const vendorError = null;
      // vendor_enrichment is part of the enrichment subsystem, not yet ported.
      const enrichmentData = null;


      setEnrichment(enrichmentData);

    } catch (error: any) {
      console.error("Error fetching vendor:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load vendor details.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnrich = async () => {
    if (!vendor) return;

    setIsEnriching(true);
    try {
      // AI vendor enrichment is part of the enrichment subsystem, which has not
      // been ported yet. Surfaced clearly rather than failing silently.
      throw new Error("Vendor enrichment is not available yet in the Azure build.");
      // eslint-disable-next-line no-unreachable
      const data: any = null;

      toast({
        title: "Enrichment complete",
        description: `Vendor enriched with risk score: ${data.risk_score}`,
      });

      fetchVendorData();
    } catch (error: any) {
      console.error("Enrichment error:", error);
      toast({
        variant: "destructive",
        title: "Enrichment failed",
        description: error.message || "Failed to enrich vendor.",
      });
    } finally {
      setIsEnriching(false);
    }
  };

  const handleApproveVendor = async () => {
    if (!vendor) return;

    setIsApproving(true);
    try {
      await vendorsApi.update(vendor.id, { status: "active" } as any);
      const error = null;

      if (error) throw error;

      toast({
        title: "Vendor Approved",
        description: `${vendor.name} has been approved and is now active.`,
      });

      fetchVendorData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: error.message,
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectVendor = async () => {
    if (!vendor) return;

    setIsApproving(true);
    try {
      await vendorsApi.update(vendor.id, { status: "rejected" } as any);
      const error = null;

      if (error) throw error;

      toast({
        title: "Vendor Rejected",
        description: `${vendor.name} has been rejected.`,
      });

      fetchVendorData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Rejection Failed",
        description: error.message,
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeactivateVendor = async () => {
    if (!vendor) return;
    setIsApproving(true);
    try {
      await vendorsApi.update(vendor.id, { status: "inactive" } as any);
      const error = null;
      if (error) throw error;
      toast({ title: "Vendor Deactivated", description: `${vendor.name} has been deactivated.` });
      fetchVendorData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Deactivation Failed", description: error.message });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReactivateVendor = async () => {
    if (!vendor) return;
    setIsApproving(true);
    try {
      await vendorsApi.update(vendor.id, { status: "active" } as any);
      const error = null;
      if (error) throw error;
      toast({ title: "Vendor Reactivated", description: `${vendor.name} has been reactivated.` });
      fetchVendorData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Reactivation Failed", description: error.message });
    } finally {
      setIsApproving(false);
    }
  };

  const handleEditAndApprove = async () => {
    if (!vendor) return;
    setIsEditSaving(true);
    try {
      await vendorsApi.update(vendor.id, {
          name: editForm.name || vendor.name,
          tax_id: editForm.tax_id || vendor.tax_id,
          bank_account: editForm.bank_account || vendor.bank_account,
          ach_routing_number: editForm.ach_routing_number || vendor.ach_routing_number,
          ach_account_number: editForm.ach_account_number || vendor.ach_account_number,
          status: "active",
        } as any);
      const error = null;
      if (error) throw error;
      toast({ title: "Vendor Approved", description: `${editForm.name || vendor.name} has been updated and approved.` });
      fetchVendorData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleToggleBankVerified = async () => {
    if (!vendor) return;

    try {
      await vendorsApi.update(vendor.id, { bank_verified: !vendor.bank_verified } as any);
      const error = null;

      if (error) throw error;

      toast({
        title: vendor.bank_verified ? "Bank Unverified" : "Bank Verified",
        description: `Bank account verification status updated.`,
      });

      fetchVendorData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!vendor) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold">Vendor not found</h2>
          <Link to="/vendors">
            <Button variant="link" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Vendors
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <Link
                  to="/vendors"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Vendors
                </Link>
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-primary" />
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">{vendor.name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        className={
                          vendor.status === "active"
                            ? "bg-success text-white"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {vendor.status}
                      </Badge>
                      <VendorRiskBadge riskScore={vendor.vendor_risk_score} />
                      {vendor.source && (
                        <Badge variant="outline">{vendor.source}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {canApproveVendor && vendor.status === "pending_verification" && (
                  <>
                    <Button onClick={handleApproveVendor} disabled={isApproving}>
                      {isApproving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      Approve Vendor
                    </Button>
                    <Button variant="destructive" onClick={handleRejectVendor} disabled={isApproving}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Vendor
                    </Button>
                  </>
                )}
                {/* AI Vendor Enrichment button hidden for this phase */}
                {false && canEnrich && (
                  <Button variant="outline" onClick={handleEnrich} disabled={isEnriching}>
                    {isEnriching ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {enrichment ? "Re-enrich" : "Enrich Vendor"}
                  </Button>
                )}
              </div>
            </div>

            {/* Risk Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <ShieldAlert className="h-4 w-4" />
                    Risk Score
                  </div>
                  <VendorRiskBadge riskScore={vendor.vendor_risk_score} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <TrendingUp className="h-4 w-4" />
                    Fraud Probability
                  </div>
                  <p className={`text-2xl font-bold ${
                    (vendor.fraud_probability ?? 0) > 0.25 ? "text-destructive" : 
                    (vendor.fraud_probability ?? 0) > 0.1 ? "text-warning" : "text-success"
                  }`}>
                    {((vendor.fraud_probability ?? 0) * 100).toFixed(0)}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <CreditCard className="h-4 w-4" />
                    Bank Verified
                  </div>
                  <Badge className={vendor.bank_verified ? "bg-success" : ""} variant={vendor.bank_verified ? "default" : "outline"}>
                    {vendor.bank_verified ? "Yes" : "No"}
                  </Badge>
                </CardContent>
              </Card>
            </div>

        {/* Vendor Verification Controls - Admin Only for Pending Vendors */}
        {canApproveVendor && vendor.status === "pending_verification" && (
          <Card className="border-warning">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <ShieldAlert className="h-5 w-5" />
                Verification Controls
              </CardTitle>
              <CardDescription>Verify vendor details before approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Bank Account Verified</Label>
                  <p className="text-sm text-muted-foreground">
                    Confirm bank account details are correct
                  </p>
                </div>
                <Switch
                  checked={vendor.bank_verified}
                  onCheckedChange={handleToggleBankVerified}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Tax ID</Label>
                <input className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={vendor.tax_id || ""}
                  placeholder="Enter Tax ID"
                  onChange={e => setEditForm(f => ({ ...f, tax_id: e.target.value }))}
                  onBlur={async (e) => {
                    if (e.target.value && e.target.value !== vendor.tax_id) {
                      await vendorsApi.update(vendor.id, { taxId: e.target.value });
                      fetchVendorData();
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deactivate button for active vendors */}
        {canApproveVendor && vendor.status === "active" && (
          <Card>
            <CardContent className="pt-4">
              <Button variant="destructive" onClick={handleDeactivateVendor} disabled={isApproving} className="w-full">
                <XCircle className="h-4 w-4 mr-2" />
                Deactivate Vendor
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Reactivate button for inactive vendors */}
        {canApproveVendor && vendor.status === "inactive" && (
          <Card>
            <CardContent className="pt-4">
              <Button onClick={handleReactivateVendor} disabled={isApproving} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Reactivate Vendor
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Bank Account Verified — visible for all non-pending vendors */}
        {vendor.status !== "pending_verification" && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Bank Account Verified</Label>
                  <p className="text-sm text-muted-foreground">
                    Verification status of vendor bank account
                  </p>
                </div>
                <Switch
                  checked={vendor.bank_verified}
                  onCheckedChange={handleToggleBankVerified}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit & Re-approve for rejected vendors */}
        {canApproveVendor && vendor.status === "rejected" && (
          <Card>
            <CardHeader>
              <CardTitle>Edit & Re-approve Vendor</CardTitle>
              <CardDescription>Update vendor details and approve</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Vendor Name</Label>
                <input className="w-full border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={vendor.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Tax ID</Label>
                <input className="w-full border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={vendor.tax_id || ""}
                  onChange={e => setEditForm(f => ({ ...f, tax_id: e.target.value }))} />
              </div>
              <div>
                <Label>Bank Account</Label>
                <input className="w-full border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={vendor.bank_account || ""}
                  onChange={e => setEditForm(f => ({ ...f, bank_account: e.target.value }))} />
              </div>
              <div>
                <Label>ACH Routing Number</Label>
                <input className="w-full border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={vendor.ach_routing_number || ""}
                  onChange={e => setEditForm(f => ({ ...f, ach_routing_number: e.target.value }))} />
              </div>
              <div>
                <Label>ACH Account Number</Label>
                <input className="w-full border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-primary"
                  defaultValue={vendor.ach_account_number || ""}
                  onChange={e => setEditForm(f => ({ ...f, ach_account_number: e.target.value }))} />
              </div>
              <Button onClick={handleEditAndApprove} disabled={isEditSaving} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isEditSaving ? "Saving..." : "Save & Approve Vendor"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Vendor Info Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Vendor Information</CardTitle>
              <CardDescription>Basic vendor details and identifiers</CardDescription>
            </div>
            {canApproveVendor && (
              <div className="flex gap-2">
                {isVendorEditing && (
                  <Button size="sm" onClick={async () => {
                    try {
                      // Item 10 (Fix 4A): blanking a field must actually clear it. Empty string
                      // is saved as null instead of falling back to the old value. Name keeps a
                      // guard because every vendor needs a name; identifier fields may be cleared.
                      const toNull = (v: string) => (v && v.trim() !== "" ? v.trim() : null);
                      const newValues = {
                        name: vendorEditForm.name?.trim() || vendor.name,
                        tax_id: toNull(vendorEditForm.tax_id),
                        bank_account: toNull(vendorEditForm.bank_account),
                        ach_routing_number: toNull(vendorEditForm.ach_routing_number),
                        ach_account_number: toNull(vendorEditForm.ach_account_number),
                      };
                      await vendorsApi.update(vendor.id, newValues as any); const error = null;
                      if (error) throw error;

                      // Fix 3 Part 4: audit the vendor field edit with old -> new values.
                      const changedFields: Record<string, { old: any; new: any }> = {};
                      (["name","tax_id","bank_account","ach_routing_number","ach_account_number"] as const).forEach(f => {
                        const oldVal = (vendor as any)[f] ?? null;
                        const newVal = (newValues as any)[f] ?? null;
                        if (oldVal !== newVal) changedFields[f] = { old: oldVal, new: newVal };
                      });
                      if (Object.keys(changedFields).length > 0) {
                        // Audit is written server-side.
                      }

                      toast({ title: "Vendor Updated", description: "Details saved successfully." });
                      setIsVendorEditing(false);
                      fetchVendorData();
                    } catch (err: any) {
                      toast({ variant: "destructive", title: "Save Failed", description: err.message });
                    }
                  }}>Save</Button>
                )}
                <Button variant="outline" size="sm" onClick={() => {
                  setVendorEditForm({
                    name: vendor.name || "",
                    tax_id: vendor.tax_id || "",
                    bank_account: vendor.bank_account || "",
                    ach_routing_number: vendor.ach_routing_number || "",
                    ach_account_number: vendor.ach_account_number || "",
                  });
                  setIsVendorEditing(!isVendorEditing);
                }}>
                  {isVendorEditing ? "Cancel" : "Edit"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vendor.external_id && (
                <div className="flex items-start gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">External ID</p>
                    <code className="text-sm bg-muted px-2 py-0.5 rounded">
                      {vendor.external_id}
                    </code>
                  </div>
                </div>
              )}

              {isVendorEditing && (
                <div className="flex items-start gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor Name</p>
                    <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      value={vendorEditForm.name}
                      onChange={e => setVendorEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                </div>
              )}

              {(vendor.tax_id || isVendorEditing) && vendor.status !== "pending_verification" && (
                <div className="flex items-start gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Tax ID</p>
                    {isVendorEditing ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={vendorEditForm.tax_id}
                        onChange={e => setVendorEditForm(f => ({ ...f, tax_id: e.target.value }))} />
                    ) : (
                      <p className="text-sm font-medium">{vendor.tax_id}</p>
                    )}
                  </div>
                </div>
              )}

              {vendor.email_domain && (
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email Domain</p>
                    <p className="text-sm font-medium">{vendor.email_domain}</p>
                  </div>
                </div>
              )}

              {(vendor.bank_account || isVendorEditing) && (
                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Bank Account</p>
                    {isVendorEditing ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={vendorEditForm.bank_account}
                        onChange={e => setVendorEditForm(f => ({ ...f, bank_account: e.target.value }))} />
                    ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{vendor.bank_account || "-"}</p>
                      {vendor.bank_verified ? (
                        <Badge className="bg-success text-white text-xs">Verified</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Unverified</Badge>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              )}
              {(vendor.ach_routing_number || isVendorEditing) && (
                <div className="flex items-start gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">ACH Routing #</p>
                    {isVendorEditing ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={vendorEditForm.ach_routing_number}
                        onChange={e => setVendorEditForm(f => ({ ...f, ach_routing_number: e.target.value }))} />
                    ) : (
                      <p className="text-sm font-medium">{vendor.ach_routing_number}</p>
                    )}
                  </div>
                </div>
              )}
              {(vendor.ach_account_number || isVendorEditing) && (
                <div className="flex items-start gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">ACH Account #</p>
                    {isVendorEditing ? (
                      <input className="w-full border rounded px-2 py-1 text-sm mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={vendorEditForm.ach_account_number}
                        onChange={e => setVendorEditForm(f => ({ ...f, ach_account_number: e.target.value }))} />
                    ) : (
                      <p className="text-sm font-medium">{vendor.ach_account_number || "-"}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">{new Date(vendor.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-sm">{new Date(vendor.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

                {/* AI Vendor Enrichment hidden for this phase — feature disabled, code retained for future re-enable */}
                {false && (
                <Tabs defaultValue="enrichment" className="w-full">
          <TabsList>
            <TabsTrigger value="enrichment">AI Enrichment</TabsTrigger>
          </TabsList>

          <TabsContent value="enrichment" className="mt-4">
            <VendorEnrichmentCard
              enrichment={enrichment}
              vendorRiskScore={vendor.vendor_risk_score}
              isLoading={isEnriching}
              onEnrich={handleEnrich}
              canEnrich={canEnrich}
            />
          </TabsContent>


        </Tabs>
                )}
      </div>
    </Layout>
  );
}
