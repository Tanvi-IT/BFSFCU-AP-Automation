import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clarusLogo from "@/assets/clarus-logo.png";

const PublicProcessFlow = () => {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;
    
    setIsGenerating(true);
    
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: "Clarus-AP-User-Guide.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };
      
      await html2pdf().set(opt).from(contentRef.current).save();
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Controls */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
        <Button onClick={handleDownloadPDF} disabled={isGenerating}>
          {isGenerating ? (
            <>Generating PDF...</>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </>
          )}
        </Button>
      </div>

      {/* PDF Content */}
      <div ref={contentRef} className="max-w-4xl mx-auto bg-white text-gray-900 p-8">
        {/* Cover Page */}
        <div className="text-center mb-12 pb-8 border-b-2 border-primary">
          <img src={clarusLogo} alt="Clarus AP" className="h-16 mx-auto mb-6" />
          <h1 className="text-4xl font-bold text-primary mb-4">
            Clarus AP User Guide
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Complete User Documentation
          </p>
          <p className="text-sm text-gray-500">
            Version 1.0 • {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Table of Contents */}
        <div className="mb-12 pb-8 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-primary mb-4 flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Table of Contents
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>User Roles Overview</li>
            <li>Getting Started</li>
            <li>Invoice Submission</li>
            <li>Invoice Approval Workflow</li>
            <li>Vendor Management</li>
            <li>ERP Export</li>
            <li>Glossary</li>
          </ol>
        </div>

        {/* Section 1: User Roles */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            1. User Roles Overview
          </h2>
          
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Maker</h3>
              <p className="text-sm text-gray-700 mb-2"><strong>Primary Function:</strong> Invoice intake and preparation</p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Upload invoices manually or via email</li>
                <li>Review extracted invoice data</li>
                <li>Correct fields and assign vendors</li>
                <li>Submit invoices for approval</li>
              </ul>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-green-900 mb-2">Checker</h3>
              <p className="text-sm text-gray-700 mb-2"><strong>Primary Function:</strong> Invoice approval and quality control</p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Review submitted invoices</li>
                <li>Approve or reject invoices</li>
                <li>View export history</li>
              </ul>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-purple-900 mb-2">Administrator</h3>
              <p className="text-sm text-gray-700 mb-2"><strong>Primary Function:</strong> Full tenant administration</p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>All Maker and Checker capabilities</li>
                <li>Manage vendor verification</li>
                <li>Configure ERP integration settings</li>
                <li>View audit logs and manage users</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 2: Getting Started */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            2. Getting Started
          </h2>

          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Logging In</h3>
              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                <li>Navigate to app.clarusap.com</li>
                <li>Enter your email and password</li>
                <li>Click "Sign In"</li>
                <li>You'll be directed to your dashboard</li>
              </ol>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Dashboard Overview</h3>
              <p className="text-sm text-gray-600 mb-2">
                Your dashboard shows key metrics including:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Total invoices processed</li>
                <li>Pending approvals</li>
                <li>Exception queue items</li>
                <li>Recent activity</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3: Invoice Submission */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            3. Invoice Submission
          </h2>

          <div className="space-y-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Email Submission</h3>
              <p className="text-sm text-gray-600 mb-2">
                Forward invoices to your dedicated email address. You can find this address in Settings &gt; Email Ingestion.
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Attach PDF invoices to the email</li>
                <li>Multiple attachments are supported</li>
                <li>Invoices are processed automatically</li>
              </ul>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Manual Upload</h3>
              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                <li>Navigate to Invoices &gt; Upload</li>
                <li>Drag and drop files or click to browse</li>
                <li>Select PDF, PNG, or JPG files</li>
                <li>Click "Upload" to process</li>
              </ol>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Supported Formats</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>PDF (recommended)</li>
                <li>PNG</li>
                <li>JPG / JPEG</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 4: Invoice Workflow */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            4. Invoice Approval Workflow
          </h2>

          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Status</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Next Steps</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium">Ingested</td>
                    <td className="border border-gray-300 px-3 py-2">Invoice uploaded, awaiting processing</td>
                    <td className="border border-gray-300 px-3 py-2">Automatic extraction begins</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium">Validated</td>
                    <td className="border border-gray-300 px-3 py-2">Data extracted successfully</td>
                    <td className="border border-gray-300 px-3 py-2">Review and submit for approval</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium">Submitted</td>
                    <td className="border border-gray-300 px-3 py-2">Awaiting Checker review</td>
                    <td className="border border-gray-300 px-3 py-2">Checker approves or rejects</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium">Approved</td>
                    <td className="border border-gray-300 px-3 py-2">Ready for ERP export</td>
                    <td className="border border-gray-300 px-3 py-2">Queued for export</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium">Exported</td>
                    <td className="border border-gray-300 px-3 py-2">Sent to ERP system</td>
                    <td className="border border-gray-300 px-3 py-2">Complete</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium">Exception</td>
                    <td className="border border-gray-300 px-3 py-2">Requires manual review</td>
                    <td className="border border-gray-300 px-3 py-2">Resolve issues and resubmit</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 5: Vendor Management */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            5. Vendor Management
          </h2>

          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Vendor Directory</h3>
              <p className="text-sm text-gray-600 mb-2">
                View all vendors in your organization from the Vendors page.
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>See vendor status (active, pending)</li>
                <li>View risk scores</li>
                <li>Check bank verification status</li>
              </ul>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Pending Verification (Admins Only)</h3>
              <p className="text-sm text-gray-600 mb-2">
                When invoices contain new vendors, they're flagged for verification.
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Review vendor details</li>
                <li>Approve or merge with existing vendor</li>
                <li>Edit vendor information as needed</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 6: ERP Export */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            6. ERP Export
          </h2>

          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Automatic Export</h3>
              <p className="text-sm text-gray-600">
                Approved invoices are automatically queued for export based on your ERP settings.
                Exports run on a scheduled basis and deliver files to your configured destination.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Manual Export</h3>
              <p className="text-sm text-gray-600">
                Administrators can trigger manual exports from the Export History page.
                Click "Run Manual Export" to process all pending approved invoices.
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Supported ERP Systems</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>SAP</li>
                <li>Oracle</li>
                <li>NetSuite</li>
                <li>Microsoft Dynamics 365</li>
                <li>Odoo</li>
                <li>QuickBooks</li>
                <li>And more...</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 7: Glossary */}
        <section className="mb-10 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
            7. Glossary
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left">Term</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">Definition</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">Invoice</td>
                  <td className="border border-gray-300 px-3 py-2">A document requesting payment from a vendor</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">Vendor</td>
                  <td className="border border-gray-300 px-3 py-2">A supplier or service provider who sends invoices</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">ERP</td>
                  <td className="border border-gray-300 px-3 py-2">Enterprise Resource Planning - your accounting/finance system</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">Exception</td>
                  <td className="border border-gray-300 px-3 py-2">An invoice requiring manual review due to discrepancies</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">Maker</td>
                  <td className="border border-gray-300 px-3 py-2">User role for invoice entry and preparation</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">Checker</td>
                  <td className="border border-gray-300 px-3 py-2">User role for invoice approval</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium">Risk Score</td>
                  <td className="border border-gray-300 px-3 py-2">A calculated measure of potential issues with a vendor or invoice</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t-2 border-gray-200 text-center text-sm text-gray-500">
          <p><strong>Clarus AP</strong> - Intelligent Accounts Payable Automation</p>
          <p className="mt-1">© {new Date().getFullYear()} Hyperwise LLC. All rights reserved.</p>
          <p className="mt-1">261 Morning Sun Ave, Suite B, Mill Valley, CA 94941</p>
        </div>
      </div>
    </div>
  );
};

export default PublicProcessFlow;