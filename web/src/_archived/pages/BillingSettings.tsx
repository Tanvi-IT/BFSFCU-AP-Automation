import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useBilling, Plan } from "@/hooks/useBilling";
import { useToast } from "@/hooks/use-toast";
import { Check, X, CreditCard, Calendar, AlertTriangle, ExternalLink, ArrowRight, Loader2 } from "lucide-react";
import { format } from "date-fns";

const PLAN_DETAILS: Record<Plan, { name: string; price: string; features: string[] }> = {
  free_trial: {
    name: "Free Trial",
    price: "$0",
    features: [
      "Up to 50 invoices",
      "Email ingestion",
      "Vendor auto-creation",
      "Variation engine",
      "Manual exports",
    ],
  },
  starter: {
    name: "Starter",
    price: "$4,800/year",
    features: [
      "Up to 5,000 invoices/year",
      "Unlimited users",
      "Unlimited vendors",
      "AI invoice ingestion",
      "Email automation",
      "Maker/Checker workflow",
      "CSV/JSON exports",
      "Basic audit logs",
    ],
  },
  growth: {
    name: "Growth",
    price: "$15,000/year",
    features: [
      "Up to 20,000 invoices/year",
      "Everything in Starter",
      "AI ERP Field Mapping",
      "ERP Export Format Engine",
      "Scheduled Auto-Exports",
      "Developer API access",
      "Webhooks",
      "Audit timelines",
      "Vendor fraud scoring",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: "Custom",
    features: [
      "Unlimited invoices",
      "Everything in Growth",
      "Multi-entity organizations",
      "SFTP scheduled delivery",
      "Native ERP connectors",
      "Enterprise audit tooling",
      "Full API Platform",
      "99.9% uptime SLA",
      "Dedicated account manager",
    ],
  },
};

export default function BillingSettings() {
  const { toast } = useToast();
  const {
    plan,
    trialEndsAt,
    planRenewsAt,
    stripeCustomerId,
    isLoading,
    isTrialExpired,
    daysUntilTrialEnd,
    openBillingPortal,
    createCheckout,
  } = useBilling();

  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleUpgrade = async (targetPlan: "starter" | "growth") => {
    setLoadingAction(targetPlan);
    try {
      await createCheckout(targetPlan);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create checkout session. Please try again.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManageBilling = async () => {
    setLoadingAction("portal");
    try {
      await openBillingPortal();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to open billing portal. Please try again.",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const trialDays = daysUntilTrialEnd();
  const currentPlanDetails = PLAN_DETAILS[plan];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your plan and payment settings</p>
        </div>

        {/* Trial Warning Banner */}
        {plan === "free_trial" && trialDays !== null && (
          <Alert variant={trialDays <= 3 ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {isTrialExpired() 
                ? "Your free trial has expired" 
                : `Free trial ends in ${trialDays} day${trialDays !== 1 ? "s" : ""}`}
            </AlertTitle>
            <AlertDescription>
              {isTrialExpired()
                ? "Upgrade now to continue using Clarus AP without interruption."
                : "Upgrade now to avoid disruption to your invoice processing."}
            </AlertDescription>
          </Alert>
        )}

        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Current Plan
                  <Badge variant={plan === "free_trial" ? "secondary" : "default"}>
                    {currentPlanDetails.name}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {plan === "enterprise" 
                    ? "Contact your account manager for billing inquiries"
                    : currentPlanDetails.price}
                </CardDescription>
              </div>
              {stripeCustomerId && plan !== "enterprise" && (
                <Button 
                  variant="outline" 
                  onClick={handleManageBilling}
                  disabled={loadingAction === "portal"}
                >
                  {loadingAction === "portal" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Manage Billing
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {trialEndsAt && plan === "free_trial" && (
                <div>
                  <span className="text-muted-foreground">Trial ends:</span>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(trialEndsAt), "MMM d, yyyy")}
                  </p>
                </div>
              )}
              {planRenewsAt && plan !== "free_trial" && (
                <div>
                  <span className="text-muted-foreground">Renews:</span>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(planRenewsAt), "MMM d, yyyy")}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-2">Included Features</h4>
              <ul className="grid grid-cols-2 gap-1 text-sm">
                {currentPlanDetails.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Upgrade Options */}
        {plan !== "enterprise" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Upgrade Your Plan</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {/* Starter Plan */}
              <Card className={plan === "starter" ? "border-primary" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Starter</CardTitle>
                    {plan === "starter" && <Badge>Current Plan</Badge>}
                  </div>
                  <CardDescription>
                    <span className="text-2xl font-bold text-foreground">$4,800</span>
                    <span className="text-muted-foreground">/year</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {PLAN_DETAILS.starter.features.slice(0, 5).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {plan === "starter" ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : plan === "growth" ? (
                    <Button variant="outline" className="w-full" disabled>
                      <X className="h-4 w-4 mr-2" />
                      Downgrade via Portal
                    </Button>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => handleUpgrade("starter")}
                      disabled={loadingAction === "starter"}
                    >
                      {loadingAction === "starter" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-2" />
                      )}
                      Upgrade to Starter
                    </Button>
                  )}
                </CardFooter>
              </Card>

              {/* Growth Plan */}
              <Card className={plan === "growth" ? "border-primary" : "border-primary/50"}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Growth</CardTitle>
                    {plan === "growth" ? (
                      <Badge>Current Plan</Badge>
                    ) : (
                      <Badge variant="secondary">Popular</Badge>
                    )}
                  </div>
                  <CardDescription>
                    <span className="text-2xl font-bold text-foreground">$15,000</span>
                    <span className="text-muted-foreground">/year</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {PLAN_DETAILS.growth.features.slice(0, 5).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {plan === "growth" ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button 
                      className="w-full" 
                      onClick={() => handleUpgrade("growth")}
                      disabled={loadingAction === "growth"}
                    >
                      {loadingAction === "growth" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-2" />
                      )}
                      Upgrade to Growth
                    </Button>
                  )}
                </CardFooter>
              </Card>

              {/* Enterprise Plan */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Enterprise</CardTitle>
                  <CardDescription>
                    <span className="text-2xl font-bold text-foreground">Custom</span>
                    <span className="text-muted-foreground"> pricing</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {PLAN_DETAILS.enterprise.features.slice(0, 5).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full" asChild>
                    <a href="/contact">
                      Book 30-Day POV
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}

        {/* Feature Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Feature</th>
                    <th className="text-center py-2 px-4">Starter</th>
                    <th className="text-center py-2 px-4">Growth</th>
                    <th className="text-center py-2 px-4">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Invoice Ingestion", starter: true, growth: true, enterprise: true },
                    { name: "Unlimited Users", starter: true, growth: true, enterprise: true },
                    { name: "Email Automation", starter: true, growth: true, enterprise: true },
                    { name: "Scheduled Exports", starter: false, growth: true, enterprise: true },
                    { name: "AI ERP Mapping", starter: false, growth: true, enterprise: true },
                    { name: "Developer API", starter: false, growth: true, enterprise: true },
                    { name: "Webhooks", starter: false, growth: true, enterprise: true },
                    { name: "Multi-Entity", starter: false, growth: false, enterprise: true },
                    { name: "SFTP Delivery", starter: false, growth: false, enterprise: true },
                    { name: "Native ERP Connectors", starter: false, growth: false, enterprise: true },
                    { name: "99.9% SLA", starter: false, growth: false, enterprise: true },
                  ].map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 pr-4">{row.name}</td>
                      <td className="text-center py-2 px-4">
                        {row.starter ? (
                          <Check className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                      <td className="text-center py-2 px-4">
                        {row.growth ? (
                          <Check className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                      <td className="text-center py-2 px-4">
                        {row.enterprise ? (
                          <Check className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
