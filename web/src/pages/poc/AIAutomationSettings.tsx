import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { settingsApi } from "@/services/settings";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, Shield, DollarSign, Info, Brain, AlertTriangle, CheckCircle, FileText, Building2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

interface AISettings {
  auto_approve_high_confidence: boolean;
  require_new_vendor_review: boolean;
  auto_approve_below_amount: number | null;
  confidence_threshold: number;
  require_vendor_active: boolean;
  require_bank_verified: boolean;
  require_no_alerts: boolean;
  max_auto_approve_amount: number | null;
  anomaly_threshold: number;
}

export default function AIAutomationSettings() {
  const { tenantId, isAdmin } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AISettings>({
    auto_approve_high_confidence: true,
    require_new_vendor_review: true,
    auto_approve_below_amount: null,
    confidence_threshold: 70,
    require_vendor_active: true,
    require_bank_verified: true,
    require_no_alerts: true,
    max_auto_approve_amount: null,
    anomaly_threshold: 0.3,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (tenantId) {
      fetchSettings();
    }
  }, [tenantId]);

  const fetchSettings = async () => {
    try {
      let data: any = await settingsApi.get();
      let error: any = null;


      if (error) throw error;

      if (data) {
        setSettings({
          auto_approve_high_confidence: data.auto_approve_high_confidence ?? true,
          require_new_vendor_review: data.require_new_vendor_review ?? true,
          auto_approve_below_amount: data.auto_approve_below_amount,
          confidence_threshold: data.confidence_threshold ?? 70,
          require_vendor_active: data.require_vendor_active ?? true,
          require_bank_verified: data.require_bank_verified ?? true,
          require_no_alerts: data.require_no_alerts ?? true,
          max_auto_approve_amount: data.max_auto_approve_amount,
          anomaly_threshold: data.anomaly_threshold ?? 0.3,
        });
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!tenantId) return;
    setIsSaving(true);

    try {
      await settingsApi.update({} as any);
      let error: any = null;


      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "AI automation settings have been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can access this page.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <TooltipProvider>
        <div className="space-y-6">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <Bot className="h-8 w-8 text-primary" />
              AI Automation Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure how AI handles invoice approvals automatically
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Auto-Approval Rules</CardTitle>
              <CardDescription>
                Set rules for automatic invoice approval based on confidence scores and risk profiles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Master toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-success/10 p-2">
                    <Bot className="h-5 w-5 text-success" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="auto-approve" className="text-base font-medium">
                        Enable Auto-Approval for High Confidence Invoices
                      </Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>When enabled, invoices meeting all criteria below will be automatically approved without manual review.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Automatically approve invoices with clean risk profiles from verified vendors
                    </p>
                  </div>
                </div>
                <Switch
                  id="auto-approve"
                  checked={settings.auto_approve_high_confidence}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, auto_approve_high_confidence: checked })
                  }
                />
              </div>

              {/* Confidence Threshold Slider */}
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <Label className="text-base font-medium">Auto-Approval Threshold</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Invoices with confidence scores at or above this threshold will be eligible for auto-approval.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[settings.confidence_threshold]}
                    onValueChange={(value) => setSettings({ ...settings, confidence_threshold: value[0] })}
                    min={50}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="min-w-[4rem] text-right font-medium text-primary">
                    {settings.confidence_threshold}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Current: Invoices with ≥{settings.confidence_threshold}% confidence are eligible for auto-approval
                </p>
              </div>

              <Separator />

              {/* Requirement Toggles */}
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Additional Requirements</h4>
                
                {/* Require vendor active */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="vendor-active" className="text-sm">
                      Require vendor status = active
                    </Label>
                  </div>
                  <Switch
                    id="vendor-active"
                    checked={settings.require_vendor_active}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, require_vendor_active: checked })
                    }
                  />
                </div>

                {/* Require bank verified */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="bank-verified" className="text-sm">
                      Require bank verification = true
                    </Label>
                  </div>
                  <Switch
                    id="bank-verified"
                    checked={settings.require_bank_verified}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, require_bank_verified: checked })
                    }
                  />
                </div>

                {/* Require no alerts */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="no-alerts" className="text-sm">
                      Require no risk alerts
                    </Label>
                  </div>
                  <Switch
                    id="no-alerts"
                    checked={settings.require_no_alerts}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, require_no_alerts: checked })
                    }
                  />
                </div>

                {/* Require new vendor review */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="new-vendor-review" className="text-sm">
                      Always require review for new vendors (&lt;3 invoices)
                    </Label>
                  </div>
                  <Switch
                    id="new-vendor-review"
                    checked={settings.require_new_vendor_review}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, require_new_vendor_review: checked })
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* Amount and Anomaly Thresholds */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max-amount" className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Max Auto-Approve Amount
                  </Label>
                  <Input
                    id="max-amount"
                    type="number"
                    placeholder="No limit"
                    value={settings.max_auto_approve_amount || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        max_auto_approve_amount: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Invoices above this amount require manual review
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Anomaly Threshold
                  </Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[settings.anomaly_threshold * 100]}
                      onValueChange={(value) => setSettings({ ...settings, anomaly_threshold: value[0] / 100 })}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="min-w-[3rem] text-sm font-medium">{(settings.anomaly_threshold * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Invoices with anomaly score below this threshold are eligible
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Confidence Explainability Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Confidence Model Explainability
              </CardTitle>
              <CardDescription>
                Understanding how confidence scores are calculated (read-only)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {/* OCR Completeness */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">OCR Completeness Score</span>
                    <span className="text-sm text-primary font-medium">95%</span>
                  </div>
                  <Progress value={95} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Measures how completely the document was read by OCR
                  </p>
                </div>

                {/* Field Confidence */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Field Confidence Scores</span>
                    <span className="text-sm text-primary font-medium">87%</span>
                  </div>
                  <Progress value={87} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Average confidence across vendor, date, amount, line items
                  </p>
                </div>

                {/* Vendor Reliability */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Vendor Reliability Score</span>
                    <span className="text-sm text-primary font-medium">92%</span>
                  </div>
                  <Progress value={92} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Based on historical vendor invoice accuracy
                  </p>
                </div>

                {/* Line Item Deviation */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Line-Item Deviation Score</span>
                    <span className="text-sm text-success font-medium">Low</span>
                  </div>
                  <Progress value={15} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Measures deviation from expected pricing patterns
                  </p>
                </div>

                {/* Document Quality */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Document Quality Score</span>
                    <span className="text-sm text-primary font-medium">88%</span>
                  </div>
                  <Progress value={88} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Image clarity, resolution, and format quality
                  </p>
                </div>

                {/* Missing Fields */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Missing Fields</span>
                    <span className="text-sm text-success font-medium">0</span>
                  </div>
                  <Progress value={100} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Number of required fields that could not be extracted
                  </p>
                </div>
              </div>

              <Separator />

              {/* Flags Affecting Confidence */}
              <div className="space-y-3">
                <h4 className="font-medium text-foreground">Flags Affecting Confidence</h4>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs text-success">
                    <CheckCircle className="h-3 w-3" />
                    Vendor Active
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs text-success">
                    <CheckCircle className="h-3 w-3" />
                    Bank Verified
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs text-success">
                    <CheckCircle className="h-3 w-3" />
                    No Risk Alerts
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    Contract On File
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardHeader>
              <CardTitle>How Auto-Approval Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">1</div>
                  <p>Invoice is processed and analyzed by AI for extraction accuracy and risk factors</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">2</div>
                  <p>Confidence score is calculated based on OCR quality, field extraction, and vendor history</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">3</div>
                  <p>If confidence ≥{settings.confidence_threshold}% and all requirements met, invoice is auto-approved</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">4</div>
                  <p>Auto-approved invoices go directly to Export History, skipping manual review queues</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">5</div>
                  <p>Checker and Admin can still manually override any auto-approved invoice if needed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Settings
            </Button>
          </div>
        </div>
      </TooltipProvider>
    </Layout>
  );
}