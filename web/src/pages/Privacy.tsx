import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">Clarus AP</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Back Navigation */}
      <div className="container py-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      {/* Content */}
      <section className="py-12">
        <div className="container">
          <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
            <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground mb-8">Last updated: November 30, 2025</p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">1. Introduction</h2>
            <p className="text-muted-foreground mb-4">
              Hyperwise LLC ("we," "us," or "our") operates the Clarus AP platform ("Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">2. Information We Collect</h2>
            <h3 className="text-xl font-medium text-foreground mt-6 mb-3">Account Information</h3>
            <p className="text-muted-foreground mb-4">
              When you create an account, we collect your name, email address, company name, and password. For enterprise accounts, we may also collect billing contact information and company size.
            </p>

            <h3 className="text-xl font-medium text-foreground mt-6 mb-3">Invoice Data</h3>
            <p className="text-muted-foreground mb-4">
              To provide our AP automation services, we process invoice documents you upload or forward via email. This includes vendor information, invoice amounts, line items, and associated metadata.
            </p>

            <h3 className="text-xl font-medium text-foreground mt-6 mb-3">Usage Data</h3>
            <p className="text-muted-foreground mb-4">
              We automatically collect information about how you interact with the Service, including pages visited, features used, and timestamps of actions taken.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>To provide and maintain the Service</li>
              <li>To process and analyze invoice data using AI/ML technologies</li>
              <li>To detect anomalies, fraud, and duplicate payments</li>
              <li>To send transactional communications and service updates</li>
              <li>To improve and optimize the Service</li>
              <li>To comply with legal obligations</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">4. Data Storage and Security</h2>
            <p className="text-muted-foreground mb-4">
              All data is stored exclusively in United States data centers. We employ industry-standard security measures including AES-256 encryption at rest, TLS 1.3 encryption in transit, and multi-tenant data isolation using row-level security policies.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">5. Data Sharing</h2>
            <p className="text-muted-foreground mb-4">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Service providers who assist in operating our platform</li>
              <li>AI/ML processing services for invoice extraction</li>
              <li>Legal authorities when required by law</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">6. Data Retention</h2>
            <p className="text-muted-foreground mb-4">
              We retain your data for as long as your account is active or as needed to provide services. Invoice data is retained according to your subscription terms and applicable legal requirements for financial records.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">7. Your Rights</h2>
            <p className="text-muted-foreground mb-4">
              Depending on your jurisdiction, you may have rights to access, correct, delete, or export your personal data. To exercise these rights, contact us at <a href="mailto:legal@clarusap.com" className="text-accent hover:underline">legal@clarusap.com</a>.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">8. Contact Us</h2>
            <p className="text-muted-foreground mb-4">
              For privacy-related inquiries:
            </p>
            <address className="text-muted-foreground not-italic mb-4">
              Hyperwise LLC<br />
              261 Morning Sun Ave, Suite B<br />
              Mill Valley, CA 94941<br />
              <a href="mailto:legal@clarusap.com" className="text-accent hover:underline">legal@clarusap.com</a>
            </address>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Privacy;
