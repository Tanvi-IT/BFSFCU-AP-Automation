const _v = "2026-07-12-v1";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";

// Auth
import Auth from "./pages/Auth";

// Protected app pages
import InvoiceList from "./pages/InvoiceList";
import InvoiceUpload from "./pages/InvoiceUpload";
import InvoiceDetail from "./pages/InvoiceDetail";
import ExceptionQueue from "./pages/ExceptionQueue";
import VendorList from "./pages/VendorList";
import VendorDetail from "./pages/VendorDetail";
import PendingVendors from "./pages/PendingVendors";
import UserManagement from "./pages/poc/UserManagement";
import ERPMapping from "./pages/ERPMapping";
import ERPSettings from "./pages/ERPSettings";
import ExportHistory from "./pages/ExportHistory";
import ReconciliationEvents from "./pages/ReconciliationEvents";
import ERPMasterData from "./pages/ERPMasterData";
import ERPConnectors from "./pages/ERPConnectors";
import AuditConsole from "./pages/AuditConsole";
import SecuritySettings from "./pages/SecuritySettings";
import APIKeysSettings from "./pages/APIKeysSettings";
import WebhooksSettings from "./pages/WebhooksSettings";
import AutoApprovals from "./pages/AutoApprovals";
import CashFlowForecasting from "./pages/CashFlowForecasting";
import VendorRiskCenter from "./pages/VendorRiskCenter";
import EmailIngestionInstructions from "./pages/EmailIngestionInstructions";
import EmailRoutingDebugger from "./pages/EmailRoutingDebugger";
import InternalProcessFlow from "./pages/InternalProcessFlow";
import PublicProcessFlow from "./pages/PublicProcessFlow";
import NotFound from "./pages/NotFound";

// POC Mode pages
import ExceptionsQueue from "@/pages/poc/ExceptionsQueue";
import DeclinedQueue from "@/pages/poc/DeclinedQueue";
import HighConfidenceQueue from "./pages/poc/HighConfidenceQueue";
import HighConfidenceDetail from "./pages/poc/HighConfidenceDetail";
import LowConfidenceList from "./pages/poc/LowConfidenceList";
import LowConfidenceQueue from "./pages/poc/LowConfidenceQueue";
import ExceptionDetail from "./pages/poc/ExceptionDetail";
import AddOns from "./pages/poc/AddOns";
import AIAutomationSettings from "./pages/poc/AIAutomationSettings";
import AIProviderSettings from "./pages/poc/AIProviderSettings";
import POCDashboard from "./pages/poc/POCDashboard";
import POCUpload from "./pages/poc/POCUpload";
import AdminAuditLogs from "./pages/poc/AdminAuditLogs";
import POCDocumentation from "./pages/poc/POCDocumentation";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/auth" replace />} />

            {/* Auth */}
            <Route path="/auth" element={<AuthGate requireAuth={false}><Auth /></AuthGate>} />

            {/* Protected app pages */}
            {/*
              POCDashboard is the landing page — the queue-oriented view users
              know. /dashboard points at it so every existing link (post-login
              redirect, back buttons, quick actions) keeps working.
            */}
            <Route path="/dashboard" element={<AuthGate><POCDashboard /></AuthGate>} />
            <Route path="/invoices" element={<AuthGate><InvoiceList /></AuthGate>} />
            <Route path="/invoices/:id" element={<AuthGate><InvoiceDetail /></AuthGate>} />
            <Route path="/exceptions" element={<AuthGate><ExceptionQueue /></AuthGate>} />
            <Route path="/vendors" element={<AuthGate><VendorList /></AuthGate>} />
            <Route path="/vendors/:id" element={<AuthGate><VendorDetail /></AuthGate>} />
            <Route path="/vendors/pending" element={<AuthGate><PendingVendors /></AuthGate>} />
            <Route path="/erp-mapping" element={<AuthGate><ERPMapping /></AuthGate>} />
            <Route path="/settings/erp" element={<AuthGate><ERPSettings /></AuthGate>} />
            <Route path="/exports/history" element={<AuthGate><ExportHistory /></AuthGate>} />
            <Route path="/reconciliation/events" element={<AuthGate><ReconciliationEvents /></AuthGate>} />
            <Route path="/settings/erp/master-data" element={<AuthGate><ERPMasterData /></AuthGate>} />
            <Route path="/settings/erp/connectors" element={<AuthGate><ERPConnectors /></AuthGate>} />
            <Route path="/settings/audit" element={<AuthGate><AuditConsole /></AuthGate>} />
            <Route path="/settings/security" element={<AuthGate><SecuritySettings /></AuthGate>} />
            <Route path="/settings/api-keys" element={<AuthGate><APIKeysSettings /></AuthGate>} />
            <Route path="/settings/webhooks" element={<AuthGate><WebhooksSettings /></AuthGate>} />
            <Route path="/intelligence/auto-approvals" element={<AuthGate><AutoApprovals /></AuthGate>} />
            <Route path="/intelligence/cashflow" element={<AuthGate><CashFlowForecasting /></AuthGate>} />
            <Route path="/intelligence/vendor-risk" element={<AuthGate><VendorRiskCenter /></AuthGate>} />
            <Route path="/email-ingestion-instructions" element={<AuthGate><EmailIngestionInstructions /></AuthGate>} />
            <Route path="/email-routing-debugger" element={<AuthGate><EmailRoutingDebugger /></AuthGate>} />
            <Route path="/documentation/internal-process-flow" element={<AuthGate><InternalProcessFlow /></AuthGate>} />
            {/* Named "public" but gated like everything else — this is an internal tool. */}
            <Route path="/documentation/public-process-flow" element={<AuthGate><PublicProcessFlow /></AuthGate>} />

            {/* POC Mode Routes */}
            <Route path="/poc/dashboard" element={<AuthGate><POCDashboard /></AuthGate>} />
            <Route path="/poc/upload" element={<AuthGate><POCUpload /></AuthGate>} />
            <Route path="/poc/high-confidence" element={<AuthGate><HighConfidenceQueue /></AuthGate>} />
            <Route path="/poc/high-confidence/:id" element={<AuthGate><HighConfidenceDetail /></AuthGate>} />
            <Route path="/poc/low-confidence" element={<AuthGate><LowConfidenceList /></AuthGate>} />
            <Route path="/poc/low-confidence/:id" element={<AuthGate><LowConfidenceQueue /></AuthGate>} />
            <Route path="/poc/exceptions" element={<AuthGate><ExceptionsQueue /></AuthGate>} />
            <Route path="/poc/exceptions/:id" element={<AuthGate><ExceptionDetail /></AuthGate>} />
            <Route path="/poc/declined" element={<AuthGate><DeclinedQueue /></AuthGate>} />
            <Route path="/poc/trouble-team" element={<AuthGate><ExceptionsQueue /></AuthGate>} />
            <Route path="/poc/add-ons" element={<AuthGate><AddOns /></AuthGate>} />
            <Route path="/poc/settings/ai-automation" element={<AuthGate><AIAutomationSettings /></AuthGate>} />
            <Route path="/poc/settings/ai-provider" element={<AuthGate><AIProviderSettings /></AuthGate>} />
            <Route path="/poc/user-management" element={<AuthGate><UserManagement /></AuthGate>} />
            <Route path="/poc/admin/logs" element={<AuthGate><AdminAuditLogs /></AuthGate>} />
            <Route path="/poc/documentation" element={<AuthGate><POCDocumentation /></AuthGate>} />

            {/* Superadmin */}

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
