import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

const Terms = () => {
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
            <h1 className="text-4xl font-bold text-foreground mb-2">Terms & Conditions</h1>
            <p className="text-muted-foreground mb-8">Last updated: November 30, 2025</p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">1. Agreement to Terms</h2>
            <p className="text-muted-foreground mb-4">
              By accessing or using Clarus AP ("Service"), operated by Hyperwise LLC ("Company"), you agree to be bound by these Terms & Conditions. If you do not agree, you may not use the Service.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground mb-4">
              Clarus AP is an AI-powered accounts payable automation platform that provides invoice processing, vendor management, anomaly detection, and workflow automation for enterprise finance teams.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground mb-4">
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate and complete information when creating an account and keep this information updated.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">4. Acceptable Use</h2>
            <p className="text-muted-foreground mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Use the Service for any unlawful purpose</li>
              <li>Upload malicious files or attempt to compromise the Service</li>
              <li>Attempt to access other users' data or accounts</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Resell or redistribute access to the Service without authorization</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">5. Data Ownership</h2>
            <p className="text-muted-foreground mb-4">
              You retain all ownership rights to the invoice data and documents you upload to the Service. By using the Service, you grant us a limited license to process this data solely for the purpose of providing the Service to you.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">6. AI Processing</h2>
            <p className="text-muted-foreground mb-4">
              The Service uses artificial intelligence and machine learning to process invoices. While we strive for accuracy, AI-extracted data should be reviewed by users before taking financial action. We are not liable for errors in AI-processed data.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">7. Service Availability</h2>
            <p className="text-muted-foreground mb-4">
              We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We may perform maintenance or updates that temporarily affect availability.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">8. Fees and Payment</h2>
            <p className="text-muted-foreground mb-4">
              Subscription fees are billed according to your selected plan. Fees are non-refundable except as required by law or as specified in your subscription agreement.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">9. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-4">
              To the maximum extent permitted by law, Hyperwise LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">10. Termination</h2>
            <p className="text-muted-foreground mb-4">
              We may terminate or suspend your access to the Service for violations of these Terms. Upon termination, your right to use the Service ceases immediately. You may export your data prior to termination.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">11. Governing Law</h2>
            <p className="text-muted-foreground mb-4">
              These Terms shall be governed by the laws of the State of California, without regard to conflict of law principles.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">12. Contact</h2>
            <p className="text-muted-foreground mb-4">
              For questions about these Terms:
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

export default Terms;
