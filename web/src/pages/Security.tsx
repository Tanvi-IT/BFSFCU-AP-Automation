import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield,
  Lock,
  Server,
  Globe,
  Database,
  FileCheck,
  Users,
  ArrowLeft,
  CheckCircle2,
  Eye,
  RefreshCcw,
  Key,
  Menu,
  X,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { useState } from "react";

const Security = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Clarus AP</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Product
            </Link>
            {/* Pricing link temporarily hidden
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            */}
            <Link to="/developers" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Developers
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
            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background p-4">
            <nav className="flex flex-col gap-4">
              <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Product</Link>
              {/* <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Pricing</Link> */}
              <Link to="/developers" className="text-sm font-medium text-muted-foreground hover:text-foreground">Developers</Link>
              <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground">Contact</Link>
              <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign In</Link>
            </nav>
          </div>
        )}
      </header>

      {/* Back Navigation */}
      <div className="container py-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      {/* Hero */}
      <section className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 mb-6">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">Enterprise Security</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Security & Compliance
          </h1>
          <p className="text-xl text-muted-foreground">
            Clarus AP is built with enterprise-grade security from the ground up. 
            Your financial data deserves the highest level of protection.
          </p>
        </div>
      </section>

      {/* Security Features - 9 Cards (3x3) */}
      <section className="container py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>SOC 2 Type II Aligned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Security controls independently verified by third-party auditors. 
                Annual audits ensure ongoing compliance.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Server className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>US Data Residency</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                All data stored exclusively in US-based data centers. 
                No cross-border data routing ensures compliance.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Eye className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Zero Trust Architecture</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Every request is authenticated and authorized. 
                No implicit trust, even within the network.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Lock className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Encryption at Rest</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                AES-256 encryption protects all stored data. 
                Keys managed with HSM-backed infrastructure.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Key className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Encryption in Transit</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                TLS 1.3 encryption for all data in transit. 
                Perfect forward secrecy ensures long-term protection.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Database className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Immutable Audit Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Append-only audit trail prevents tampering. 
                Complete visibility into who did what, when.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <RefreshCcw className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Disaster Recovery</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Automated backups with point-in-time recovery. 
                Multi-region redundancy ensures availability.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Access Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Granular role-based access control (RBAC). 
                Maker-Checker workflow prevents unauthorized actions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Globe className="h-10 w-10 text-secondary mb-2" />
              <CardTitle>Vendor Governance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                All third-party vendors undergo security review. 
                Continuous monitoring of supply chain security.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Compliance Certifications */}
      <section className="container py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Compliance & Certifications</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              "SOC 2 Type II Certified (In Progress)",
              "ISO 27001 Aligned",
              "GDPR Compliant",
              "CCPA Compliant",
              "HIPAA Ready",
              "PCI DSS Level 1 Infrastructure",
            ].map((cert, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-5 w-5 text-secondary flex-shrink-0" />
                <span className="font-medium">{cert}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Documentation */}
      <section className="container py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Security Documentation</h2>
          <p className="text-muted-foreground mb-8">
            Request our security documentation package including SOC 2 report, 
            penetration test results, and security questionnaire responses.
          </p>
          <Link to="/contact">
            <Button size="lg">Request Security Package</Button>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-12">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="py-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Secure Your AP Process?</h2>
            <p className="text-primary-foreground/80 mb-6 max-w-xl mx-auto">
              Join hundreds of enterprises that trust Clarus AP with their most sensitive financial data.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact">
                <Button size="lg" variant="secondary">Contact Sales</Button>
              </Link>
              <Link to="/contact">
                <Button size="lg" variant="outline" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <Footer />
    </div>
  );
};

export default Security;
