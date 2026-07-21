import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function POCDocumentation() {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = document.getElementById("poc-documentation-content");
      
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: "Clarus_AP_POC_Documentation.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/poc/low-confidence" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <Button onClick={handleDownloadPDF} disabled={isGenerating}>
            <Download className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating PDF..." : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Document Content */}
      <div id="poc-documentation-content" className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Cover Section */}
        <div className="text-center space-y-4 pb-8 border-b">
          <div className="flex justify-center mb-4">
            <FileText className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">AP Automation</h1>
          <p className="text-xl text-muted-foreground">AI-Native Accounts Payable Automation Platform</p>
          <p className="text-sm text-muted-foreground">Proof of Concept Documentation</p>
          <p className="text-sm text-muted-foreground">Version 1.0 | December 2024</p>
        </div>

        {/* Elevator Pitch */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed">
              <strong>AP Automation</strong> is an AI-native accounts payable automation platform that transforms invoice processing 
              from a manual, error-prone workflow into an intelligent, autonomous system. By leveraging advanced machine learning 
              for document extraction, anomaly detection, and confidence-based routing, AP Automation reduces invoice processing time 
              by up to 80% while dramatically improving accuracy and fraud detection. The platform automatically extracts invoice 
              data, matches vendors, detects duplicates at three levels, calculates risk scores, and routes invoices to the 
              appropriate queue—all without human intervention for clean transactions. This enables finance teams to focus on 
              exceptions and strategic decisions rather than data entry and manual verification.
            </p>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card>
          <CardHeader>
            <CardTitle>Table of Contents</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Platform Overview</li>
              <li>Invoice Ingestion Pipeline</li>
              <li>AI Extraction Engine</li>
              <li>Confidence Scoring & Routing</li>
              <li>Duplicate Detection System</li>
              <li>Approval Workflow</li>
              <li>Role-Based Access Control</li>
              <li>ERP Export Capabilities</li>
              <li>Key Differentiators</li>
            </ol>
          </CardContent>
        </Card>

        {/* Section 1: Platform Overview */}
        <Card>
          <CardHeader>
            <CardTitle>1. Platform Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              AP Automation is built from the ground up as an AI-native application, meaning artificial intelligence is not 
              an add-on feature but the core foundation of every operation. The platform processes invoices through a 
              sophisticated pipeline that combines:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li><strong>Intelligent Document Processing:</strong> Advanced OCR and natural language understanding for data extraction</li>
              <li><strong>Anomaly Detection Engine:</strong> Real-time identification of pricing deviations, duplicate patterns, and fraud indicators</li>
              <li><strong>Confidence-Based Routing:</strong> Automatic classification of invoices into high-confidence (auto-approvable) and low-confidence (requires review) queues</li>
              <li><strong>Multi-Level Duplicate Detection:</strong> Three-tier system preventing duplicate payments at document, data, and semantic levels</li>
              <li><strong>Maker-Checker Workflow:</strong> Enterprise-grade approval controls with full audit trail</li>
            </ul>
          </CardContent>
        </Card>

        {/* Section 2: Invoice Ingestion Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle>2. Invoice Ingestion Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Invoices enter the system through two primary channels:
            </p>
            
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-semibold text-foreground">Email Ingestion</h4>
              <p className="text-sm text-muted-foreground">
                Each tenant receives a unique email address (invoices+[tenant-id]@inbox.clarusap.com). 
                Vendors send invoices directly to this address. The system automatically:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground ml-4">
                <li>Extracts PDF, PNG, JPG, and TIFF attachments</li>
                <li>Processes ZIP archives recursively</li>
                <li>Converts image formats as needed</li>
                <li>Captures sender email for audit trail</li>
              </ul>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-semibold text-foreground">Manual Upload</h4>
              <p className="text-sm text-muted-foreground">
                Users can upload invoices directly through the web interface with drag-and-drop support 
                for bulk uploads. Multiple files can be processed simultaneously.
              </p>
            </div>

            {/* Process Flow Diagram */}
            <div className="bg-card border rounded-lg p-4 mt-4">
              <h4 className="font-semibold text-foreground mb-4">Ingestion Flow Diagram</h4>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{`┌─────────────────┐     ┌─────────────────┐
│  Email Service  │     │  Manual Upload  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
         ┌─────────────────────┐
         │  File Extraction &  │
         │  Format Validation  │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │   Secure Storage    │
         │  (Encrypted Cloud)  │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │  AI Processing      │
         │  Pipeline Trigger   │
         └─────────────────────┘`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: AI Extraction Engine */}
        <Card>
          <CardHeader>
            <CardTitle>3. AI Extraction Engine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              The AI extraction engine uses state-of-the-art large language models to understand and extract 
              structured data from unstructured invoice documents. Unlike traditional OCR-only solutions, 
              our engine understands context and semantics.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <h5 className="font-semibold text-sm text-foreground">Header Extraction</h5>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>• Invoice Number</li>
                  <li>• Invoice Date</li>
                  <li>• Due Date</li>
                  <li>• Vendor Name & Details</li>
                  <li>• Currency</li>
                </ul>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <h5 className="font-semibold text-sm text-foreground">Financial Data</h5>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>• Subtotal Amount</li>
                  <li>• Tax Amount & Rates</li>
                  <li>• Total Amount</li>
                  <li>• Payment Terms</li>
                  <li>• Bank Details</li>
                </ul>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <h5 className="font-semibold text-sm text-foreground">Line Items</h5>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>• Description</li>
                  <li>• Quantity</li>
                  <li>• Unit Price</li>
                  <li>• Line Total</li>
                  <li>• GL Code Suggestions</li>
                </ul>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <h5 className="font-semibold text-sm text-foreground">Vendor Matching</h5>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>• Tax ID Matching</li>
                  <li>• Bank Account Matching</li>
                  <li>• Email Domain Matching</li>
                  <li>• Fuzzy Name Matching</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Confidence Scoring */}
        <Card>
          <CardHeader>
            <CardTitle>4. Confidence Scoring & Routing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Every invoice receives a confidence score (0-100%) based on multiple factors. This score 
              determines automatic routing to the appropriate queue.
            </p>

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-semibold text-foreground mb-3">Confidence Factors</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-foreground">Factor</th>
                    <th className="text-left py-2 text-foreground">Impact</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2">All required fields extracted</td>
                    <td className="py-2 text-green-600">+20%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Vendor matched in database</td>
                    <td className="py-2 text-green-600">+25%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">No anomalies detected</td>
                    <td className="py-2 text-green-600">+20%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Amount within vendor baseline</td>
                    <td className="py-2 text-green-600">+15%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Math validation passed</td>
                    <td className="py-2 text-green-600">+10%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Bank details unchanged</td>
                    <td className="py-2 text-green-600">+10%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Missing required fields</td>
                    <td className="py-2 text-red-600">-30%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">New/unverified vendor</td>
                    <td className="py-2 text-red-600">-25%</td>
                  </tr>
                  <tr>
                    <td className="py-2">Duplicate detected</td>
                    <td className="py-2 text-red-600">-40%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-lg">
                <h5 className="font-semibold text-green-700 dark:text-green-400">High-Confidence Queue</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  Score ≥ 70%<br />
                  • Clean extraction<br />
                  • Known vendor<br />
                  • No anomalies<br />
                  • Eligible for auto-approval
                </p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
                <h5 className="font-semibold text-yellow-700 dark:text-yellow-400">Low-Confidence Queue</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  Score &lt; 70%<br />
                  • Missing fields<br />
                  • New vendor<br />
                  • Anomalies detected<br />
                  • Requires manual review
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Duplicate Detection */}
        <Card>
          <CardHeader>
            <CardTitle>5. Duplicate Detection System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              AP Automation implements a sophisticated three-level duplicate detection system to prevent 
              duplicate payments—one of the most common and costly AP errors.
            </p>

            {/* Level 1: Hard Duplicate */}
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">LEVEL 1</span>
                <h4 className="font-semibold text-foreground">Hard Duplicate</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Definition:</strong> Same vendor AND same invoice number
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Detection:</strong> Exact match query during ingestion
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Action:</strong> Invoice blocked immediately. Routed to Exception Queue. 
                Only Admin can resolve. Approval completely blocked for all other roles.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>UI Indicator:</strong> Red "HARD DUPLICATE" badge with link to original invoice
              </p>
            </div>

            {/* Level 2: Soft Duplicate */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded">LEVEL 2</span>
                <h4 className="font-semibold text-foreground">Soft Duplicate (Possible Duplicate)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Definition:</strong> Same vendor AND same total amount AND invoice date within ±48 hours
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Detection:</strong> Similarity query comparing vendor, amount, and date proximity
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Action:</strong> Automatically routed to Low-Confidence Queue. Never appears in 
                High-Confidence. Requires manual review but can be approved by Checker after verification.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>UI Indicator:</strong> Yellow "Possible Duplicate" badge with warning card
              </p>
            </div>

            {/* Level 3: File Duplicate */}
            <div className="bg-muted border p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-muted-foreground text-white text-xs font-bold px-2 py-1 rounded">LEVEL 3</span>
                <h4 className="font-semibold text-foreground">File Duplicate</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Definition:</strong> Same file hash (SHA-256) as existing invoice
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Detection:</strong> Cryptographic hash computed on upload and compared against database
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Action:</strong> Routed to Low-Confidence Queue. Admin can override if legitimate 
                (e.g., re-submitted with corrections).
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>UI Indicator:</strong> Gray "Duplicate File" badge
              </p>
            </div>

            {/* Duplicate Detection Flow */}
            <div className="bg-card border rounded-lg p-4 mt-4">
              <h4 className="font-semibold text-foreground mb-4">Duplicate Detection Flow</h4>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{`┌─────────────────────────────────────────────────────────┐
│                   Invoice Received                       │
└────────────────────────┬────────────────────────────────┘
                         ▼
         ┌───────────────────────────────┐
         │  Compute File Hash (SHA-256)  │
         └───────────────┬───────────────┘
                         ▼
         ┌───────────────────────────────┐
         │  Check: Same Hash Exists?     │
         └───────────────┬───────────────┘
                         │
            ┌────────────┴────────────┐
            │ YES                     │ NO
            ▼                         ▼
   ┌─────────────────┐    ┌───────────────────────────┐
   │ FILE DUPLICATE  │    │ Check: Same Vendor +      │
   │ → Low-Conf Queue│    │ Same Invoice Number?      │
   └─────────────────┘    └─────────────┬─────────────┘
                                        │
                           ┌────────────┴────────────┐
                           │ YES                     │ NO
                           ▼                         ▼
                  ┌─────────────────┐    ┌───────────────────────────┐
                  │ HARD DUPLICATE  │    │ Check: Same Vendor +      │
                  │ → Exception     │    │ Same Amount +             │
                  │ → Block Approval│    │ Date within ±48 hours?    │
                  └─────────────────┘    └─────────────┬─────────────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          │ YES                     │ NO
                                          ▼                         ▼
                                 ┌─────────────────┐    ┌─────────────────┐
                                 │ SOFT DUPLICATE  │    │ NO DUPLICATE    │
                                 │ → Low-Conf Queue│    │ → Normal Routing│
                                 └─────────────────┘    └─────────────────┘`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Approval Workflow */}
        <Card>
          <CardHeader>
            <CardTitle>6. Approval Workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              AP Automation implements a robust maker-checker workflow with intelligent automation.
            </p>

            <div className="bg-card border rounded-lg p-4">
              <h4 className="font-semibold text-foreground mb-4">Workflow Diagram</h4>
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{`┌──────────────────────────────────────────────────────────────────┐
│                        INVOICE INGESTED                           │
└────────────────────────────────┬─────────────────────────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │   AI EXTRACTION &      │
                    │   CONFIDENCE SCORING   │
                    └────────────┬───────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ High-Confidence │ │ Low-Confidence  │ │ Exception Queue │
    │ Queue (≥70%)    │ │ Queue (<70%)    │ │ (Blocked)       │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             │                   ▼                   │
             │        ┌─────────────────────┐        │
             │        │ MAKER REVIEW        │        │
             │        │ • Edit fields       │        │
             │        │ • Assign vendor     │        │
             │        │ • Add notes         │        │
             │        └──────────┬──────────┘        │
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │    CHECKER APPROVAL    │
                    │    • Approve           │
                    │    • Reject            │
                    │    • Route to Admin    │
                    └────────────┬───────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │    APPROVED     │ │    REJECTED     │ │   EXCEPTION     │
    │  → ERP Export   │ │  → Audit Log    │ │  → Admin Review │
    └─────────────────┘ └─────────────────┘ └─────────────────┘`}
              </pre>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg mt-4">
              <h4 className="font-semibold text-foreground mb-2">Auto-Approval Engine (Configurable)</h4>
              <p className="text-sm text-muted-foreground">
                Admins can configure rules for automatic approval of clean invoices:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 ml-4">
                <li>• Confidence threshold (default: 70%)</li>
                <li>• Require vendor to be verified</li>
                <li>• Require bank account to be verified</li>
                <li>• Maximum auto-approval amount</li>
                <li>• Require no anomaly alerts</li>
                <li>• Always review new vendors</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Section 7: RBAC */}
        <Card>
          <CardHeader>
            <CardTitle>7. Role-Based Access Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-foreground">Role</th>
                  <th className="text-left py-2 text-foreground">Capabilities</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-3 font-semibold">Maker</td>
                  <td className="py-3">
                    View invoices • Edit invoice fields • Assign vendors • Add notes • 
                    Upload invoices • Cannot approve, reject, or configure settings
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 font-semibold">Checker</td>
                  <td className="py-3">
                    All Maker capabilities • Approve invoices • Reject invoices • 
                    Route to exception queue • View audit trail
                  </td>
                </tr>
                <tr>
                  <td className="py-3 font-semibold">Admin</td>
                  <td className="py-3">
                    All Checker capabilities • Resolve hard duplicates • Manage vendors • 
                    Configure auto-approval rules • Manage ERP settings • View all reports
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Section 8: ERP Export */}
        <Card>
          <CardHeader>
            <CardTitle>8. ERP Export Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Approved invoices can be exported to major ERP systems in their native formats:
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="font-semibold text-foreground">SAP</p>
                <p className="text-xs text-muted-foreground">CSV/XML</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="font-semibold text-foreground">Oracle</p>
                <p className="text-xs text-muted-foreground">XML</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="font-semibold text-foreground">NetSuite</p>
                <p className="text-xs text-muted-foreground">JSON</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="font-semibold text-foreground">Dynamics 365</p>
                <p className="text-xs text-muted-foreground">CSV</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="font-semibold text-foreground">QuickBooks</p>
                <p className="text-xs text-muted-foreground">JSON</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="font-semibold text-foreground">Odoo</p>
                <p className="text-xs text-muted-foreground">JSON</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 9: Key Differentiators */}
        <Card>
          <CardHeader>
            <CardTitle>9. Key Differentiators</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-primary/5 p-4 rounded-lg">
                <h5 className="font-semibold text-foreground">AI-Native Architecture</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  Built from scratch with AI at the core, not bolted on. Every decision flows through 
                  intelligent models.
                </p>
              </div>
              <div className="bg-primary/5 p-4 rounded-lg">
                <h5 className="font-semibold text-foreground">Three-Level Duplicate Detection</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  File hash, exact match, and semantic similarity detection prevent duplicate payments 
                  at every level.
                </p>
              </div>
              <div className="bg-primary/5 p-4 rounded-lg">
                <h5 className="font-semibold text-foreground">Confidence-Based Routing</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  Intelligent scoring automatically routes clean invoices while flagging exceptions 
                  for human review.
                </p>
              </div>
              <div className="bg-primary/5 p-4 rounded-lg">
                <h5 className="font-semibold text-foreground">Zero-Touch Processing</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  High-confidence invoices from verified vendors can be automatically approved without 
                  any human intervention.
                </p>
              </div>
              <div className="bg-primary/5 p-4 rounded-lg">
                <h5 className="font-semibold text-foreground">Enterprise-Grade Audit Trail</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  Every action is logged with timestamps, user IDs, and full context for SOC 2 compliance.
                </p>
              </div>
              <div className="bg-primary/5 p-4 rounded-lg">
                <h5 className="font-semibold text-foreground">Multi-ERP Support</h5>
                <p className="text-sm text-muted-foreground mt-2">
                  Export to any major ERP in native format. AI-assisted field mapping reduces 
                  integration complexity.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pt-8 border-t text-muted-foreground text-sm">
          <p>© 2024 AP Automation. All rights reserved.</p>
          <p>A product of Hyperwise LLC</p>
          <p className="mt-2">261 Morning Sun Ave, Suite B, Mill Valley, CA 94941</p>
        </div>
      </div>
    </div>
  );
}
