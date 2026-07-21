import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Shield, Globe, Users, Building2, Zap, ArrowRight } from "lucide-react";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const plans = [
  {
    name: "Starter",
    price: "$4,800",
    period: "/year",
    description: "For finance teams automating AP for the first time",
    planKey: "starter",
    features: [
      "Up to 5,000 invoices/year",
      "Unlimited users",
      "Unlimited vendors",
      "AI invoice ingestion",
      "Email automation (invoices@tenant)",
      "Vendor auto-creation",
      "Variation & anomaly engine",
      "Maker/Checker workflow",
      "US-only data residency",
      "CSV/JSON exports",
      "Basic audit logs",
    ],
    cta: "Start 14-Day Free Trial",
    popular: false,
  },
  {
    name: "Growth",
    price: "$15,000",
    period: "/year",
    description: "For mid-market teams automating end-to-end AP",
    planKey: "growth",
    features: [
      "Up to 20,000 invoices/year",
      "Everything in Starter, plus:",
      "AI ERP Field Mapping",
      "ERP Export Format Engine",
      "Scheduled Auto-Exports",
      "Bulk S3 ingestion",
      "Custom roles",
      "Audit timelines per invoice",
      "Vendor fraud scoring",
      "Email domain routing rules",
      "SLA: 12-hour response",
    ],
    cta: "Start 14-Day Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For banks, credit unions, and enterprises requiring deep controls",
    planKey: "enterprise",
    features: [
      "Unlimited invoices",
      "Everything in Growth, plus:",
      "Multi-entity organizations",
      "SFTP scheduled delivery",
      "Native ERP connectors (SAP, Oracle, NetSuite, Dynamics, Fiserv, Jack Henry)",
      "Enterprise audit tooling",
      "Webhooks + API Platform",
      "Security review package",
      "99.9% uptime SLA",
      "Dedicated account manager",
      "Quarterly training",
    ],
    cta: "Book 30-Day Proof of Value",
    popular: false,
  },
];

const comparisonData = [
  { feature: "Unlimited Users", clarusap: true, billcom: false, airbase: false, tipalti: false, concur: false },
  { feature: "Unlimited Vendors", clarusap: true, billcom: false, airbase: true, tipalti: false, concur: false },
  { feature: "AI-Native Extraction", clarusap: true, billcom: "Basic", airbase: "Basic", tipalti: "OCR", concur: "OCR" },
  { feature: "Variation Engine", clarusap: true, billcom: false, airbase: false, tipalti: "Partial", concur: false },
  { feature: "ERP Export Engine", clarusap: true, billcom: false, airbase: "Partial", tipalti: true, concur: true },
  { feature: "Native Bank-Grade US Hosting", clarusap: true, billcom: true, airbase: false, tipalti: false, concur: true },
  { feature: "Pricing Transparency", clarusap: true, billcom: false, airbase: false, tipalti: false, concur: false },
];

