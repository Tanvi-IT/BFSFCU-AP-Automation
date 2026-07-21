import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBilling } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import clarusLogo from "@/assets/clarus-logo.png";
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Building2,
  Plug,
  Mail,
  FileUp,
  PartyPopper,
  Copy,
  Loader2,
} from "lucide-react";

const STEPS = [
  { id: "welcome", title: "Welcome", icon: PartyPopper },
  { id: "company", title: "Company", icon: Building2 },
  { id: "integrations", title: "Integrations", icon: Plug },
  { id: "email_ingestion", title: "Email Setup", icon: Mail },
  { id: "first_invoice", title: "First Invoice", icon: FileUp },
];

const ERP_OPTIONS = [
  { value: "sap", label: "SAP" },
  { value: "oracle", label: "Oracle" },
  { value: "netsuite", label: "NetSuite" },
  { value: "dynamics", label: "Microsoft Dynamics 365" },
  { value: "odoo", label: "Odoo" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "tally", label: "Tally" },
  { value: "other", label: "Other / None" },
];

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "AU", label: "Australia" },
  { value: "IN", label: "India" },
  { value: "OTHER", label: "Other" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Berlin", label: "Central European (CET)" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenantId, loading: authLoading } = useAuth();
  const { plan, trialEndsAt } = useBilling();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [fiscalYearStart, setFiscalYearStart] = useState("1");
  const [erpSystem, setErpSystem] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);

  const currentStep = STEPS[currentStepIndex];
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  // Load existing onboarding state
  useEffect(() => {
    async function loadOnboardingState() {
      if (!tenantId) return;

      const { data: state } = await supabase
        .from("onboarding_state")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      if (state?.completed) {
        setOnboardingComplete(true);
        navigate("/dashboard");
        return;
      }

      // Load tenant data
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, country, timezone, fiscal_year_start")
        .eq("id", tenantId)
        .single();

      if (tenant) {
        setCompanyName(tenant.name || "");
        setCountry(tenant.country || "");
        setTimezone(tenant.timezone || "");
        setFiscalYearStart(String(tenant.fiscal_year_start || 1));
      }

      // Load ERP settings
      const { data: erpSettings } = await supabase
        .from("tenant_erp_settings")
        .select("erp_system")
        .eq("tenant_id", tenantId)
        .single();

      if (erpSettings?.erp_system) {
        setErpSystem(erpSettings.erp_system);
      }

      // Resume from last step
      if (state?.current_step) {
        const stepIndex = STEPS.findIndex(s => s.id === state.current_step);
        if (stepIndex >= 0) setCurrentStepIndex(stepIndex);
      }
    }

    if (!authLoading) {
      loadOnboardingState();
    }
  }, [tenantId, authLoading, navigate]);

  const updateOnboardingStep = async (stepId: string, stepData: Record<string, boolean>) => {
    if (!tenantId) return;

    await supabase
      .from("onboarding_state")
      .update({
        current_step: stepId,
        steps: stepData,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
  };

  const handleNext = async () => {
    setIsLoading(true);

    try {
      // Step-specific save logic
      if (currentStep.id === "company") {
        await supabase
          .from("tenants")
          .update({
            name: companyName,
            country,
            timezone,
            fiscal_year_start: parseInt(fiscalYearStart),
          })
          .eq("id", tenantId);
      }

      if (currentStep.id === "integrations") {
        // Upsert ERP settings
        const { data: existing } = await supabase
          .from("tenant_erp_settings")
          .select("id")
          .eq("tenant_id", tenantId)
          .single();

        if (existing) {
          await supabase
            .from("tenant_erp_settings")
            .update({ erp_system: erpSystem })
            .eq("tenant_id", tenantId);
        } else {
          await supabase.from("tenant_erp_settings").insert({
            tenant_id: tenantId,
            erp_system: erpSystem,
          });
        }
      }

      // Update onboarding step
      const stepsCompleted: Record<string, boolean> = {};
      STEPS.forEach((s, i) => {
        stepsCompleted[s.id] = i <= currentStepIndex;
      });
      await updateOnboardingStep(
        STEPS[currentStepIndex + 1]?.id || "done",
        stepsCompleted
      );

      if (currentStepIndex < STEPS.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Get the current user's ID
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (currentUser && tenantId) {
        // Check if user already has a role for this tenant
        const { data: existingRoles } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("tenant_id", tenantId);
        
        // If no role exists, assign checker (tenant admin) role
        if (!existingRoles || existingRoles.length === 0) {
          await supabase.from("user_roles").insert({
            user_id: currentUser.id,
            role: "checker",
            tenant_id: tenantId,
          });
          console.log("[Onboarding] Assigned checker role to user:", currentUser.id);
        }
      }

      // Mark onboarding complete
      await supabase
        .from("onboarding_state")
        .update({
          completed: true,
          current_step: "done",
          steps: STEPS.reduce((acc, s) => ({ ...acc, [s.id]: true }), {}),
          primary_user_id: currentUser?.id,
        })
        .eq("tenant_id", tenantId);

      toast({
        title: "Welcome to Clarus AP!",
        description: "Your workspace is ready. Let's get started!",
      });

      // Force a page reload to refresh roles in useAuth
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("[Onboarding] Error completing onboarding:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to complete onboarding.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyIngestionEmail = () => {
    const email = `invoices+${tenantId}@clarusap.com`;
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
    toast({ title: "Copied!", description: "Email address copied to clipboard." });
  };

  const trialDaysLeft = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={clarusLogo} alt="Clarus AP" className="h-8" />
          </Link>
          {trialDaysLeft !== null && trialDaysLeft > 0 && (
            <Badge variant="secondary">
              {trialDaysLeft} days left in trial
            </Badge>
          )}
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-12">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((step, i) => (
              <div
                key={step.id}
                className={`flex items-center gap-1.5 text-sm ${
                  i <= currentStepIndex ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {i < currentStepIndex ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <step.icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Content */}
        <Card>
          {/* Step 1: Welcome */}
          {currentStep.id === "welcome" && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <PartyPopper className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Welcome to Clarus AP!</CardTitle>
                <CardDescription className="text-base">
                  Let's set up your workspace in just a few minutes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="font-medium">Your plan: <Badge variant="outline">{plan}</Badge></p>
                  {trialDaysLeft !== null && (
                    <p className="text-sm text-muted-foreground">
                      Trial ends in {trialDaysLeft} days
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">What we'll cover:</h4>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>• Company profile and preferences</li>
                    <li>• ERP integration settings</li>
                    <li>• Email invoice ingestion setup</li>
                    <li>• Your first invoice upload</li>
                  </ul>
                </div>
                <Button onClick={handleNext} className="w-full">
                  Begin Setup
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </>
          )}

          {/* Step 2: Company */}
          {currentStep.id === "company" && (
            <>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>
                  Tell us about your organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Acme Corporation"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Time Zone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(tz => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscalYear">Fiscal Year Start Month</Label>
                  <Select value={fiscalYearStart} onValueChange={setFiscalYearStart}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {new Date(2000, i).toLocaleString("default", { month: "long" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleNext} className="flex-1" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Integrations */}
          {currentStep.id === "integrations" && (
            <>
              <CardHeader>
                <CardTitle>ERP Integration</CardTitle>
                <CardDescription>
                  Which ERP system do you use?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Select your ERP</Label>
                  <Select value={erpSystem} onValueChange={setErpSystem}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose ERP system" />
                    </SelectTrigger>
                    <SelectContent>
                      {ERP_OPTIONS.map(erp => (
                        <SelectItem key={erp.value} value={erp.value}>
                          {erp.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-1">How exports work:</p>
                  <p className="text-muted-foreground">
                    Clarus AP generates ERP-ready export files (CSV, JSON, XML) that you can import into your system.
                    Growth and Enterprise plans include automated scheduled exports and native API integrations.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleNext} className="flex-1" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 4: Email Ingestion */}
          {currentStep.id === "email_ingestion" && (
            <>
              <CardHeader>
                <CardTitle>Email Invoice Ingestion</CardTitle>
                <CardDescription>
                  Forward invoices to Clarus AP automatically
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-2">Your unique ingestion email:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background rounded px-3 py-2 text-sm font-mono">
                      invoices+{tenantId?.slice(0, 8)}...@clarusap.com
                    </code>
                    <Button size="sm" variant="outline" onClick={copyIngestionEmail}>
                      <Copy className="h-4 w-4" />
                      {copiedEmail ? "Copied!" : ""}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <h4 className="font-medium">Setup instructions:</h4>
                  <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                    <li>Copy the email address above</li>
                    <li>Set up email forwarding from your AP inbox</li>
                    <li>Or share this address with vendors for direct submission</li>
                  </ol>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleNext} className="flex-1">
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 5: First Invoice */}
          {currentStep.id === "first_invoice" && (
            <>
              <CardHeader>
                <CardTitle>Upload Your First Invoice</CardTitle>
                <CardDescription>
                  See Clarus AP in action
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a PDF, JPG, or PNG invoice to test the AI extraction
                  </p>
                  <Link to="/poc/upload">
                    <Button>
                      Upload Invoice Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <div className="text-center">
                  <Button variant="ghost" onClick={handleComplete} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Skip for now, go to Dashboard
                  </Button>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleComplete} className="flex-1" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Complete Setup
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
