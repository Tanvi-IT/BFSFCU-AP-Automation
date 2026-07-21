import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

const DPA = () => {
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
            <h1 className="text-4xl font-bold text-foreground mb-2">Data Processing Agreement</h1>
            <p className="text-muted-foreground mb-8">Last updated: November 30, 2025</p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">1. Parties</h2>
            <p className="text-muted-foreground mb-4">
              This Data Processing Agreement ("DPA") is entered into between Hyperwise LLC ("Processor," "we," "us") and the entity agreeing to these terms ("Controller," "you," "Customer").
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">2. Scope and Purpose</h2>
            <p className="text-muted-foreground mb-4">
              This DPA applies to the processing of personal data by Hyperwise LLC on behalf of the Customer in connection with the provision of the Clarus AP service. The purpose of processing is to provide accounts payable automation services including invoice processing, vendor management, and anomaly detection.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">3. Categories of Data</h2>
            <p className="text-muted-foreground mb-4">The following categories of personal data may be processed:</p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Contact information (names, email addresses, phone numbers)</li>
              <li>Business information (company names, addresses, tax IDs)</li>
              <li>Financial information (invoice amounts, bank account details)</li>
              <li>User account information (usernames, authentication data)</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">4. Data Subjects</h2>
            <p className="text-muted-foreground mb-4">Data subjects may include:</p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Customer employees and authorized users</li>
              <li>Customer vendors and suppliers</li>
              <li>Individuals named on invoices and financial documents</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">5. Processor Obligations</h2>
            <p className="text-muted-foreground mb-4">Hyperwise LLC agrees to:</p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Process personal data only on documented instructions from the Controller</li>
              <li>Ensure personnel are bound by confidentiality obligations</li>
              <li>Implement appropriate technical and organizational security measures</li>
              <li>Assist the Controller in responding to data subject requests</li>
              <li>Delete or return personal data upon termination of services</li>
              <li>Make available information necessary to demonstrate compliance</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">6. Security Measures</h2>
            <p className="text-muted-foreground mb-4">We implement the following security measures:</p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>AES-256 encryption for data at rest</li>
              <li>TLS 1.3 encryption for data in transit</li>
              <li>Multi-tenant data isolation using row-level security</li>
              <li>Regular security assessments and penetration testing</li>
              <li>Access controls and audit logging</li>
              <li>Incident response procedures</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">7. Sub-Processors</h2>
            <p className="text-muted-foreground mb-4">
              We may engage sub-processors to assist in providing the Service. A list of current sub-processors is available upon request. We will notify customers of any changes to sub-processors.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">8. Data Location</h2>
            <p className="text-muted-foreground mb-4">
              All personal data is stored and processed exclusively within the United States. No cross-border transfers of personal data occur during normal operation of the Service.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">9. Data Breach Notification</h2>
            <p className="text-muted-foreground mb-4">
              In the event of a personal data breach, we will notify the Controller without undue delay (within 72 hours where feasible) and provide information necessary for the Controller to fulfill its breach notification obligations.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">10. Audits</h2>
            <p className="text-muted-foreground mb-4">
              Upon reasonable request and subject to confidentiality obligations, we will make available information necessary to demonstrate compliance with this DPA. Customers may request our SOC 2 report and security documentation.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">11. Term and Termination</h2>
            <p className="text-muted-foreground mb-4">
              This DPA remains in effect for the duration of the Service agreement. Upon termination, we will delete or return all personal data as requested by the Controller, unless legal requirements mandate retention.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">12. Contact</h2>
            <p className="text-muted-foreground mb-4">
              For DPA inquiries or to request a signed copy:
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

export default DPA;