const faqs = [
  {
    question: "Do I need a credit card to start?",
    answer: "No. Our 14-day free trial requires no credit card. You can explore all features before committing.",
  },
  {
    question: "How does the 30% switch credit work?",
    answer: "If you're currently using Bill.com, Tipalti, Airbase, or Concur, we'll apply a 30% discount to your first year when you switch to Clarus AP. Contact sales to claim your credit.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. You can cancel your subscription at any time. Your access will continue until the end of your billing period.",
  },
  {
    question: "What counts as an invoice?",
    answer: "Any document processed through our AI extraction engine counts as one invoice, regardless of the number of line items or pages.",
  },
  {
    question: "Do you support banks and credit unions?",
    answer: "Yes! Our Enterprise plan includes native connectors for Jack Henry, Fiserv, FIS, and other banking core systems. We're SOC 2 Type II compliant (in progress).",
  },
  {
    question: "Is Clarus AP SOC 2 certified?",
    answer: "SOC 2 Type II certification is in progress. All data is stored exclusively in US-based data centers with enterprise-grade encryption.",
  },
  {
    question: "How do ERP exports work?",
    answer: "Clarus AP generates ERP-ready exports in your preferred format (CSV, JSON, XML). Growth and Enterprise plans include automated scheduled exports and native API integrations.",
  },
  {
    question: "How does vendor auto-creation work?",
    answer: "Our AI extracts vendor information from invoices and automatically creates vendor records. It uses a 4-level matching hierarchy (tax ID, bank account, email domain, fuzzy name) to prevent duplicates.",
  },
];

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [tenantName, setTenantName] = useState("");
  const { toast } = useToast();

  const handlePlanSelect = (planKey: string, planName: string) => {
    if (planKey === "enterprise") {
      window.location.href = "/contact";
      return;
    }
    setSelectedPlan(planKey);
    setCheckoutDialogOpen(true);
  };

  const handleCheckout = async () => {
    if (!selectedPlan || !email || !tenantName) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please enter your email and company name.",
      });
      return;
    }

    setLoadingPlan(selectedPlan);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          email: email.trim(),
          tenant_name: tenantName.trim(),
          plan: selectedPlan,
          success_url: `${origin}/onboarding/success`,
          cancel_url: `${origin}/pricing`,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create checkout session. Please try again.",
      });
    } finally {
      setLoadingPlan(null);
      setCheckoutDialogOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Clarus AP</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Product</Link>
            <Link to="/#intelligence" className="text-sm text-muted-foreground hover:text-foreground transition-colors">AP Intelligence</Link>
            <Link to="/developers" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Developers</Link>
            <Link to="/security" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Security</Link>
            <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Simple, enterprise-ready plans. Annual only.
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Unlimited users, vendors, and approvers on every plan. 
            Transform your AP operations with AI-powered automation.
          </p>
          
          {/* Trust Badges */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
              <Shield className="h-3.5 w-3.5" />
              SOC 2 Type II In Progress
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
              <Globe className="h-3.5 w-3.5" />
              US Data Residency
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
              <Users className="h-3.5 w-3.5" />
              Unlimited Users
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Unlimited Vendors
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
              <Zap className="h-3.5 w-3.5" />
              Unlimited Approvers
            </Badge>
          </div>

          <div className="flex justify-center gap-4">
            <Link to="/auth">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline" size="lg">Talk to Sales</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Billing Toggle */}
      <section className="py-8 px-4">
        <div className="container mx-auto flex justify-center items-center gap-4">
          <span className={`text-sm ${isAnnual ? "text-foreground font-medium" : "text-muted-foreground"}`}>
            Annual (Save 15%)
          </span>
          <Switch
            checked={!isAnnual}
            onCheckedChange={() => setIsAnnual(!isAnnual)}
            disabled
          />
          <span className="text-sm text-muted-foreground">
            Monthly (Not Available)
          </span>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <Card 
                key={plan.name} 
                className={`relative flex flex-col ${plan.popular ? "border-primary shadow-lg scale-105" : ""}`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  {plan.price !== "Custom" && (
                    <p className="text-xs text-muted-foreground">Save 15% when billed annually</p>
                  )}
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handlePlanSelect(plan.planKey, plan.name)}
                    disabled={loadingPlan === plan.planKey}
                  >
                    {loadingPlan === plan.planKey ? "Loading..." : plan.cta}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Switch Credit Banner */}
      <section className="py-16 px-4 bg-primary/5">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Switching from another AP platform?
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            Switch from Bill.com, Tipalti, Airbase, or Concur and get <strong>30% off your first year</strong>.
          </p>
          <Link to="/contact">
            <Button size="lg">
              Claim Switch Credit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <div className="flex justify-center gap-8 mt-8 opacity-50">
            <span className="text-sm font-medium">Bill.com</span>
            <span className="text-sm font-medium">Tipalti</span>
            <span className="text-sm font-medium">Airbase</span>
            <span className="text-sm font-medium">Concur</span>
          </div>
        </div>
      </section>

      {/* What's Included Section - 9 items (3x3) */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-center mb-8">What's included in every plan</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              "US data residency",
              "Unlimited users",
              "Unlimited vendors",
              "Unlimited approvers",
              "AI invoice extraction",
              "Email ingestion",
              "Core audit logging",
              "Role-based access controls",
              "PWA-ready web app",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-4">How Clarus AP Compares</h2>
          <p className="text-center text-muted-foreground mb-12">
            See why teams are switching to Clarus AP
          </p>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-medium">Feature</th>
                  <th className="py-4 px-4 font-medium text-primary">Clarus AP</th>
                  <th className="py-4 px-4 font-medium text-muted-foreground">Bill.com</th>
                  <th className="py-4 px-4 font-medium text-muted-foreground">Airbase</th>
                  <th className="py-4 px-4 font-medium text-muted-foreground">Tipalti</th>
                  <th className="py-4 px-4 font-medium text-muted-foreground">Concur</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-4 px-4 text-sm">{row.feature}</td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.clarusap === "boolean" ? (
                        row.clarusap ? <Check className="h-5 w-5 text-primary mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="text-sm text-primary font-medium">{row.clarusap}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.billcom === "boolean" ? (
                        row.billcom ? <Check className="h-5 w-5 text-muted-foreground mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.billcom}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.airbase === "boolean" ? (
                        row.airbase ? <Check className="h-5 w-5 text-muted-foreground mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.airbase}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.tipalti === "boolean" ? (
                        row.tipalti ? <Check className="h-5 w-5 text-muted-foreground mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.tipalti}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.concur === "boolean" ? (
                        row.concur ? <Check className="h-5 w-5 text-muted-foreground mx-auto" /> : <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.concur}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8">
            Clarus AP is the only AI-native AP automation suite built for 2025 and beyond.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">Ready to transform your AP operations?</h2>
          <p className="text-muted-foreground mb-8">
            Start your 14-day free trial today. No credit card required.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/auth">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline" size="lg">Schedule Demo</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Checkout Dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Your Free Trial</DialogTitle>
            <DialogDescription>
              Enter your details to start your 14-day free trial. No credit card required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant_name">Company Name</Label>
              <Input
                id="tenant_name"
                placeholder="Acme Corporation"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCheckoutDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCheckout} 
              disabled={!email || !tenantName || !!loadingPlan}
            >
              {loadingPlan ? "Loading..." : "Continue to Checkout"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
