import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, ArrowLeft, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import clarusLogo from "@/assets/clarus-logo.png";

const InternalProcessFlow = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isAdmin } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Only allow superadmin and admin access
  if (!isSuperAdmin && !isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            This documentation is for internal use only.
          </p>
          <Button onClick={() => navigate("/documentation/public-process-flow")}>
            View Public Documentation
          </Button>
        </div>
      </Layout>
    );
  }

  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;
    
    setIsGenerating(true);
    
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: "Clarus-AP-Internal-Process-Flow.pdf",
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
    <Layout>
      <div className="min-h-screen">
        {/* Header Controls */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <span className="text-destructive font-semibold text-sm px-2 py-1 bg-destructive/10 rounded">
              INTERNAL ONLY
            </span>
          </div>
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
          <div className="text-center mb-12 pb-8 border-b-2 border-red-500">
            <div className="bg-red-100 text-red-800 px-4 py-2 rounded mb-4 inline-block font-bold">
              CONFIDENTIAL - INTERNAL USE ONLY
            </div>
            <img src={clarusLogo} alt="Clarus AP" className="h-16 mx-auto mb-6" />
            <h1 className="text-4xl font-bold text-primary mb-4">
              Clarus AP Technical Architecture
            </h1>
            <p className="text-xl text-gray-600 mb-2">
              Internal Process Flow Documentation
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
              <li>System Architecture Overview</li>
              <li>Email Ingestion Pipeline</li>
              <li>AI Extraction Engine</li>
              <li>Vendor Auto-Matching Algorithm</li>
              <li>Variation Detection Rules</li>
              <li>Export Pipeline Architecture</li>
              <li>Risk Scoring Models</li>
              <li>Database Schema</li>
            </ol>
          </div>

          {/* Section 1: Architecture */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              1. System Architecture Overview
            </h2>
            
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Technology Stack</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li><strong>Frontend:</strong> React 18, TypeScript, Tailwind CSS, Vite</li>
                  <li><strong>Backend:</strong> Supabase (PostgreSQL, Auth, Storage, Edge Functions)</li>
                  <li><strong>AI Engine:</strong> AI Gateway (Gemini 2.5 Flash)</li>
                  <li><strong>Email:</strong> Mailgun webhook integration</li>
                  <li><strong>File Storage:</strong> Supabase Storage</li>
                </ul>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-3">High-Level Architecture</h4>
                <div className="text-xs font-mono bg-white p-3 rounded border overflow-x-auto">
                  <pre>{`┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                       │
├─────────────────────────────────────────────────────────────┤
│  Dashboard │ Invoices │ Vendors │ Settings │ Developer Docs  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend                          │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│    Auth     │   Database  │   Storage   │  Edge Functions   │
│  (JWT+RLS)  │ (PostgreSQL)│  (Invoices) │ (process-invoice) │
└─────────────┴─────────────┴─────────────┴──────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Mailgun  │   │    AI    │   │   ERP    │
    │ Webhooks │   │  Gateway │   │  Export  │
    └──────────┘   └──────────┘   └──────────┘`}</pre>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Email Ingestion */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              2. Email Ingestion Pipeline
            </h2>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Email Format</h3>
                <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                  invoices+{"{tenant_id}"}@inbox.clarusap.com
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-3">email-ingest Edge Function Flow</h4>
                <div className="text-xs font-mono bg-white p-3 rounded border overflow-x-auto">
                  <pre>{`1. Mailgun POST → email-ingest Edge Function
   ├── Parse application/x-www-form-urlencoded
   ├── Extract recipient email → derive tenant_id
   └── Download MIME from storage.url

2. Parse MIME Message
   ├── Extract all attachments
   ├── Filter: PDF, PNG, JPG, JPEG, TIFF, ZIP
   └── TIFF → PNG conversion

3. ZIP Handling (Recursive)
   ├── Extract all files
   ├── Filter valid formats
   └── Process each file

4. Store Files
   └── invoices/{tenant_id}/{uuid}/{filename}

5. Trigger process-invoice
   └── For each stored file

6. Log to email_ingestion_logs
   └── to_email, from_email, subject, status`}</pre>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: AI Extraction */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              3. AI Extraction Engine
            </h2>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Model Configuration</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li><strong>Provider:</strong> AI Gateway</li>
                  <li><strong>Model:</strong> google/gemini-2.5-flash</li>
                  <li><strong>Capabilities:</strong> Multimodal (text + image)</li>
                  <li><strong>Max Tokens:</strong> 4096</li>
                </ul>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Extracted Fields</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded">invoice_number</div>
                  <div className="bg-gray-50 p-2 rounded">invoice_date</div>
                  <div className="bg-gray-50 p-2 rounded">due_date</div>
                  <div className="bg-gray-50 p-2 rounded">vendor_name</div>
                  <div className="bg-gray-50 p-2 rounded">vendor_tax_id</div>
                  <div className="bg-gray-50 p-2 rounded">vendor_bank_account</div>
                  <div className="bg-gray-50 p-2 rounded">vendor_email</div>
                  <div className="bg-gray-50 p-2 rounded">subtotal_amount</div>
                  <div className="bg-gray-50 p-2 rounded">tax_amount</div>
                  <div className="bg-gray-50 p-2 rounded">total_amount</div>
                  <div className="bg-gray-50 p-2 rounded">currency</div>
                  <div className="bg-gray-50 p-2 rounded">line_items[]</div>
                  <div className="bg-gray-50 p-2 rounded">po_number</div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Vendor Matching */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              4. Vendor Auto-Matching Algorithm
            </h2>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Matching Hierarchy</h3>
              <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2">
                <li><strong>Tax ID Match</strong> — Strongest identifier, exact match required</li>
                <li><strong>Bank Account Match</strong> — If no tax_id match found</li>
                <li><strong>Email Domain Match</strong> — If no bank account match</li>
                <li><strong>Fuzzy Name Match</strong> — Levenshtein distance / trigram similarity</li>
                <li><strong>Auto-Create</strong> — If all fail, create vendor with status='pending_verification', source='auto'</li>
              </ol>
            </div>
          </section>

          {/* Section 5: Variation Detection */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              5. Variation Detection Rules
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Rule</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Threshold</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Weight</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Critical?</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr><td className="border px-3 py-2">price_spike</td><td className="border px-3 py-2">&gt;30% from baseline</td><td className="border px-3 py-2">0.30</td><td className="border px-3 py-2">No</td></tr>
                  <tr><td className="border px-3 py-2">bank_change</td><td className="border px-3 py-2">Different bank account</td><td className="border px-3 py-2">0.50</td><td className="border px-3 py-2 text-red-600 font-bold">Yes</td></tr>
                  <tr><td className="border px-3 py-2">tax_mismatch</td><td className="border px-3 py-2">tax_id differs</td><td className="border px-3 py-2">0.40</td><td className="border px-3 py-2 text-red-600 font-bold">Yes</td></tr>
                  <tr><td className="border px-3 py-2">duplicate_invoice</td><td className="border px-3 py-2">Same inv number</td><td className="border px-3 py-2">0.30</td><td className="border px-3 py-2">No</td></tr>
                  <tr><td className="border px-3 py-2">billing_spike</td><td className="border px-3 py-2">&gt;3x volume/7 days</td><td className="border px-3 py-2">0.20</td><td className="border px-3 py-2">No</td></tr>
                  <tr><td className="border px-3 py-2">currency_change</td><td className="border px-3 py-2">Different currency</td><td className="border px-3 py-2">0.10</td><td className="border px-3 py-2">No</td></tr>
                  <tr><td className="border px-3 py-2">new_gl_code</td><td className="border px-3 py-2">GL not in history</td><td className="border px-3 py-2">0.10</td><td className="border px-3 py-2">No</td></tr>
                  <tr><td className="border px-3 py-2">line_item_outlier</td><td className="border px-3 py-2">&gt;40% from median</td><td className="border px-3 py-2">0.15</td><td className="border px-3 py-2">No</td></tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Critical variations (bank_change, tax_mismatch) automatically set invoice status to 'exception' and require manual Checker approval.
              </p>
            </div>
          </section>

          {/* Section 6: Export Pipeline */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              6. Export Pipeline Architecture
            </h2>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-xs font-mono bg-white p-3 rounded border overflow-x-auto">
                <pre>{`┌─────────────────────────────────────────────────────────────┐
│                     Export Pipeline                          │
└─────────────────────────────────────────────────────────────┘

1. scheduled-export (Cron: hourly)
   ├── Query approved invoices (exported_at IS NULL)
   ├── Group by tenant
   ├── Apply erp_field_mappings
   ├── Generate format (CSV/JSON/XML)
   ├── Upload to erp-exports bucket
   └── Insert erp_export_history

2. delivery-worker (Cron: every 15 min)
   ├── Query erp_delivery_queue (status='pending')
   ├── Attempt delivery (API/SFTP/Email)
   ├── Exponential backoff retry
   │   ├── Attempt 1: immediate
   │   ├── Attempt 2: +15 min
   │   ├── Attempt 3: +1 hour
   │   ├── Attempt 4: +6 hours
   │   └── Attempt 5: +24 hours
   └── Update push_status

3. erp-reconciliation-sftp (Cron: every 30 min)
   ├── Poll ERP SFTP outbound folder
   ├── Parse reconciliation files
   └── Update invoice.erp_status`}</pre>
              </div>
            </div>
          </section>

          {/* Section 7: Risk Scoring */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              7. Risk Scoring Models
            </h2>

            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Fraud Probability Model</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">Factor</th>
                    <th className="text-left py-1">Weight</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr><td>bank_account_change</td><td>0.30</td></tr>
                  <tr><td>amount_deviation_spike</td><td>0.20</td></tr>
                  <tr><td>duplicate_invoice_patterns</td><td>0.15</td></tr>
                  <tr><td>contract_expired</td><td>0.15</td></tr>
                  <tr><td>vendor_created_recently</td><td>0.10</td></tr>
                  <tr><td>tax_id_inconsistency</td><td>0.10</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 8: Database Schema */}
          <section className="mb-10 page-break-inside-avoid">
            <h2 className="text-2xl font-bold text-primary mb-4 pb-2 border-b-2 border-primary">
              8. Core Database Tables
            </h2>

            <div className="text-xs font-mono bg-gray-50 p-3 rounded">
              <pre>{`tenants, user_roles, profiles, vendors, invoices, 
invoice_line_items, invoice_anomalies, vendor_enrichment, 
vendor_contracts, vendor_baselines, vendor_risk_events,
erp_export_history, erp_delivery_queue, erp_field_mappings,
audit_logs, auto_approval_rules, tenant_erp_settings`}</pre>
            </div>
          </section>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t-2 border-red-500 text-center">
            <div className="bg-red-100 text-red-800 px-4 py-2 rounded mb-4 inline-block font-bold">
              CONFIDENTIAL - DO NOT DISTRIBUTE
            </div>
            <p className="text-sm text-gray-500">© {new Date().getFullYear()} Hyperwise LLC. Internal Use Only.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default InternalProcessFlow;