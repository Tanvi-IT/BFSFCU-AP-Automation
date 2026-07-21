import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutoApprovalRules, AutoApprovalRule, ApprovalRuleConditions } from "@/hooks/useAutoApprovalRules";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2, Edit, Zap, ShieldCheck, AlertTriangle, XCircle, TestTube, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ANOMALY_TYPES = [
  { value: "price_spike", label: "Price Spike" },
  { value: "billing_spike", label: "Billing Spike" },
  { value: "bank_change", label: "Bank Account Change" },
  { value: "new_gl_code", label: "New GL Code" },
  { value: "duplicate_invoice", label: "Duplicate Invoice" },
  { value: "tax_mismatch", label: "Tax Mismatch" },
  { value: "currency_change", label: "Currency Change" },
  { value: "contract_mismatch", label: "Contract Mismatch" },
];

const RULE_TYPE_CONFIG = {
  auto_approve: { icon: ShieldCheck, color: "text-green-500", bgColor: "bg-green-500/10", label: "Auto-Approve" },
  auto_reject: { icon: XCircle, color: "text-red-500", bgColor: "bg-red-500/10", label: "Auto-Reject" },
  auto_route: { icon: Zap, color: "text-blue-500", bgColor: "bg-blue-500/10", label: "Auto-Route" },
  auto_block: { icon: AlertTriangle, color: "text-orange-500", bgColor: "bg-orange-500/10", label: "Auto-Block" },
};

