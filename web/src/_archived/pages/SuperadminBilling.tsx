import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import {
  ArrowLeft,
  Loader2,
  Save,
  Calendar,
  DollarSign,
  Building2,
  CreditCard,
  History,
  AlertCircle,
  Pause,
  Play,
} from "lucide-react";
import { format } from "date-fns";

interface TenantBilling {
  id: string;
  name: string;
  plan: string | null;
  billing_mode: string | null;
  billing_override_amount: number | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  plan_renews_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_active: boolean;
}

interface AuditLog {
  id: string;
  action: string;
  previous_value: unknown;
  new_value: unknown;
  notes: string | null;
  created_at: string;
}

const PLANS = [
  { value: "free_trial", label: "Free Trial" },
  { value: "starter", label: "Starter ($4,800/year)" },
  { value: "growth", label: "Growth ($15,000/year)" },
  { value: "enterprise", label: "Enterprise (Custom)" },
];

export default function SuperadminBilling() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tenant, setTenant] = useState<TenantBilling | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Form state
  const [plan, setPlan] = useState("");
  const [billingMode, setBillingMode] = useState("stripe");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate("/dashboard");
      return;
    }
    loadTenantData();
  }, [tenantId, isSuperAdmin, navigate]);

  const loadTenantData = async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      // Load tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from("tenants")
        .select("id, name, plan, billing_mode, billing_override_amount, trial_starts_at, trial_ends_at, plan_renews_at, stripe_customer_id, stripe_subscription_id, is_active")
        .eq("id", tenantId)
        .single();

      if (tenantError) throw tenantError;
      
      setTenant(tenantData);
      setPlan(tenantData.plan || "free_trial");
      setBillingMode(tenantData.billing_mode || "stripe");
      setOverrideAmount(tenantData.billing_override_amount?.toString() || "");
      setTrialEndsAt(tenantData.trial_ends_at ? tenantData.trial_ends_at.split("T")[0] : "");
      setIsPaused(!tenantData.is_active);

      // Load audit logs
      const { data: logs } = await supabase
        .from("billing_audit_log")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);

      setAuditLogs(logs || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load tenant data",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId || !user) return;

    setIsSaving(true);
    try {
      const previousValues = {
        plan: tenant?.plan,
        billing_mode: tenant?.billing_mode,
        billing_override_amount: tenant?.billing_override_amount,
        trial_ends_at: tenant?.trial_ends_at,
        is_active: tenant?.is_active,
      };

      const newValues = {
        plan,
        billing_mode: billingMode,
        billing_override_amount: overrideAmount ? parseFloat(overrideAmount) : null,
        trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
        is_active: !isPaused,
      };

      // Update tenant
      const { error: updateError } = await supabase
        .from("tenants")
        .update(newValues)
        .eq("id", tenantId);

      if (updateError) throw updateError;

      // Log the change
      await supabase.from("billing_audit_log").insert({
        tenant_id: tenantId,
        admin_id: user.id,
        action: "billing_update",
        previous_value: previousValues,
        new_value: newValues,
        notes: notes || null,
      });

      toast({
        title: "Saved",
        description: "Billing configuration updated successfully.",
      });

      setNotes("");
      await loadTenantData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save billing configuration",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExtendTrial = async (days: number) => {
    if (!tenantId || !user) return;

    try {
      const currentEnd = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
      const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);

      await supabase
        .from("tenants")
        .update({ trial_ends_at: newEnd.toISOString() })
        .eq("id", tenantId);

      await supabase.from("billing_audit_log").insert({
        tenant_id: tenantId,
        admin_id: user.id,
        action: "trial_extended",
        previous_value: { trial_ends_at: tenant?.trial_ends_at },
        new_value: { trial_ends_at: newEnd.toISOString(), days_added: days },
        notes: `Extended trial by ${days} days`,
      });

      toast({
        title: "Trial Extended",
        description: `Added ${days} days to trial period.`,
      });

      await loadTenantData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to extend trial",
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!tenant) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-lg">Tenant not found</p>
          <Button onClick={() => navigate("/superadmin/tenants")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tenants
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/superadmin/tenants")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Billing Control Panel</h1>
            <p className="text-muted-foreground">{tenant.name}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Current Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Current Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Plan</span>
                <Badge variant={tenant.plan === "enterprise" ? "default" : "secondary"}>
                  {tenant.plan || "Free Trial"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={tenant.is_active ? "default" : "destructive"}>
                  {tenant.is_active ? "Active" : "Paused"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Billing Mode</span>
                <span className="font-medium capitalize">{tenant.billing_mode || "Stripe"}</span>
              </div>
              {tenant.trial_ends_at && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Trial Ends</span>
                  <span className="font-medium">
                    {format(new Date(tenant.trial_ends_at), "MMM d, yyyy")}
                  </span>
                </div>
              )}
              {tenant.plan_renews_at && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Renews</span>
                  <span className="font-medium">
                    {format(new Date(tenant.plan_renews_at), "MMM d, yyyy")}
                  </span>
                </div>
              )}
              {tenant.billing_override_amount && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Custom Price</span>
                  <span className="font-medium text-primary">
                    ${tenant.billing_override_amount.toLocaleString()}/year
                  </span>
                </div>
              )}
              {tenant.stripe_customer_id && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Stripe Customer ID</span>
                  <p className="font-mono text-xs truncate">{tenant.stripe_customer_id}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Configuration */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Edit Billing Configuration
              </CardTitle>
              <CardDescription>
                Changes will be logged to the audit trail
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan">Plan</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANS.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingMode">Billing Mode</Label>
                  <Select value={billingMode} onValueChange={setBillingMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">Stripe (Auto)</SelectItem>
                      <SelectItem value="manual">Manual Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="overrideAmount">Price Override ($/year)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="overrideAmount"
                      type="number"
                      value={overrideAmount}
                      onChange={e => setOverrideAmount(e.target.value)}
                      placeholder="Leave blank for standard pricing"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="trialEndsAt">Trial End Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="trialEndsAt"
                      type="date"
                      value={trialEndsAt}
                      onChange={e => setTrialEndsAt(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <Switch
                  id="paused"
                  checked={isPaused}
                  onCheckedChange={setIsPaused}
                />
                <div className="flex-1">
                  <Label htmlFor="paused" className="font-medium">
                    {isPaused ? "Subscription Paused" : "Subscription Active"}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {isPaused
                      ? "User cannot access the platform"
                      : "User has full access to the platform"}
                  </p>
                </div>
                {isPaused ? (
                  <Pause className="h-5 w-5 text-destructive" />
                ) : (
                  <Play className="h-5 w-5 text-green-500" />
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Quick Trial Extension</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleExtendTrial(7)}>
                    +7 Days
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExtendTrial(14)}>
                    +14 Days
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExtendTrial(30)}>
                    +30 Days
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Change Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for this change..."
                  rows={2}
                />
              </div>

              <Button onClick={handleSave} disabled={isSaving} className="w-full">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Audit Log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Change History
            </CardTitle>
            <CardDescription>
              All billing configuration changes are logged for compliance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No changes recorded yet
              </p>
            ) : (
              <div className="space-y-4">
                {auditLogs.map(log => (
                  <div key={log.id} className="flex gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium capitalize">
                          {log.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-sm text-muted-foreground">{log.notes}</p>
                      )}
                      <div className="mt-2 text-xs font-mono text-muted-foreground">
                        {log.previous_value && (
                          <span className="text-red-500">
                            -{JSON.stringify(log.previous_value)}
                          </span>
                        )}
                        {log.new_value && (
                          <span className="text-green-500 ml-2">
                            +{JSON.stringify(log.new_value)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
