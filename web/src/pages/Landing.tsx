import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText,
  Mail,
  Users,
  ShieldCheck,
  GitCompare,
  AlertTriangle,
  Workflow,
  Database,
  Globe,
  ClipboardCheck,
  Zap,
  Building2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Server,
  Lock,
  FileSearch,
  TrendingUp,
  BarChart3,
  Bot,
  Brain,
  FileCheck,
  Shield,
  Eye,
  Receipt,
  Banknote,
  Menu,
  X,
  Landmark,
  CreditCard,
  Briefcase,
  Factory,
  Stethoscope,
  ShoppingCart,
  Quote,
  Headphones,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { useState, useEffect } from "react";

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const testimonials = [
    {
      quote: "Finally an AP platform built for the real world — not Silicon Valley fantasy workflows.",
      author: "CFO",
      company: "$1B Credit Union",
    },
    {
      quote: "We eliminated 90% of manual AP work within weeks. The AI accuracy is unlike anything we've seen.",
      author: "Controller",
      company: "Regional Bank",
    },
    {
      quote: "Clarus AP's ERP-ready exports solved everything our old AP system never could.",
      author: "VP Finance",
      company: "Mid-Market Enterprise",
    },
  ];

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Clarus AP</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Product
            </a>
            <a href="#intelligence" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              AP Intelligence
            </a>
            {/* Pricing link temporarily hidden
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            */}
            <Link to="/developers" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Developers
            </Link>
            <Link to="/security" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Security
            </Link>
            <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </Link>
          </nav>
          
          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden sm:block">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/contact">
              <Button size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                Contact Sales
              </Button>
            </Link>
            
            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background p-4">
            <nav className="flex flex-col gap-4">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">Product</a>
              <a href="#intelligence" className="text-sm font-medium text-muted-foreground hover:text-foreground">AP Intelligence</a>
              {/* <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Pricing</Link> */}
              <Link to="/developers" className="text-sm font-medium text-muted-foreground hover:text-foreground">Developers</Link>
              <Link to="/security" className="text-sm font-medium text-muted-foreground hover:text-foreground">Security</Link>
              <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground">Contact</Link>
              <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign In</Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 md:py-32">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/5" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-accent/10 rounded-full blur-3xl opacity-30" />
        
        <div className="container relative z-10">
          <div className="mx-auto max-w-4xl text-center animate-fade-up">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              The AP Intelligence Layer{" "}
              <span className="text-accent">for Modern Enterprises.</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Clarus AP cleans, validates, enriches, and protects your invoices — before you even log in.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact">
                <Button size="lg" className="gap-2 hover-lift bg-secondary text-secondary-foreground hover:bg-secondary/90">
                  Contact Sales <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/contact">
                <Button size="lg" variant="outline" className="gap-2 border-border text-foreground hover:bg-accent">
                  Request Enterprise Package
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Strip - Below Hero */}
      <section className="py-8 border-b border-border bg-muted/20">
        <div className="container">
          <div className="flex flex-wrap justify-center items-center gap-3 md:gap-4">
            {[
              { icon: Users, label: "Trusted by banking, credit unions, and mid-market finance" },
              { icon: Shield, label: "SOC 2 Type II Aligned" },
              { icon: Globe, label: "US-Only Data Residency" },
              { icon: Lock, label: "AES-256 Encryption" },
              { icon: Users, label: "Role-Based Access Control" },
              { icon: ClipboardCheck, label: "Immutable Audit Logs" },
            ].map((item, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/50 text-xs md:text-sm font-medium text-muted-foreground"
              >
                <item.icon className="h-3.5 w-3.5 text-secondary" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Leading Finance Teams Trust Clarus AP - 3 Cards */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Leading Finance Teams Trust Clarus AP
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for enterprises with the highest security and accuracy requirements.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Building2,
                title: "Built for Regulated Industries",
                description: "AI that respects internal controls, approval hierarchies, and GL-based workflows.",
              },
              {
                icon: Shield,
                title: "Enterprise Security by Design",
                description: "SOC 2 alignment, encryption, audit logging, and data isolation for sensitive financial data.",
              },
              {
                icon: Brain,
                title: "AI Accuracy for the Real World",
                description: "Line-item extraction, vendor intelligence, and anomaly detection built for finance, not generic OCR.",
              },
            ].map((item, index) => (
              <Card key={index} className="hover-scale transition-all duration-200 border-primary/20 bg-card">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <item.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Key Benefits Section - 6 Cards (2x3) */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Finance Teams Choose Clarus AP
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Enterprise-grade AP automation that works from day one.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              { icon: Zap, title: "Zero Manual AP Work", description: "AI handles extraction, validation, and routing automatically." },
              { icon: AlertTriangle, title: "Accredited-Grade Variation Detection", description: "Eight detection rules catch anomalies before they become costly mistakes." },
              { icon: FileCheck, title: "Contract-Aware Invoice Intelligence", description: "AI compares invoices against vendor contracts to flag mismatches." },
              { icon: ShieldCheck, title: "Vendor Fraud Prevention", description: "Real-time fraud scoring and bank change detection protect your business." },
              { icon: Database, title: "ERP-Ready Data Export", description: "Clean JSON exports for SAP, Oracle, NetSuite, Dynamics, and banking cores." },
              { icon: Users, title: "Unlimited Users, Vendors, Approvers", description: "No per-seat pricing. Scale your team without scaling your bill." },
            ].map((item, index) => (
              <Card key={index} className="hover-scale transition-all duration-200 border-border/50 bg-card">
                <CardContent className="p-6">
                  <item.icon className="h-10 w-10 text-secondary mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AP Intelligence Section - 6 Cards (2x3) */}
      <section id="intelligence" className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              AP Intelligence — Not Automation. <span className="text-accent">Understanding.</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Six AI engines work together to process, protect, and optimize your payables.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: AlertTriangle,
                title: "Variation Engine",
                description: "Eight detection rules flag price spikes, bank changes, duplicates, tax mismatches, and more.",
              },
              {
                icon: TrendingUp,
                title: "Vendor Risk Scoring",
                description: "Continuous fraud probability calculation with weighted factors and historical baselines.",
              },
              {
                icon: FileSearch,
                title: "AI Contract Extraction",
                description: "Upload vendor contracts and AI extracts payment terms, renewals, and price clauses.",
              },
              {
                icon: GitCompare,
                title: "AI ERP Mapping",
                description: "Upload your ERP exports and AI suggests field mappings with confidence scores.",
              },
              {
                icon: Bot,
                title: "AI Approval Engine",
                description: "Configurable rules auto-approve low-risk invoices and route exceptions to reviewers.",
              },
              {
                icon: BarChart3,
                title: "Cashflow Forecasting",
                description: "AI-powered 90-day AP forecasts with trend analysis and predictive insights.",
              },
            ].map((item, index) => (
              <Card key={index} className="hover-scale transition-all duration-200 border-accent/20 bg-accent/5">
                <CardContent className="p-6">
                  <item.icon className="h-10 w-10 text-accent mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How Clarus AP Works - Pipeline Diagram */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How Clarus AP Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From invoice to ERP in a single automated pipeline.
            </p>
          </div>

          {/* Desktop Pipeline */}
          <div className="hidden lg:flex items-center justify-center gap-2 max-w-6xl mx-auto mb-8">
            {[
              { icon: Mail, label: "Invoice Ingestion" },
              { icon: Bot, label: "AI Extraction" },
              { icon: AlertTriangle, label: "Variation Engine" },
              { icon: Users, label: "Vendor Engine" },
              { icon: FileSearch, label: "Contract Engine" },
              { icon: Shield, label: "Risk Scoring" },
              { icon: Workflow, label: "Maker-Checker" },
              { icon: Database, label: "ERP Export" },
            ].map((step, index) => (
              <div key={index} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <step.icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-foreground text-center max-w-[80px]">{step.label}</span>
                </div>
                {index < 7 && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground mx-1" />
                )}
              </div>
            ))}
          </div>

          {/* Mobile Pipeline */}
          <div className="lg:hidden grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
            {[
              { icon: Mail, label: "Invoice Ingestion" },
              { icon: Bot, label: "AI Extraction" },
              { icon: AlertTriangle, label: "Variation Engine" },
              { icon: Users, label: "Vendor Engine" },
              { icon: FileSearch, label: "Contract Engine" },
              { icon: Shield, label: "Risk Scoring" },
              { icon: Workflow, label: "Maker-Checker" },
              { icon: Database, label: "ERP Export" },
            ].map((step, index) => (
              <div key={index} className="flex flex-col items-center p-4 bg-card rounded-lg border border-border/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground text-center">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial Carousel */}
      <section className="py-20 bg-primary/5">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              What Finance Leaders Say
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="relative">
              {/* Testimonial Cards */}
              <div className="overflow-hidden">
                <div
                  className="flex transition-transform duration-500 ease-in-out"
                  style={{ transform: `translateX(-${activeTestimonial * 100}%)` }}
                >
                  {testimonials.map((testimonial, index) => (
                    <div key={index} className="w-full flex-shrink-0 px-4">
                      <Card className="border-border/50 bg-card">
                        <CardContent className="p-8 md:p-12 text-center">
                          <Quote className="h-10 w-10 text-accent/30 mx-auto mb-6" />
                          <blockquote className="text-xl md:text-2xl font-medium text-foreground mb-6 leading-relaxed">
                            "{testimonial.quote}"
                          </blockquote>
                          <div className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{testimonial.author}</span>
                            <span className="mx-2">·</span>
                            <span>{testimonial.company}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation Arrows */}
              <button
                onClick={() => setActiveTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
              <button
                onClick={() => setActiveTestimonial((prev) => (prev + 1) % testimonials.length)}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-foreground" />
              </button>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTestimonial(index)}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    index === activeTestimonial ? "bg-accent" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Competitive Comparison Section - 3x3 Grid */}
      <section id="compare" className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Clarus AP vs. The Competition
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We're not another payment tool. We're AP intelligence.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto max-w-5xl mx-auto mb-8">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4 font-semibold">Feature</th>
                  <th className="py-4 px-4 font-semibold text-primary">Clarus AP</th>
                  <th className="py-4 px-4 font-semibold text-muted-foreground">Bill.com</th>
                  <th className="py-4 px-4 font-semibold text-muted-foreground">Tipalti</th>
                  <th className="py-4 px-4 font-semibold text-muted-foreground">Ramp</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "AI Extraction", clarus: true, bill: "Basic", tipalti: "OCR", ramp: "Basic" },
                  { feature: "AI Variation Detection", clarus: true, bill: false, tipalti: "Partial", ramp: false },
                  { feature: "Vendor Auto-Creation", clarus: true, bill: false, tipalti: false, ramp: false },
                  { feature: "Contract Extraction", clarus: true, bill: false, tipalti: false, ramp: false },
                  { feature: "Fraud Scoring", clarus: true, bill: false, tipalti: "Partial", ramp: "Basic" },
                  { feature: "ERP Export Engine", clarus: true, bill: "Partial", tipalti: true, ramp: false },
                  { feature: "Scheduled Exports", clarus: true, bill: false, tipalti: true, ramp: false },
                  { feature: "Multi-Tenant", clarus: true, bill: false, tipalti: false, ramp: false },
                  { feature: "US-Only Data Residency", clarus: true, bill: true, tipalti: false, ramp: false },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-3 px-4">{row.feature}</td>
                    <td className="py-3 px-4 text-center">
                      {typeof row.clarus === "boolean" ? (
                        row.clarus ? <CheckCircle2 className="h-5 w-5 text-secondary mx-auto" /> : <XCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                      ) : <span className="text-primary font-medium">{row.clarus}</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {typeof row.bill === "boolean" ? (
                        row.bill ? <CheckCircle2 className="h-5 w-5 text-muted-foreground mx-auto" /> : <XCircle className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                      ) : <span className="text-muted-foreground">{row.bill}</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {typeof row.tipalti === "boolean" ? (
                        row.tipalti ? <CheckCircle2 className="h-5 w-5 text-muted-foreground mx-auto" /> : <XCircle className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                      ) : <span className="text-muted-foreground">{row.tipalti}</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {typeof row.ramp === "boolean" ? (
                        row.ramp ? <CheckCircle2 className="h-5 w-5 text-muted-foreground mx-auto" /> : <XCircle className="h-5 w-5 text-muted-foreground/50 mx-auto" />
                      ) : <span className="text-muted-foreground">{row.ramp}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-lg font-semibold text-accent">
            Clarus AP is the only AI-native AP intelligence platform.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Complete AP Automation Features
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to transform your accounts payable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Bot,
                title: "AI-Native Invoice Ingestion",
                description: "Machine learning extracts header and line-item data from any format.",
              },
              {
                icon: Mail,
                title: "Email Invoice Extraction",
                description: "Forward invoices to a dedicated inbox for automatic processing.",
              },
              {
                icon: Users,
                title: "Vendor Auto-Creation",
                description: "New vendors matched using tax ID, bank account, or domain.",
              },
              {
                icon: Workflow,
                title: "Maker–Checker Workflow",
                description: "Clean invoices auto-route; flagged items require human review.",
              },
              {
                icon: GitCompare,
                title: "ERP Field Mapping",
                description: "AI suggests mappings between your ERP and our canonical model.",
              },
              {
                icon: ClipboardCheck,
                title: "Complete Audit Trail",
                description: "Every action logged with user, timestamp, and metadata.",
              },
            ].map((feature, index) => (
              <Card key={index} className="hover-scale transition-all duration-200 border-border/50 bg-card">
                <CardContent className="p-6">
                  <feature.icon className="h-10 w-10 text-accent mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Credit Unions Choose Clarus AP */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                  Why Credit Unions Choose Clarus AP
                </h2>
                <p className="text-lg text-muted-foreground mb-8">
                  Purpose-built for regulated financial institutions with strict compliance and security requirements.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { icon: Database, text: "Built for GL-based financial workflows" },
                    { icon: Building2, text: "Multi-entity structure support" },
                    { icon: Mail, text: "Automated invoice ingestion + email routing" },
                    { icon: Workflow, text: "Maker/Checker controls" },
                    { icon: Server, text: "SFTP and JSON/CSV compatibility" },
                    { icon: GitCompare, text: "ERP-ready exports (Jack Henry, Fiserv, FIS, Oracle, SAP, Dynamics, NetSuite)" },
                  ].map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <item.icon className="h-4 w-4 text-secondary" />
                      </div>
                      <span className="text-sm text-foreground">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: "99.9%", label: "Uptime Target" },
                  { value: "90%", label: "AP Work Reduction" },
                  { value: "24/7", label: "Automated Processing" },
                  { value: "0", label: "Per-Seat Fees" },
                ].map((stat, index) => (
                  <Card key={index} className="border-secondary/30 bg-secondary/5">
                    <CardContent className="p-6 text-center">
                      <div className="text-3xl md:text-4xl font-bold text-secondary mb-2">{stat.value}</div>
                      <div className="text-sm text-muted-foreground">{stat.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Industry Badge Row */}
      <section className="py-12 border-y border-border">
        <div className="container">
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold text-foreground">Trusted Across Industries</h3>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-4">
            {[
              { icon: Landmark, label: "Banks" },
              { icon: CreditCard, label: "Credit Unions" },
              { icon: Zap, label: "FinTech" },
              { icon: Shield, label: "Insurance" },
              { icon: ShoppingCart, label: "Retail" },
              { icon: Factory, label: "Manufacturing" },
              { icon: Briefcase, label: "Professional Services" },
              { icon: Stethoscope, label: "Healthcare" },
            ].map((industry, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border/50 text-sm font-medium text-foreground hover:border-accent/50 transition-colors"
              >
                <industry.icon className="h-4 w-4 text-accent" />
                <span>{industry.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise-Grade Section - 9 Cards (3x3) */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Enterprise-Grade Security & Compliance
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for banks, credit unions, and enterprises with the highest security requirements.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              { icon: Globe, title: "US-Only Data Residency", description: "All data processed and stored exclusively in United States infrastructure." },
              { icon: Shield, title: "SOC 2 Type II Aligned", description: "Security controls independently verified by third-party auditors." },
              { icon: ClipboardCheck, title: "Full Audit Logs", description: "Immutable, append-only audit trail for complete accountability." },
              { icon: FileText, title: "Immutable Invoice History", description: "Complete version history with tamper-proof record keeping." },
              { icon: Building2, title: "Multi-Tenant Control", description: "Row-level security isolates each customer's data completely." },
              { icon: Zap, title: "API & Webhooks", description: "Full API platform with real-time webhook notifications." },
              { icon: Lock, title: "Encrypted Storage", description: "AES-256 encryption at rest and TLS 1.3 in transit." },
              { icon: Users, title: "Role-Based Access", description: "Granular RBAC with Maker/Checker/Admin/Superadmin roles." },
              { icon: Eye, title: "Security Monitoring", description: "Continuous monitoring with alerting on suspicious activity." },
            ].map((item, index) => (
              <Card key={index} className="text-center border-secondary/30 bg-secondary/5">
                <CardContent className="p-6">
                  <item.icon className="h-10 w-10 text-secondary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link to="/security">
              <Button variant="outline" className="gap-2">
                View Security Details <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ERP Integrations Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              ERP Integrations, Ready Out-of-the-Box
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Export clean, normalized invoice data compatible with major ERPs and banking core systems.
            </p>
          </div>

          {/* Major ERPs - 6 items */}
          <div className="mb-12">
            <h3 className="text-xl font-semibold text-foreground text-center mb-6">JSON-Ready for Major ERPs</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
              {["SAP", "Oracle Fusion", "Dynamics 365", "NetSuite", "Odoo", "Workday"].map((erp, index) => (
                <Card key={index} className="text-center border-border/50 bg-card hover-scale">
                  <CardContent className="p-4">
                    <Database className="h-8 w-8 text-accent mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">{erp}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Banking Cores */}
          <div className="mb-12">
            <h3 className="text-xl font-semibold text-foreground text-center mb-6">Compatible With Banking Cores</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
              {[
                "Jack Henry",
                "FIS Horizon",
                "Fiserv DNA",
                "Fiserv Signature",
                "Temenos",
                "Oracle FLEXCUBE"
              ].map((core, index) => (
                <Card key={index} className="text-center border-secondary/30 bg-secondary/5">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium text-foreground">{core}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="text-center">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium">
              <Zap className="h-4 w-4" />
              Automated push-to-ERP APIs roll out in Q1 2026
            </span>
          </div>
        </div>
      </section>

      {/* Enterprise Assurance Section - 3 Cards */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Enterprise Assurance
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for mission-critical finance operations.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Shield,
                title: "Security & Compliance",
                description: "SOC 2 Type II aligned, US data residency, encrypted storage, audit logs, secure email routing.",
              },
              {
                icon: Server,
                title: "Operational Reliability",
                description: "99.9% uptime target, monitored systems, redundant services, and robust tenant isolation.",
              },
              {
                icon: Headphones,
                title: "Support & Success",
                description: "US-based support, dedicated account management for Enterprise, and optional quarterly training.",
              },
            ].map((item, index) => (
              <Card key={index} className="hover-scale transition-all duration-200 border-primary/20 bg-card">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <item.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* About Hyperwise Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              Built by Hyperwise — AI Infrastructure for Finance and Supply Chains
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Hyperwise LLC delivers integrated enterprise solutions leveraging deep expertise in AI, blockchain, and big data. 
              Our portfolio includes cognitive banking solutions (AML automation, fraud detection, KYC), 
              AP/AR automation, and supply chain intelligence with predictive analytics.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {[
                { title: "Cognitive Banking", description: "AML, fraud detection, KYC acceleration" },
                { title: "Finance Automation", description: "AP, AR, and payment orchestration" },
                { title: "Supply Chain AI", description: "Inventory optimization, demand forecasting" },
              ].map((item, index) => (
                <Card key={index} className="border-border/50">
                  <CardContent className="p-4 text-center">
                    <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <strong className="text-foreground">Clarus AP</strong> is a standalone AP automation product built and operated by Hyperwise LLC.
            </p>
            <a href="https://www.hyperwise.io" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              www.hyperwise.io
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start automating AP before your team even arrives at work.
            </h2>
            <p className="text-xl text-primary-foreground/80 mb-8">
              14-day free trial. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact">
                <Button size="lg" variant="secondary" className="gap-2">
                  Contact Sales <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/contact">
                <Button size="lg" variant="outline" className="gap-2 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
                  Request Enterprise Package
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Landing;