export default function AutoApprovals() {
  const { rules, loading, createRule, updateRule, deleteRule, toggleRule } = useAutoApprovalRules();
  const { isSuperAdmin, isAdmin, tenantId } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoApprovalRule | null>(null);
  const [testMode, setTestMode] = useState(false);

  const canManageRules = isSuperAdmin || isAdmin;

  const globalRules = rules.filter(r => r.scope === "global");
  const tenantRules = rules.filter(r => r.scope === "tenant");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Automated Approvals</h1>
            <p className="text-muted-foreground mt-1">
              Configure AI-driven approval rules for invoice processing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setTestMode(!testMode)}>
              <TestTube className="h-4 w-4 mr-2" />
              Test Mode
            </Button>
            {canManageRules && (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Rule
                  </Button>
                </DialogTrigger>
                <RuleDialog
                  onSave={async (rule) => {
                    await createRule(rule);
                    setIsCreateOpen(false);
                  }}
                  onClose={() => setIsCreateOpen(false)}
                  isSuperAdmin={isSuperAdmin}
                  tenantId={tenantId}
                />
              </Dialog>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All Rules ({rules.length})</TabsTrigger>
              {isSuperAdmin && <TabsTrigger value="global">Global ({globalRules.length})</TabsTrigger>}
              <TabsTrigger value="tenant">Tenant ({tenantRules.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <RulesList
                rules={rules}
                onToggle={toggleRule}
                onEdit={setEditingRule}
                onDelete={deleteRule}
                canManage={canManageRules}
              />
            </TabsContent>

            {isSuperAdmin && (
              <TabsContent value="global" className="space-y-4">
                <RulesList
                  rules={globalRules}
                  onToggle={toggleRule}
                  onEdit={setEditingRule}
                  onDelete={deleteRule}
                  canManage={canManageRules}
                />
              </TabsContent>
            )}

            <TabsContent value="tenant" className="space-y-4">
              <RulesList
                rules={tenantRules}
                onToggle={toggleRule}
                onEdit={setEditingRule}
                onDelete={deleteRule}
                canManage={canManageRules}
              />
            </TabsContent>
          </Tabs>
        )}

        {testMode && (
          <Card className="border-dashed border-2 border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Test Mode
              </CardTitle>
              <CardDescription>
                Upload a sample invoice to see how rules would be applied
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <p>Upload a PDF invoice to test the approval engine</p>
                <Button variant="outline" className="mt-4">
                  Upload Test Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {editingRule && (
          <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
            <RuleDialog
              rule={editingRule}
              onSave={async (updates) => {
                await updateRule(editingRule.id, updates);
                setEditingRule(null);
              }}
              onClose={() => setEditingRule(null)}
              isSuperAdmin={isSuperAdmin}
              tenantId={tenantId}
            />
          </Dialog>
        )}
      </div>
    </Layout>
  );
}

function RulesList({
  rules,
  onToggle,
  onEdit,
  onDelete,
  canManage,
}: {
  rules: AutoApprovalRule[];
  onToggle: (id: string, active: boolean) => void;
  onEdit: (rule: AutoApprovalRule) => void;
  onDelete: (id: string) => void;
  canManage: boolean;
}) {
  if (rules.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No approval rules configured. Create one to get started.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {rules.map((rule) => {
        const config = RULE_TYPE_CONFIG[rule.rule_type];
        const Icon = config.icon;

        return (
          <Card key={rule.id} className={cn(!rule.is_active && "opacity-60")}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={cn("p-2 rounded-lg", config.bgColor)}>
                    <Icon className={cn("h-5 w-5", config.color)} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{rule.rule_name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      <Badge variant={rule.scope === "global" ? "default" : "secondary"} className="text-xs">
                        {rule.scope}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatConditions(rule.conditions)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Priority: {rule.priority}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {canManage && (
                    <>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => onToggle(rule.id, checked)}
                      />
                      <Button variant="ghost" size="icon" onClick={() => onEdit(rule)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function formatConditions(conditions: ApprovalRuleConditions): string {
  const parts: string[] = [];
  
  if (conditions.risk_score_max !== undefined) {
    parts.push(`Risk ≤ ${conditions.risk_score_max}`);
  }
  if (conditions.risk_score_min !== undefined) {
    parts.push(`Risk ≥ ${conditions.risk_score_min}`);
  }
  if (conditions.amount_max !== undefined) {
    parts.push(`Amount ≤ $${conditions.amount_max.toLocaleString()}`);
  }
  if (conditions.amount_min !== undefined) {
    parts.push(`Amount ≥ $${conditions.amount_min.toLocaleString()}`);
  }
  if (conditions.vendor_reputation_min !== undefined) {
    parts.push(`Vendor Rep ≥ ${conditions.vendor_reputation_min}`);
  }
  if (conditions.block_critical_anomalies) {
    parts.push("Block Critical Anomalies");
  }
  if (conditions.anomaly_types?.length) {
    parts.push(`Anomalies: ${conditions.anomaly_types.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" • ") : "No conditions set";
}

function RuleDialog({
  rule,
  onSave,
  onClose,
  isSuperAdmin,
  tenantId,
}: {
  rule?: AutoApprovalRule;
  onSave: (rule: any) => Promise<void>;
  onClose: () => void;
  isSuperAdmin: boolean;
  tenantId: string | null;
}) {
  const [formData, setFormData] = useState({
    rule_name: rule?.rule_name || "",
    rule_type: rule?.rule_type || "auto_approve",
    scope: rule?.scope || (isSuperAdmin ? "global" : "tenant"),
    priority: rule?.priority || 0,
    conditions: rule?.conditions || {} as ApprovalRuleConditions,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      ...formData,
      tenant_id: formData.scope === "tenant" ? tenantId : null,
    });
    setSaving(false);
  };

  const updateCondition = (key: keyof ApprovalRuleConditions, value: any) => {
    setFormData(prev => ({
      ...prev,
      conditions: { ...prev.conditions, [key]: value },
    }));
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{rule ? "Edit Rule" : "Create Approval Rule"}</DialogTitle>
        <DialogDescription>
          Configure conditions for automated invoice approval decisions
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Rule Name</Label>
            <Input
              value={formData.rule_name}
              onChange={(e) => setFormData(prev => ({ ...prev, rule_name: e.target.value }))}
              placeholder="e.g., Low Risk Auto-Approve"
            />
          </div>
          <div className="space-y-2">
            <Label>Rule Type</Label>
            <Select
              value={formData.rule_type}
              onValueChange={(v) => setFormData(prev => ({ ...prev, rule_type: v as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_approve">Auto-Approve</SelectItem>
                <SelectItem value="auto_reject">Auto-Reject</SelectItem>
                <SelectItem value="auto_route">Auto-Route to Checker</SelectItem>
                <SelectItem value="auto_block">Auto-Block</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {isSuperAdmin && (
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={formData.scope}
                onValueChange={(v) => setFormData(prev => ({ ...prev, scope: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (All Tenants)</SelectItem>
                  <SelectItem value="tenant">Tenant-Specific</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Priority (lower = higher priority)</Label>
            <Input
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <h4 className="font-medium">Conditions</h4>

          <div className="space-y-3">
            <Label>Risk Score Range (0-100)</Label>
            <div className="flex items-center gap-4">
              <Input
                type="number"
                placeholder="Min"
                value={formData.conditions.risk_score_min || ""}
                onChange={(e) => updateCondition("risk_score_min", e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-24"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="number"
                placeholder="Max"
                value={formData.conditions.risk_score_max || ""}
                onChange={(e) => updateCondition("risk_score_max", e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-24"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Invoice Amount Range ($)</Label>
            <div className="flex items-center gap-4">
              <Input
                type="number"
                placeholder="Min"
                value={formData.conditions.amount_min || ""}
                onChange={(e) => updateCondition("amount_min", e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-32"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="number"
                placeholder="Max"
                value={formData.conditions.amount_max || ""}
                onChange={(e) => updateCondition("amount_max", e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-32"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Minimum Vendor Reputation Score</Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[formData.conditions.vendor_reputation_min || 0]}
                onValueChange={([v]) => updateCondition("vendor_reputation_min", v)}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="w-12 text-right font-mono">
                {formData.conditions.vendor_reputation_min || 0}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Block invoices with critical anomalies</Label>
            <Switch
              checked={formData.conditions.block_critical_anomalies || false}
              onCheckedChange={(v) => updateCondition("block_critical_anomalies", v)}
            />
          </div>

          <div className="space-y-3">
            <Label>Require checker review above amount ($)</Label>
            <Input
              type="number"
              placeholder="e.g., 50000"
              value={formData.conditions.require_checker_above_amount || ""}
              onChange={(e) => updateCondition("require_checker_above_amount", e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !formData.rule_name}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {rule ? "Update Rule" : "Create Rule"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
